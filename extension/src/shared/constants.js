// ─────────────────────────────────────────────────────────────────────────────
// Shared constants used by popup, background service worker, and content script
// ─────────────────────────────────────────────────────────────────────────────

// ── Backend ───────────────────────────────────────────────────────────────────
export const API_BASE = 'http://localhost:8080/api/v1'
export const WS_BASE  = 'ws://localhost:8080/api/v1'
export const VERSION  = '1.0.1'

// ── WebSocket event types (mirrors backend events/events.go) ─────────────────

// Inbound (client → server)
export const WS_EVT = {
  SYNC_STATE:       'SYNC_STATE',
  ADD_QUEUE:        'ADD_QUEUE',
  TRANSFER_CONTROL: 'TRANSFER_CONTROL',
  SET_PERMISSION:   'SET_PERMISSION',
  CHAT:             'CHAT',                 // { message }
}

// Outbound (server → client)
export const WS_OUT = {
  USER_JOINED:      'USER_JOINED',
  USER_LEFT:        'USER_LEFT',
  EXECUTE_ACTION:   'EXECUTE_ACTION',
  PLAYLIST_UPDATED: 'PLAYLIST_UPDATED',
  NEW_HOST:         'NEW_HOST',
  ROOM_STATE:       'ROOM_STATE',
  ERROR:            'ERROR',
  CHAT:             'CHAT',                 // { user_id, user_name, message, timestamp }
}

// ── Internal chrome.runtime.sendMessage types ─────────────────────────────────

// Popup → Background
export const MSG = {
  // Room management
  CREATE_ROOM:      'SC_CREATE_ROOM',       // { hostId, hostName }
  JOIN_ROOM:        'SC_JOIN_ROOM',         // { roomId, userId, userName }
  LEAVE_ROOM:       'SC_LEAVE_ROOM',
  DELETE_ROOM:      'SC_DELETE_ROOM',       // { roomId }

  // Playback control
  SEND_SYNC_STATE:  'SC_SEND_SYNC_STATE',   // proxy WS event to server
  ADD_QUEUE:        'SC_ADD_QUEUE',
  TRANSFER_CONTROL: 'SC_TRANSFER_CONTROL',
  SET_PERMISSION:   'SC_SET_PERMISSION',

  // Auth
  LOGIN:            'SC_LOGIN',             // { username, password }
  REGISTER:         'SC_REGISTER',          // { username, password }
  LOGOUT:           'SC_LOGOUT',
  GET_USER:         'SC_GET_USER',
  CHAT:             'SC_CHAT',              // { message }
  CHECK_UPDATE:     'SC_CHECK_UPDATE',      // Manual trigger

  // State queries
  GET_STATE:        'SC_GET_STATE',         // → responds with RoomState snapshot

  // Background → Popup (push updates via chrome.runtime.sendMessage)
  STATE_UPDATE:     'SC_STATE_UPDATE',
  WS_STATUS:        'SC_WS_STATUS',         // { status: 'connected'|'disconnected'|'connecting' }
  OTA_UPDATE:       'SC_OTA_UPDATE',        // { version, updateUrl, changelog }

  // Background → Content Script
  EXECUTE_ACTION:   'SC_EXECUTE_ACTION',    // { action, currentTime, videoId }
  REMOTE_CONTROL:   'SC_REMOTE_CONTROL',    // { action } — from Popup to CS

  // Content Script → Background
  VIDEO_EVENT:      'SC_VIDEO_EVENT',       // { action, currentTime, videoId, isAd }
}

// ── Storage keys ──────────────────────────────────────────────────────────────
export const STORAGE = {
  NICKNAME:   'sc_nickname',
  ROOM_ID:    'sc_room_id',
  USER_ID:    'sc_user_id',
  ROOM_STATE: 'sc_room_state',
  JWT_TOKEN:  'sc_jwt_token',
  USERNAME:   'sc_username',
}

// ── SYNC_STATE action values ──────────────────────────────────────────────────
export const ACTION = {
  PLAY:  'PLAY',
  PAUSE: 'PAUSE',
  SEEK:  'SEEK',
}
