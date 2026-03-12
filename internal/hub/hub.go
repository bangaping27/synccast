// Package hub manages all in-memory WebSocket client registrations and fan-out.
// The Hub is the central event dispatcher for a single BE instance.
// Cross-instance fan-out is handled via Redis Pub/Sub.
package hub

import (
	"context"
	"encoding/json"
	"sync"

	"synccast/internal/events"
	"synccast/internal/pubsub"
	"synccast/internal/store"
	"synccast/pkg/logger"
)

// ──────────────────────────────────────────────────────────────────────────────
// Client
// ──────────────────────────────────────────────────────────────────────────────

// Client represents one connected WebSocket session.
type Client struct {
	UserID   string
	UserName string
	RoomID   string
	send     chan []byte // buffered outbound channel
	hub      *Hub
}

// NewClient constructs a Client for the given user session. Called by the WebSocket handler.
func NewClient(userID, userName, roomID string, hub *Hub) *Client {
	return &Client{
		UserID:   userID,
		UserName: userName,
		RoomID:   roomID,
		send:     make(chan []byte, 256),
		hub:      hub,
	}
}

// Send enqueues a message for delivery to this client (non-blocking).
func (c *Client) Send(data []byte) {
	select {
	case c.send <- data:
	default:
		// slow consumer – skip
	}
}

// ReadCh returns the send channel (used by the WS writer goroutine).
func (c *Client) ReadCh() <-chan []byte { return c.send }

// Close drains and shuts down the client's send channel.
func (c *Client) Close() {
	close(c.send)
}

// ──────────────────────────────────────────────────────────────────────────────
// Hub
// ──────────────────────────────────────────────────────────────────────────────

type register struct {
	client *Client
}

type unregister struct {
	client *Client
}

type broadcast struct {
	roomID  string
	payload []byte
}

// Hub is the in-process fan-out manager.
type Hub struct {
	mu        sync.RWMutex
	rooms     map[string]map[string]*Client // roomID → userID → client
	register  chan register
	unregister chan unregister
	broadcast  chan broadcast
	done       chan struct{}

	store *store.RoomStore
	ps    *pubsub.PubSub
	log   logger.Logger
}

// New creates a new Hub.
func New(s *store.RoomStore, ps *pubsub.PubSub, log logger.Logger) *Hub {
	return &Hub{
		rooms:      make(map[string]map[string]*Client),
		register:   make(chan register, 64),
		unregister: make(chan unregister, 64),
		broadcast:  make(chan broadcast, 512),
		done:       make(chan struct{}),
		store:      s,
		ps:         ps,
		log:        log,
	}
}

// Run is the single-writer event loop. Must be called in a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case <-h.done:
			return

		case r := <-h.register:
			h.doRegister(r.client)

		case u := <-h.unregister:
			h.doUnregister(u.client)

		case b := <-h.broadcast:
			h.doBroadcast(b.roomID, b.payload)
		}
	}
}

// Shutdown signals the hub event loop to stop.
func (h *Hub) Shutdown() {
	close(h.done)
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API (called from handlers & pubsub)
// ──────────────────────────────────────────────────────────────────────────────

// Register adds a client to the hub and broadcasts USER_JOINED.
func (h *Hub) Register(c *Client) {
	h.register <- register{client: c}
}

// Unregister removes a client from the hub and triggers departure logic.
func (h *Hub) Unregister(c *Client) {
	h.unregister <- unregister{client: c}
}

// Broadcast sends a pre-serialised message to everyone in the room.
func (h *Hub) Broadcast(roomID string, data []byte) {
	h.broadcast <- broadcast{roomID: roomID, payload: data}
}

// BroadcastEvent serialises an envelope and enqueues it for broadcast.
func (h *Hub) BroadcastEvent(roomID, evtType string, payload interface{}) {
	h.log.Infof("hub: broadcasting %s to room %s", evtType, roomID)
	
	// 1. Broadcast to local clients in this instance
	env := events.Envelope{Type: evtType, Payload: payload}
	b, err := json.Marshal(env)
	if err != nil {
		h.log.Errorf("hub: marshal error: %v", err)
		return
	}
	h.Broadcast(roomID, b)

	// 2. Publish to Redis for other backend instances
	// We wrap in a pubsub.Message
	psMsg := pubsub.Message{
		RoomID:  roomID,
		Type:    evtType,
		Payload: nil, // We'll marshal the payload separately below
	}
	
	pBytes, _ := json.Marshal(payload)
	psMsg.Payload = pBytes

	ctx := context.Background()
	if err := h.ps.Publish(ctx, roomID, psMsg); err != nil {
		h.log.Errorf("hub: redis publish error: %v", err)
	}
}

// SendTo delivers a message to a single user within a room.
func (h *Hub) SendTo(roomID, userID string, evtType string, payload interface{}) {
	b, err := json.Marshal(events.Envelope{Type: evtType, Payload: payload})
	if err != nil {
		return
	}
	h.mu.RLock()
	clients := h.rooms[roomID]
	h.mu.RUnlock()

	if c, ok := clients[userID]; ok {
		c.Send(b)
	}
}

// Dispatch is called by the pubsub subscriber for cross-instance messages.
func (h *Hub) Dispatch(msg pubsub.Message) {
	// Re-serialise envelope so local clients receive the same JSON.
	env := events.Envelope{Type: msg.Type, Payload: msg.Payload}
	b, err := json.Marshal(env)
	if err != nil {
		h.log.Warnf("hub: dispatch marshal error: %v", err)
		return
	}
	h.Broadcast(msg.RoomID, b)
}

// RoomSize returns the number of live connections in a room.
func (h *Hub) RoomSize(roomID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[roomID])
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal event-loop helpers
// ──────────────────────────────────────────────────────────────────────────────

func (h *Hub) doRegister(c *Client) {
	h.mu.Lock()
	if h.rooms[c.RoomID] == nil {
		h.rooms[c.RoomID] = make(map[string]*Client)
	}
	h.rooms[c.RoomID][c.UserID] = c
	h.mu.Unlock()

	// Persist member in Redis
	ctx := context.Background()
	if err := h.store.AddMember(ctx, c.RoomID, c.UserID); err != nil {
		h.log.Errorf("hub: AddMember error: %v", err)
	}

	members, _ := h.store.GetMembers(ctx, c.RoomID)

	// Broadcast USER_JOINED
	h.BroadcastEvent(c.RoomID, events.EvtUserJoined, events.UserPresencePayload{
		UserID:   c.UserID,
		UserName: c.UserName,
		Members:  members,
	})

	h.log.Infof("hub: [%s] %s joined (room size=%d)", c.RoomID, c.UserID, len(h.rooms[c.RoomID]))
}

func (h *Hub) doUnregister(c *Client) {
	h.mu.Lock()
	if _, ok := h.rooms[c.RoomID][c.UserID]; ok {
		delete(h.rooms[c.RoomID], c.UserID)
		if len(h.rooms[c.RoomID]) == 0 {
			delete(h.rooms, c.RoomID)
		}
	}
	h.mu.Unlock()

	ctx := context.Background()
	if err := h.store.RemoveMember(ctx, c.RoomID, c.UserID); err != nil {
		h.log.Errorf("hub: RemoveMember error: %v", err)
	}

	// Broadcast USER_LEFT
	members, _ := h.store.GetMembers(ctx, c.RoomID)
	h.BroadcastEvent(c.RoomID, events.EvtUserLeft, events.UserPresencePayload{
		UserID:  c.UserID,
		Members: members,
	})

	// If room is now empty, delete it completely
	if len(members) == 0 {
		_ = h.store.DeleteRoom(ctx, c.RoomID)
		h.log.Infof("hub: room %s is empty, cleaned up", c.RoomID)
	} else {
		// Auto-election if the departing user was the host
		h.maybeElectNewHost(ctx, c.RoomID, c.UserID)
	}

	h.log.Infof("hub: [%s] %s left", c.RoomID, c.UserID)
}

func (h *Hub) doBroadcast(roomID string, data []byte) {
	h.mu.RLock()
	clients := h.rooms[roomID]
	h.mu.RUnlock()

	for _, c := range clients {
		c.Send(data)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto host-election
// ──────────────────────────────────────────────────────────────────────────────

func (h *Hub) maybeElectNewHost(ctx context.Context, roomID, departedUserID string) {
	room, err := h.store.GetRoom(ctx, roomID)
	if err != nil || room == nil {
		return
	}
	if room.HostID != departedUserID {
		return // departing user was not the host – nothing to do
	}

	newHost, err := h.store.GetFirstMember(ctx, roomID)
	if err != nil || newHost == "" {
		// Room is now empty – clean up Redis
		_ = h.store.DeleteRoom(ctx, roomID)
		h.log.Infof("hub: room %s is empty, cleaned up", roomID)
		return
	}

	if err := h.store.SetHost(ctx, roomID, newHost); err != nil {
		h.log.Errorf("hub: SetHost error: %v", err)
		return
	}
	// Also hand controller to new host if the previous host held it
	if room.ControllerID == departedUserID {
		_ = h.store.SetController(ctx, roomID, newHost)
	}

	h.log.Infof("hub: [%s] auto-elected new host → %s", roomID, newHost)

	h.BroadcastEvent(roomID, events.EvtNewHost, events.NewHostPayload{
		NewHostID: newHost,
	})
}
