package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"synccast/internal/events"
	"synccast/internal/hub"
	"synccast/internal/store"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/ws/:room_id
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) serveWS(c *gin.Context) {
	roomID := c.Param("room_id")
	ctx := c.Request.Context()

	// Validate room exists
	room, err := h.store.GetRoom(ctx, roomID)
	if err != nil || room == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "room not found"})
		return
	}

	// User identity comes from query param (use JWT in production)
	userID := c.Query("user_id")
	userName := c.Query("user_name")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}
	if userName == "" {
		userName = userID
	}

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.log.Errorf("ws: upgrade error: %v", err)
		return
	}

	client := hub.NewClient(userID, userName, roomID, h.hub)
	h.hub.Register(client)

	// Deliver current room snapshot to the newly joined client
	h.pushRoomState(ctx, client, roomID, room)

	// Each client gets two goroutines: one for writing, one for reading.
	go h.writePump(conn, client)
	go h.readPump(conn, client, roomID)
}

// pushRoomState sends an initial ROOM_STATE snapshot to the connecting client.
func (h *Handler) pushRoomState(ctx context.Context, c *hub.Client, roomID string, room *store.RoomState) {
	playlist, _ := h.store.GetPlaylist(ctx, roomID)

	pItems := make([]events.PlaylistItem, 0, len(playlist))
	for _, p := range playlist {
		pItems = append(pItems, events.PlaylistItem{Vid: p.Vid, ReqBy: p.ReqBy, Title: p.Title})
	}

	b, _ := json.Marshal(events.Envelope{
		Type: events.EvtRoomState,
		Payload: map[string]interface{}{
			"host_id":          room.HostID,
			"controller_id":    room.ControllerID,
			"is_locked":        room.IsLocked,
			"current_video_id": room.CurrentVideoID,
			"playlist":         pItems,
		},
	})
	c.Send(b)
}

// ──────────────────────────────────────────────────────────────────────────────
// writePump – one goroutine per client
// Drains the client's send channel and forwards messages over the WebSocket.
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) writePump(conn *websocket.Conn, c *hub.Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.ReadCh():
			conn.SetWriteDeadline(time.Now().Add(writeWait)) //nolint:errcheck
			if !ok {
				// Hub closed the channel
				conn.WriteMessage(websocket.CloseMessage, []byte{}) //nolint:errcheck
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait)) //nolint:errcheck
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// readPump – one goroutine per client
// Reads incoming WebSocket messages and dispatches them to the event handler.
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) readPump(conn *websocket.Conn, c *hub.Client, roomID string) {
	defer func() {
		h.hub.Unregister(c)
		conn.Close()
	}()

	conn.SetReadLimit(int64(h.cfg.WSMaxMessageSize * 8)) // generous limit
	conn.SetReadDeadline(time.Now().Add(pongWait))       //nolint:errcheck
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait)) //nolint:errcheck
		return nil
	})

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure) {
				h.log.Warnf("ws: [%s] %s unexpected close: %v", roomID, c.UserID, err)
			}
			return // triggers deferred Unregister
		}

		var env events.Envelope
		if err := json.Unmarshal(raw, &env); err != nil {
			h.sendError(c, "INVALID_JSON", "malformed JSON envelope")
			continue
		}

		h.dispatch(context.Background(), c, roomID, env)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Event dispatcher
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) dispatch(ctx context.Context, c *hub.Client, roomID string, env events.Envelope) {
	payloadBytes, _ := json.Marshal(env.Payload)

	switch env.Type {

	// ── SYNC_STATE ──────────────────────────────────────────────────────────
	case events.EvtSyncState:
		var p events.SyncStatePayload
		if err := json.Unmarshal(payloadBytes, &p); err != nil {
			h.sendError(c, "BAD_PAYLOAD", "invalid SYNC_STATE payload")
			return
		}

		// Conflict resolution: if locked, only the controller may broadcast
		room, _ := h.store.GetRoom(ctx, roomID)
		if room != nil && room.IsLocked && room.ControllerID != c.UserID {
			h.log.Warnf("ws: [%s] %s SYNC_STATE rejected (not controller)", roomID, c.UserID)
			h.sendError(c, "FORBIDDEN", "you are not the controller for this room")
			return
		}

		if p.VideoID != "" && (room == nil || room.CurrentVideoID != p.VideoID) {
			_ = h.store.SetCurrentVideo(ctx, roomID, p.VideoID)
			// Broadcast partial state update so everyone's UI knows what's playing
			h.hub.BroadcastEvent(roomID, events.EvtRoomState, map[string]interface{}{
				"current_video_id": p.VideoID,
			})
		}

		h.hub.BroadcastEvent(roomID, events.EvtExecuteAction, events.ExecuteActionPayload{
			Action:      p.Action,
			CurrentTime: p.CurrentTime,
			VideoID:     p.VideoID,
			IssuedBy:    c.UserID,
		})

	// ── ADD_QUEUE ────────────────────────────────────────────────────────────
	case events.EvtAddQueue:
		var p events.AddQueuePayload
		if err := json.Unmarshal(payloadBytes, &p); err != nil {
			h.sendError(c, "BAD_PAYLOAD", "invalid ADD_QUEUE payload")
			return
		}

		item := store.PlaylistItem{Vid: p.VideoID, ReqBy: c.UserID, Title: p.Title}
		if err := h.store.PushPlaylist(ctx, roomID, item); err != nil {
			h.log.Errorf("ws: PushPlaylist: %v", err)
			h.sendError(c, "INTERNAL", "could not add to queue")
			return
		}

		// Auto-play if no video is currently playing
		room, _ := h.store.GetRoom(ctx, roomID)
		if room != nil && room.CurrentVideoID == "" {
			_ = h.store.SetCurrentVideo(ctx, roomID, p.VideoID)
			h.hub.BroadcastEvent(roomID, events.EvtRoomState, map[string]interface{}{
				"current_video_id": p.VideoID,
			})
			// Ask everyone to start playing this video
			h.hub.BroadcastEvent(roomID, events.EvtExecuteAction, events.ExecuteActionPayload{
				Action:      "PLAY",
				CurrentTime: 0,
				VideoID:     p.VideoID,
				IssuedBy:    "SYSTEM",
			})
		}

		playlist, _ := h.store.GetPlaylist(ctx, roomID)
		pItems := make([]events.PlaylistItem, 0, len(playlist))
		for _, it := range playlist {
			pItems = append(pItems, events.PlaylistItem{Vid: it.Vid, ReqBy: it.ReqBy, Title: it.Title})
		}

		h.hub.BroadcastEvent(roomID, events.EvtPlaylistUpdated, events.PlaylistUpdatedPayload{
			Playlist: pItems,
		})

	// ── CHAT ─────────────────────────────────────────────────────────────────
	case events.EvtChat:
		var p events.ChatPayload
		if err := json.Unmarshal(payloadBytes, &p); err != nil {
			return
		}

		// Fill in server-side data for security/consistency
		p.UserID = c.UserID
		p.UserName = c.UserName
		p.Timestamp = time.Now().Unix()

		h.hub.BroadcastEvent(roomID, events.EvtChat, p)

	// ── TRANSFER_CONTROL ─────────────────────────────────────────────────────
	case events.EvtTransferControl:
		var p events.TransferControlPayload
		if err := json.Unmarshal(payloadBytes, &p); err != nil {
			h.sendError(c, "BAD_PAYLOAD", "invalid TRANSFER_CONTROL payload")
			return
		}

		room, _ := h.store.GetRoom(ctx, roomID)
		if room == nil || room.HostID != c.UserID {
			h.sendError(c, "FORBIDDEN", "only the host can transfer control")
			return
		}

		if err := h.store.SetController(ctx, roomID, p.NewControlID); err != nil {
			h.log.Errorf("ws: SetController: %v", err)
			h.sendError(c, "INTERNAL", "could not transfer control")
			return
		}

		h.log.Infof("ws: [%s] control → %s (by host %s)", roomID, p.NewControlID, c.UserID)
		h.hub.BroadcastEvent(roomID, events.EvtRoomState, map[string]interface{}{
			"controller_id": p.NewControlID,
		})

	// ── SET_PERMISSION ────────────────────────────────────────────────────────
	case events.EvtSetPermission:
		var p events.SetPermissionPayload
		if err := json.Unmarshal(payloadBytes, &p); err != nil {
			h.sendError(c, "BAD_PAYLOAD", "invalid SET_PERMISSION payload")
			return
		}

		room, _ := h.store.GetRoom(ctx, roomID)
		if room == nil || room.HostID != c.UserID {
			h.sendError(c, "FORBIDDEN", "only the host can change permissions")
			return
		}

		if err := h.store.SetLocked(ctx, roomID, p.IsLocked); err != nil {
			h.log.Errorf("ws: SetLocked: %v", err)
			h.sendError(c, "INTERNAL", "could not update permission")
			return
		}

		h.log.Infof("ws: [%s] is_locked=%v (by host %s)", roomID, p.IsLocked, c.UserID)
		h.hub.BroadcastEvent(roomID, events.EvtRoomState, map[string]interface{}{
			"is_locked": p.IsLocked,
		})

	default:
		h.sendError(c, "UNKNOWN_EVENT", "unrecognised event type: "+env.Type)
		h.log.Warnf("ws: [%s] unknown event from %s: %s", roomID, c.UserID, env.Type)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) sendError(c *hub.Client, code, msg string) {
	b, _ := json.Marshal(events.Envelope{
		Type:    events.EvtError,
		Payload: events.ErrorPayload{Code: code, Message: msg},
	})
	c.Send(b)
}
