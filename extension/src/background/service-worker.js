/**
 * SyncCast Background Service Worker
 *
 * Responsibilities:
 *  1. Manage the WebSocket connection lifecycle (connect / reconnect / keepalive)
 *  2. Route messages from Popup ↔ WebSocket ↔ Content Script
 *  3. Persist room state in chrome.storage.session so popup always gets fresh data
 *  4. Keep service worker alive via chrome.alarms (MV3 keepalive trick)
 */

import { API_BASE, WS_BASE, MSG, WS_OUT, STORAGE, ACTION, VERSION } from '../shared/constants.js'

// ─── State (in-memory, rebuilt from storage on SW restart) ───────────────────
let ws = null
let wsStatus = 'disconnected'   // 'connecting' | 'connected' | 'disconnected'
let reconnectTimer = null
let reconnectDelay = 1000       // starts at 1s, doubles up to 30s

let roomId   = null
let userId   = null
let userName = null
let jwtToken = null

// Room state mirror (kept in sync with every server push)
let roomState = {
  hostId:         null,
  controllerId:   null,
  isLocked:       false,
  currentVideoId: null,
  members:        [],
  playlist:       [],
  onlineCount:    0,
}

// ─── Keepalive alarm ─────────────────────────────────────────────────────────
chrome.alarms.create('sc_keepalive', { periodInMinutes: 0.4 })
chrome.alarms.create('sc_update',    { periodInMinutes: 30 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sc_keepalive') {
    if (roomId && userId && ws === null) {
      log('⏰ Alarm woke SW — reconnecting WS…')
      connectWS()
    }
  } else if (alarm.name === 'sc_update') {
    checkUpdate()
  }
})

// ─── Restore state from storage on SW restart ────────────────────────────────
async function restoreState() {
  const data = await chrome.storage.session.get([
    STORAGE.ROOM_ID, STORAGE.USER_ID, 'sc_user_name', STORAGE.ROOM_STATE,
    STORAGE.JWT_TOKEN, STORAGE.USERNAME,
  ])
  if (data[STORAGE.JWT_TOKEN]) {
    jwtToken = data[STORAGE.JWT_TOKEN]
    userName = data[STORAGE.USERNAME]
  }
  if (data[STORAGE.ROOM_ID]) {
    roomId   = data[STORAGE.ROOM_ID]
    userId   = data[STORAGE.USER_ID]
    if (data[STORAGE.ROOM_STATE]) roomState = data[STORAGE.ROOM_STATE]
    log('🔄 Restored state – reconnecting WS for room', roomId)
    connectWS()
  }
}
restoreState()
checkUpdate()

// ─── Message router (from Popup or Content Script) ───────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case MSG.LOGIN:
      handleAuth('login', msg.payload, sendResponse)
      return true
    
    case MSG.REGISTER:
      handleAuth('register', msg.payload, sendResponse)
      return true
    
    case MSG.LOGOUT:
      handleLogout()
      sendResponse({ ok: true })
      break

    case MSG.GET_USER:
      handleGetUser(sendResponse)
      return true

    case MSG.CREATE_ROOM:
      handleCreateRoom(msg.payload, sendResponse)
      return true   // keep channel open for async response

    case MSG.JOIN_ROOM:
      handleJoinRoom(msg.payload, sendResponse)
      return true

    case MSG.LEAVE_ROOM:
      handleLeaveRoom()
      sendResponse({ ok: true })
      break

    case MSG.DELETE_ROOM:
      handleDeleteRoom(msg.payload.roomId, sendResponse)
      return true

    case MSG.GET_STATE:
      sendResponse({ roomState, wsStatus, roomId, userId, username: userName, isLoggedIn: !!jwtToken })
      break

    case MSG.SEND_SYNC_STATE:
      wsSend({ type: 'SYNC_STATE', payload: msg.payload })
      sendResponse({ ok: true })
      break

    case MSG.ADD_QUEUE:
      wsSend({ type: 'ADD_QUEUE', payload: msg.payload })
      sendResponse({ ok: true })
      break

    case MSG.TRANSFER_CONTROL:
      wsSend({ type: 'TRANSFER_CONTROL', payload: msg.payload })
      sendResponse({ ok: true })
      break

    case MSG.SET_PERMISSION:
      wsSend({ type: 'SET_PERMISSION', payload: msg.payload })
      sendResponse({ ok: true })
      break

    // Content script reporting a video event (play / pause / seek)
    case MSG.VIDEO_EVENT:
      handleVideoEvent(msg.payload)
      break

    case MSG.REMOTE_CONTROL:
      forwardToContentScript({ ...msg.payload, remote: true })
      sendResponse({ ok: true })
      break

    case MSG.CHAT:
      wsSend({ type: WS_EVT.CHAT, payload: msg.payload })
      sendResponse({ ok: true })
      break

    case MSG.CHECK_UPDATE:
      checkUpdate()
      sendResponse({ ok: true })
      break
  }
})

// ─── Auth ────────────────────────────────────────────────────────────────────
async function handleAuth(type, { username, password }, sendResponse) {
  try {
    const res = await fetch(`${API_BASE}/auth/${type}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Auth failed')

    jwtToken = data.token
    userName = data.username
    userId   = data.username // use username as userId for simplicity

    await chrome.storage.session.set({
      [STORAGE.JWT_TOKEN]: jwtToken,
      [STORAGE.USERNAME]:  userName,
      [STORAGE.USER_ID]:   userId,
    })

    sendResponse({ ok: true, username: userName })
  } catch (err) {
    log(`${type} error:`, err)
    sendResponse({ ok: false, error: err.message })
  }
}

async function handleLogout() {
  jwtToken = userName = userId = null
  await chrome.storage.session.remove([STORAGE.JWT_TOKEN, STORAGE.USERNAME, STORAGE.USER_ID])
  handleLeaveRoom()
}

async function handleGetUser(sendResponse) {
  if (!jwtToken) {
    sendResponse({ ok: false, error: 'Not logged in' })
    return
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    })
    if (!res.ok) throw new Error('Failed to fetch user')
    const data = await res.json()
    sendResponse({ ok: true, user: data })
  } catch (err) {
    sendResponse({ ok: false, error: err.message })
  }
}

// ─── Room creation ────────────────────────────────────────────────────────────
async function handleCreateRoom(_, sendResponse) {
  if (!jwtToken) {
    sendResponse({ ok: false, error: 'Login required' })
    return
  }
  try {
    const res = await fetch(`${API_BASE}/room/create`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      // body is empty now as host_id is taken from JWT
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    const data = await res.json()

    roomId   = data.room_id
    userId   = data.host_id

    await persistSession()
    connectWS()

    sendResponse({ ok: true, roomId: data.room_id })
  } catch (err) {
    log('createRoom error:', err)
    sendResponse({ ok: false, error: err.message })
  }
}

// ─── Room join ────────────────────────────────────────────────────────────────
async function handleJoinRoom({ roomId: rid }, sendResponse) {
  // Verify room exists first
  try {
    const res = await fetch(`${API_BASE}/room/${rid}/info`, {
      headers: jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {}
    })
    if (!res.ok) throw new Error('Room not found')
    const data = await res.json()

    roomId   = rid
    // If logged in, use that userId, otherwise use what background had or prompt?
    // For now, let's assume userId is set during auth.
    if (!userId) {
       userId = `user_${crypto.randomUUID().slice(0, 8)}`
    }

    await persistSession()
    connectWS()

    sendResponse({ ok: true })
  } catch (err) {
    log('joinRoom error:', err)
    sendResponse({ ok: false, error: err.message })
  }
}

async function handleDeleteRoom(rid, sendResponse) {
  try {
    const res = await fetch(`${API_BASE}/room/${rid}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to delete')
    sendResponse({ ok: true })
  } catch (err) {
    sendResponse({ ok: false, error: err.message })
  }
}

// ─── Leave room ───────────────────────────────────────────────────────────────
function handleLeaveRoom() {
  wsClose()
  roomId = userId = userName = null
  roomState = resetRoomState()
  chrome.storage.session.clear()
  broadcastToPopup({ type: MSG.WS_STATUS, payload: { status: 'disconnected' } })
  broadcastToPopup({ type: MSG.STATE_UPDATE, payload: { roomState, roomId: null } })
}

// ─── WebSocket lifecycle ──────────────────────────────────────────────────────
function connectWS() {
  if (!roomId || !userId) return
  if (ws && ws.readyState < 2) return  // already open/connecting

  clearReconnectTimer()
  setWsStatus('connecting')

  const url = `${WS_BASE}/ws/${roomId}?user_id=${encodeURIComponent(userId)}&user_name=${encodeURIComponent(userName || userId)}`
  log('🔌 Connecting WS:', url)

  ws = new WebSocket(url)

  ws.onopen = () => {
    log('✅ WS connected')
    reconnectDelay = 1000
    setWsStatus('connected')
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleServerMessage(msg)
    } catch (e) {
      log('WS parse error:', e)
    }
  }

  ws.onclose = (ev) => {
    log(`⚡ WS closed (code=${ev.code})`)
    ws = null
    setWsStatus('disconnected')
    // Auto-reconnect if we're still in a room
    if (roomId) scheduleReconnect()
  }

  ws.onerror = (err) => {
    log('WS error:', err)
  }
}

function wsClose() {
  clearReconnectTimer()
  if (ws) {
    ws.onclose = null   // prevent auto-reconnect
    ws.close()
    ws = null
  }
  setWsStatus('disconnected')
}

function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function scheduleReconnect() {
  clearReconnectTimer()
  log(`🔄 Reconnect in ${reconnectDelay}ms…`)
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    connectWS()
  }, reconnectDelay)
}

function clearReconnectTimer() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

// ─── Server message handler ───────────────────────────────────────────────────
function handleServerMessage(msg) {
  log('📨 Server:', msg.type, msg.payload)

  switch (msg.type) {

    case WS_OUT.ROOM_STATE:
      mergeRoomState(msg.payload)
      saveRoomState()
      broadcastToPopup({ type: MSG.STATE_UPDATE, payload: { roomState, roomId, userId } })
      break

    case WS_OUT.USER_JOINED:
    case WS_OUT.USER_LEFT:
      if (msg.payload.members) roomState.members = msg.payload.members
      broadcastToPopup({ type: MSG.STATE_UPDATE, payload: { roomState } })
      break

    case WS_OUT.NEW_HOST:
      roomState.host_id = msg.payload.new_host_id
      broadcastToPopup({ type: MSG.STATE_UPDATE, payload: { roomState } })
      break

    case WS_OUT.PLAYLIST_UPDATED:
      roomState.playlist = msg.payload.playlist || []
      broadcastToPopup({ type: MSG.STATE_UPDATE, payload: { roomState } })
      break

    case WS_OUT.CHAT:
      broadcastToPopup({ type: MSG.CHAT, payload: msg.payload })
      break

    case WS_OUT.EXECUTE_ACTION:
      // Forward to active YouTube content script
      forwardToContentScript(msg.payload)
      break

    case WS_OUT.ERROR:
      log('Server Error:', msg.payload.message)
      break
  }

  // Always forward full state to popup
  saveRoomState()
  broadcastToPopup({ type: MSG.STATE_UPDATE, payload: { roomState, wsStatus, roomId, userId } })
}

function mergeRoomState(partial) {
  if (partial.host_id       != null) roomState.hostId         = partial.host_id
  if (partial.controller_id != null) roomState.controllerId   = partial.controller_id
  if (partial.is_locked     != null) roomState.isLocked       = partial.is_locked
  if (partial.current_video_id != null) roomState.currentVideoId = partial.current_video_id
  if (partial.playlist      != null) roomState.playlist       = partial.playlist
  if (partial.members       != null) roomState.members        = partial.members
}

// ─── Video event from content script ─────────────────────────────────────────
function handleVideoEvent({ action, currentTime, videoId, isAd }) {
  if (!roomId || !userId) return
  if (isAd) { log('Ad detected – skipping sync'); return }

  // Only send if we are the controller (or room is unlocked)
  const amController = !roomState.isLocked || roomState.controllerId === userId
  if (!amController) return

  // Auto-next logic: If video ended and we are the controller, try to play the next one
  if (action === 'ENDED') {
    const isCtrl = userId && roomState?.controller_id === userId
    if (isCtrl && roomState?.playlist?.length > 0) {
      setTimeout(() => {
        const nextVideo = roomState.playlist[0]
        wsSend({
          type: WS_EVT.SYNC_STATE,
          payload: { user_id: userId, action: ACTION.PLAY, current_time: 0, video_id: nextVideo.vid }
        })
      }, 500)
    }
    return
  }

  wsSend({
    type: 'SYNC_STATE', // Assuming WS_EVT.SYNC_STATE is 'SYNC_STATE'
    payload: { user_id: userId, action, current_time: currentTime, video_id: videoId },
  })
}

// ─── Forward EXECUTE_ACTION to content script ────────────────────────────────
async function forwardToContentScript(payload) {
  // Don't execute our own events
  if (payload.issued_by === userId) return

  try {
    // Cari semua tab youtube, tidak hanya yang aktif
    const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" })
    if (tabs.length === 0) return

    // Prepare mapped payload for content script (camelCase)
    const mapped = {
      action: payload.action,
      currentTime: payload.current_time,
      videoId: payload.video_id,
      issuedBy: payload.issued_by
    }

    // Kirim ke tab youtube pertama yang ditemukan
    chrome.tabs.sendMessage(tabs[0].id, { type: MSG.EXECUTE_ACTION, payload: mapped })
    
    // Jika ini perintah remote, teruskan sebagai REMOTE_CONTROL juga
    if (payload.remote) {
      chrome.tabs.sendMessage(tabs[0].id, { type: MSG.REMOTE_CONTROL, payload: mapped })
    }
  } catch (e) {
    log('forwardToContentScript error:', e)
  }
}

// ─── Push state to popup ─────────────────────────────────────────────────────
function broadcastToPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* Popup may be closed – that's fine */
  })
}

// ─── Storage helpers ─────────────────────────────────────────────────────────
async function persistSession() {
  await chrome.storage.session.set({
    [STORAGE.ROOM_ID]:    roomId,
    [STORAGE.USER_ID]:    userId,
    'sc_user_name':       userName,
  })
}

function saveRoomState() {
  chrome.storage.session.set({ [STORAGE.ROOM_STATE]: roomState })
}

// ─── WS status broadcast ─────────────────────────────────────────────────────
function setWsStatus(status) {
  wsStatus = status
  broadcastToPopup({ type: MSG.WS_STATUS, payload: { status } })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resetRoomState() {
  return {
    hostId: null, controllerId: null, isLocked: false,
    currentVideoId: null, members: [], playlist: [], onlineCount: 0,
  }
}

async function checkUpdate() {
  try {
    const res = await fetch(`${API_BASE}/version`)
    if (!res.ok) return
    const data = await res.json()
    
    if (data.version && data.version !== VERSION) {
      log('🚀 New version available:', data.version)
      
      // Auto-download logic
      const storageKey = `sc_downloaded_${data.version}`
      const hasDownloaded = await chrome.storage.local.get(storageKey)
      
      if (!hasDownloaded[storageKey]) {
        log('📦 Starting automatic update download…')
        chrome.downloads.download({
          url: data.update_url,
          filename: `synccast_v${data.version}.zip`,
          conflictAction: 'overwrite',
          saveAs: false
        }, async (downloadId) => {
           if (downloadId) {
             await chrome.storage.local.set({ [storageKey]: true })
             log('✅ Update ZIP downloaded automatically.')
           }
        })
      }

      broadcastToPopup({
        type: MSG.OTA_UPDATE,
        payload: {
          version: data.version,
          updateUrl: data.update_url,
          changelog: data.changelog,
          autoStarted: true
        }
      })
    } else {
      // Clear status if we are on latest
      broadcastToPopup({ type: MSG.OTA_UPDATE, payload: null })
    }
  } catch (err) {
    // Silent
  }
}

function log(...args) {
  console.log('[SyncCast SW]', ...args)
}
