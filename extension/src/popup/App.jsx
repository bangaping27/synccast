import { useState, useEffect, useCallback } from 'react'
import { MSG, STORAGE } from '../shared/constants'
import RoomSetup      from './components/RoomSetup'
import Auth           from './components/Auth'
import PresenceList   from './components/PresenceList'
import PlaylistPanel  from './components/PlaylistPanel'
import NowPlaying     from './components/NowPlaying'
import ControlPanel   from './components/ControlPanel'
import ChatPanel      from './components/ChatPanel'
import AboutPanel     from './components/AboutPanel'

// Tab IDs
const TABS = ['Room', 'Chat', 'Playlist', 'Members', 'About']

export default function App() {
  const [nickname, setNickname]   = useState('')
  const [wsStatus, setWsStatus]   = useState('disconnected')
  const [roomId,   setRoomId]     = useState(null)
  const [userId,   setUserId]     = useState(null)
  const [roomState, setRoomState] = useState(null)
  const [tab, setTab]             = useState('Room')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [myRooms, setMyRooms]   = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [toast, setToast]       = useState(null) // { msg, type }
  const [newVersion, setNewVersion] = useState(null) // { version, updateUrl, changelog }

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Load nickname from storage ────────────────────────────────────────────
  useEffect(() => {
    chrome.storage.local.get([STORAGE.NICKNAME]).then(d => {
      if (d[STORAGE.NICKNAME]) setNickname(d[STORAGE.NICKNAME])
    })
    // Request current state from background on mount
    chrome.runtime.sendMessage({ type: MSG.GET_STATE }, (res) => {
      if (chrome.runtime.lastError || !res) return
      applyState(res)
      if (res.isLoggedIn) fetchMyRooms()
    })
  }, [])

  async function fetchMyRooms() {
    const res = await sendMsg(MSG.GET_USER)
    if (res?.ok) setMyRooms(res.user.rooms || [])
  }

  // ── Persist nickname ─────────────────────────────────────────────────────
  const saveNickname = useCallback((name) => {
    setNickname(name)
    chrome.storage.local.set({ [STORAGE.NICKNAME]: name })
  }, [])

  // ── Listen for push updates from background ───────────────────────────────
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === MSG.STATE_UPDATE) applyState(msg.payload)
      if (msg.type === MSG.WS_STATUS)   setWsStatus(msg.payload.status)
      if (msg.type === MSG.CHAT) {
        setChatMessages(prev => [...prev, msg.payload].slice(-50))
      }
      if (msg.type === MSG.OTA_UPDATE) setNewVersion(msg.payload)
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  function applyState({ roomState: rs, wsStatus: wss, roomId: rid, userId: uid, username: uname, isLoggedIn: loggedIn } = {}) {
    if (rs  != null) setRoomState(rs)
    if (wss != null) setWsStatus(wss)
    if (rid != null) setRoomId(rid)
    if (uid != null) setUserId(uid)
    if (uname != null) setUsername(uname)
    if (loggedIn != null) setIsLoggedIn(loggedIn)
  }

  const isConnected = !!roomId
  const isHost      = userId && roomState?.host_id === userId
  const isCtrl      = userId && roomState?.controller_id === userId

  // ── Helpers ───────────────────────────────────────────────────────────────
  function sendMsg(type, payload = {}) {
    return new Promise(resolve =>
      chrome.runtime.sendMessage({ type, payload }, resolve)
    )
  }

  async function handleLogin(username, password) {
    const res = await sendMsg(MSG.LOGIN, { username, password })
    if (res?.ok) {
      setIsLoggedIn(true)
      setUsername(res.username)
      fetchMyRooms()
      showToast(`Welcome back, ${res.username}!`, 'success')
    } else {
      showToast(res?.error || 'Login failed', 'error')
    }
  }

  async function handleRegister(username, password) {
    const res = await sendMsg(MSG.REGISTER, { username, password })
    if (res?.ok) {
      setIsLoggedIn(true)
      setUsername(res.username)
      fetchMyRooms()
      showToast('Account created successfully!', 'success')
    } else {
      showToast(res?.error || 'Registration failed', 'error')
    }
  }

  function handleLogout() {
    sendMsg(MSG.LOGOUT)
    setIsLoggedIn(false)
    setUsername('')
    setRoomId(null)
    setRoomState(null)
    setMyRooms([])
    showToast('Logged out successfully')
  }

  async function handleCreateRoom() {
    const res = await sendMsg(MSG.CREATE_ROOM)
    if (res?.ok) { 
      setRoomId(res.roomId)
      setTab('Room')
      fetchMyRooms()
      showToast('Room created! 🚀', 'success')
    } else {
      showToast(res?.error || 'Failed to create room', 'error')
    }
  }

  async function handleJoinRoom(code) {
    const res = await sendMsg(MSG.JOIN_ROOM, { roomId: code.trim() })
    if (res?.ok) {
       showToast('Joined room successfully', 'success')
    } else {
       showToast(res?.error || 'Failed to join room', 'error')
    }
  }

  function handleLeaveRoom() {
    sendMsg(MSG.LEAVE_ROOM)
    setRoomId(null)
    setRoomState(null)
    setWsStatus('disconnected')
    setChatMessages([])
  }

  function handleSendChat(message) {
    sendMsg(MSG.CHAT, { message })
  }


  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-[380px] min-h-[520px] bg-[#0a0a1a] select-none">

      {/* ── OTA Update Banner ── */}
      {newVersion && (
        <div className="bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 flex items-center justify-between animate-slide-down">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-white/90">UPDATE AVAILABLE: v{newVersion.version}</span>
            <span className="text-[8px] text-white/70 italic truncate max-w-[200px]">{newVersion.changelog}</span>
          </div>
          <button 
            onClick={() => window.open(newVersion.updateUrl, '_blank')}
            className="bg-white text-violet-600 text-[10px] font-bold px-3 py-1 rounded-full shadow-lg active:scale-95 transition-transform"
          >
            Update
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <Header
        wsStatus={wsStatus}
        roomId={roomId}
        isConnected={isConnected}
        isLoggedIn={isLoggedIn}
        username={username}
        onLeave={handleLeaveRoom}
        onLogout={handleLogout}
      />

      {/* ── Nickname bar (always visible if logged in) ── */}
      {isLoggedIn && (
        <>
          {/* ── Toast Notification ── */}
          {toast && (
            <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-2xl z-50 flex items-center gap-2 animate-bounce-in border backdrop-blur-md ${
              toast.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-200' : 
              toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200' :
              'bg-violet-500/20 border-violet-500/50 text-violet-100'
            }`}>
              <span className="text-xs font-bold tracking-wide uppercase">
                {toast.type === 'error' ? '✖' : toast.type === 'success' ? '✔' : 'ℹ'}
              </span>
              <span className="text-xs font-medium">{toast.msg}</span>
            </div>
          )}
          <NicknameBar nickname={nickname || username} onChange={saveNickname} />
        </>
      )}

      {!isLoggedIn ? (
        <div className="flex-1 flex flex-col justify-center px-4 pb-4 animate-slide-up">
          <Auth onLogin={handleLogin} onRegister={handleRegister} />
        </div>
      ) : !isConnected ? (
        /* ── Not connected: Room setup ── */
        <div className="flex-1 flex flex-col justify-center px-4 pb-4 animate-slide-up">
          <RoomSetup
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            wsStatus={wsStatus}
            myRooms={myRooms}
          />
        </div>
      ) : (
        /* ── Connected: Main dashboard ── */
        <div className="flex flex-col flex-1 animate-fade-in">

          {/* Room ID pill */}
          <div className="mx-4 mb-2">
            <div className="glass px-3 py-2 flex items-center justify-between">
              <span className="text-white/40 text-xs font-medium">Room</span>
              <span
                className="font-mono text-sm font-bold text-violet-300 cursor-pointer hover:text-violet-200 transition-colors"
                onClick={() => navigator.clipboard.writeText(roomId)}
                title="Click to copy"
              >
                {roomId} 📋
              </span>
            </div>
          </div>

          {/* Now Playing */}
          {roomState?.currentVideoId && (
            <div className="px-4 mb-2">
              <NowPlaying
                videoId={roomState.currentVideoId}
                isCtrl={!roomState.isLocked || isCtrl}
                sendMsg={sendMsg}
              />
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 px-4 mb-2">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t
                    ? 'bg-violet-600/70 text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}
              >
                {t}
                {t === 'Members' && roomState?.members?.length > 0 && (
                  <span className="ml-1 badge bg-violet-900/60 text-violet-300">
                    {roomState.members.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {tab === 'Room' && (
              <ControlPanel
                isHost={isHost}
                isCtrl={isCtrl}
                roomState={roomState}
                userId={userId}
                sendMsg={sendMsg}
              />
            )}
            {tab === 'Chat' && (
              <ChatPanel
                messages={chatMessages}
                onSendMessage={handleSendChat}
                username={nickname || username}
              />
            )}
            {tab === 'Playlist' && (
              <PlaylistPanel
                playlist={roomState?.playlist || []}
                isHost={isHost}
                userId={userId}
                sendMsg={sendMsg}
              />
            )}
            {tab === 'Members' && (
              <PresenceList
                members={roomState?.members || []}
                hostId={roomState?.host_id}
                controllerId={roomState?.controller_id}
                myId={userId}
                isHost={isHost}
                onTransfer={(targetId) =>
                  sendMsg(MSG.TRANSFER_CONTROL, { user_id: userId, new_control_id: targetId })
                }
              />
            )}
            {tab === 'About' && (
              <AboutPanel 
                onToast={showToast} 
                newVersion={newVersion} 
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ wsStatus, roomId, isConnected, isLoggedIn, username, onLeave, onLogout }) {
  const statusColor = {
    connected:    'bg-emerald-400',
    connecting:   'bg-amber-400 animate-pulse',
    disconnected: 'bg-white/20',
  }[wsStatus] || 'bg-white/20'

  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-900/40">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7L8 5z"/>
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base tracking-tight bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent leading-none">
            SyncCast
          </span>
          {isLoggedIn && (
            <span className="text-[10px] text-white/30 truncate max-w-[80px]">
              @{username}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* WS status dot */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-white/40 text-[10px] capitalize">{wsStatus}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-1">
          {isConnected && (
            <button
              onClick={onLeave}
              className="text-white/30 hover:text-red-400 text-[10px] transition-colors px-1"
              title="Leave room"
            >
              ✕ Leave
            </button>
          )}
          {isLoggedIn && (
            <button
              onClick={onLogout}
              className="text-white/30 hover:text-red-400 text-[10px] transition-colors px-1"
              title="Logout"
            >
              ↪ Logout
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function NicknameBar({ nickname, onChange }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(nickname)

  useEffect(() => { setVal(nickname) }, [nickname])

  const save = () => {
    onChange(val.trim() || 'Anonymous')
    setEditing(false)
  }

  return (
    <div className="px-4 mb-3">
      {editing ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className="input flex-1"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="Your nickname…"
            maxLength={24}
          />
          <button onClick={save} className="btn-ghost px-3 text-emerald-400 border-emerald-500/30">✓</button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full text-left glass px-3 py-2 flex items-center gap-2 group hover:border-violet-500/40 transition-all"
        >
          <span className="text-lg">👤</span>
          <span className="text-sm text-white/70 group-hover:text-white flex-1 truncate">
            {nickname || <span className="text-white/30 italic">Set nickname…</span>}
          </span>
          <span className="text-white/20 text-xs group-hover:text-violet-400">✎</span>
        </button>
      )}
    </div>
  )
}
