// Package events centralises all WebSocket event type constants and payloads.
package events

// ──────────────────────────────────────────────────────────────────────────────
// Event type constants
// ──────────────────────────────────────────────────────────────────────────────

// Inbound – from client to BE
const (
	EvtJoinRoom        = "JOIN_ROOM"
	EvtSyncState       = "SYNC_STATE"
	EvtAddQueue        = "ADD_QUEUE"
	EvtTransferControl = "TRANSFER_CONTROL"
	EvtSetPermission   = "SET_PERMISSION"
	EvtChat            = "CHAT"
)

// Outbound – from BE to clients
const (
	EvtUserJoined      = "USER_JOINED"
	EvtUserLeft        = "USER_LEFT"
	EvtExecuteAction   = "EXECUTE_ACTION"
	EvtPlaylistUpdated = "PLAYLIST_UPDATED"
	EvtNewHost         = "NEW_HOST"
	EvtError           = "ERROR"
	EvtRoomState       = "ROOM_STATE"
)

// SYNC_STATE action values
const (
	ActionPlay  = "PLAY"
	ActionPause = "PAUSE"
	ActionSeek  = "SEEK"
)

// ──────────────────────────────────────────────────────────────────────────────
// Wire payload – generic envelope
// ──────────────────────────────────────────────────────────────────────────────

// Envelope is the top-level message format over the wire.
type Envelope struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

// ──────────────────────────────────────────────────────────────────────────────
// Inbound payloads
// ──────────────────────────────────────────────────────────────────────────────

type JoinRoomPayload struct {
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
}

type SyncStatePayload struct {
	UserID      string  `json:"user_id"`
	Action      string  `json:"action"`       // PLAY | PAUSE | SEEK
	CurrentTime float64 `json:"current_time"` // seconds
	VideoID     string  `json:"video_id"`
}

type AddQueuePayload struct {
	UserID  string `json:"user_id"`
	VideoID string `json:"video_id"`
	Title   string `json:"title"`
}

type TransferControlPayload struct {
	UserID       string `json:"user_id"`        // requester (must be current host)
	NewControlID string `json:"new_control_id"` // target user
}

type SetPermissionPayload struct {
	UserID   string `json:"user_id"` // must be host
	IsLocked bool   `json:"is_locked"`
}

// ──────────────────────────────────────────────────────────────────────────────
// Outbound payloads
// ──────────────────────────────────────────────────────────────────────────────

type UserPresencePayload struct {
	UserID   string   `json:"user_id"`
	UserName string   `json:"user_name"`
	Members  []string `json:"members"`
}

type ExecuteActionPayload struct {
	Action      string  `json:"action"`
	CurrentTime float64 `json:"current_time"`
	VideoID     string  `json:"video_id"`
	IssuedBy    string  `json:"issued_by"`
}

type PlaylistUpdatedPayload struct {
	Playlist []PlaylistItem `json:"playlist"`
}

type PlaylistItem struct {
	Vid   string `json:"vid"`
	ReqBy string `json:"req_by"`
	Title string `json:"title"`
}

type NewHostPayload struct {
	NewHostID string `json:"new_host_id"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ChatPayload struct {
	UserID    string `json:"user_id"`
	UserName  string `json:"user_name"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}
