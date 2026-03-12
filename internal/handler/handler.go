// Package handler wires REST endpoints and the WebSocket upgrade handler.
package handler

import (
	"net/http"

	"synccast/internal/config"
	"synccast/internal/hub"
	"synccast/internal/store"
	"synccast/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Handler aggregates the dependencies shared across all HTTP handlers.
type Handler struct {
	hub      *hub.Hub
	store    *store.RoomStore
	userStore *store.UserStore
	log      logger.Logger
	cfg      *config.Config
	upgrader websocket.Upgrader
}

func New(h *hub.Hub, s *store.RoomStore, us *store.UserStore, log logger.Logger, cfg *config.Config) *Handler {
	return &Handler{
		hub:       h,
		store:     s,
		userStore: us,
		log:       log,
		cfg:       cfg,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  cfg.WSReadBufferSize,
			WriteBufferSize: cfg.WSWriteBufferSize,
			CheckOrigin: func(r *http.Request) bool {
				return true // restrict in production
			},
		},
	}
}

// RegisterRoutes attaches all API routes to the router group.
func (h *Handler) RegisterRoutes(r *gin.Engine) {
	v1 := r.Group("/api/v1")

	// Public routes
	auth := v1.Group("/auth")
	{
		auth.POST("/register", h.register)
		auth.POST("/login", h.login)
	}

	// Protected routes
	protected := v1.Group("/")
	protected.Use(AuthMiddleware(h.cfg.JWTSecret))
	{
		protected.GET("/auth/me", h.me)

		room := protected.Group("/room")
		room.POST("/create", h.createRoom)
		room.GET("/:id/info", h.getRoomInfo)
		room.DELETE("/:id", h.deleteRoom)
	}

	v1.GET("/version", h.getVersion)
	v1.GET("/extension/download", h.downloadExtension)

	// Serve Landing Page (at the root)
	r.StaticFile("/", "./web/index.html")
	r.Static("/assets", "./web/assets") 


	// WS is public for now, but room access can be checked in serveWS
	v1.GET("/ws/:room_id", h.serveWS)
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/room/create
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) createRoom(c *gin.Context) {
	username := c.GetString("username")
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	roomID := uuid.NewString()[:8] // short human-friendly room ID

	// 1. Create room in store
	if err := h.store.CreateRoom(c.Request.Context(), roomID, username); err != nil {
		h.log.Errorf("createRoom: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create room"})
		return
	}

	// 2. Associate room with user
	if err := h.userStore.AddRoomToUser(c.Request.Context(), username, roomID); err != nil {
		h.log.Errorf("createRoom associate: %v", err)
		// We don't fail the whole request if this fails, but it's not ideal
	}

	h.log.Infof("REST: room %s created by %s", roomID, username)
	c.JSON(http.StatusCreated, gin.H{
		"room_id": roomID,
		"host_id": username,
		"ws_url":  "/api/v1/ws/" + roomID,
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/room/:id/info
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) getRoomInfo(c *gin.Context) {
	roomID := c.Param("id")
	ctx := c.Request.Context()

	room, err := h.store.GetRoom(ctx, roomID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if room == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "room not found"})
		return
	}

	members, _ := h.store.GetMembers(ctx, roomID)
	playlist, _ := h.store.GetPlaylist(ctx, roomID)

	c.JSON(http.StatusOK, gin.H{
		"room_id":          roomID,
		"host_id":          room.HostID,
		"controller_id":    room.ControllerID,
		"is_locked":        room.IsLocked,
		"current_video_id": room.CurrentVideoID,
		"members":          members,
		"playlist":         playlist,
		"online_count":     h.hub.RoomSize(roomID),
	})
}
func (h *Handler) getVersion(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"version":    "1.0.1",
		"changelog":  "Mini Chat & Auto-Next added!",
		"update_url": "http://localhost:8080/api/v1/extension/download",
		"required":   false,
	})
}

func (h *Handler) downloadExtension(c *gin.Context) {
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", "attachment; filename=synccast_v1.0.1.zip")
	c.Header("Content-Type", "application/octet-stream")
	c.File("./extension/synccast.zip")
}
func (h *Handler) deleteRoom(c *gin.Context) {
	username := c.GetString("username")
	roomID := c.Param("id")
	if err := h.userStore.DeleteRoomFromUser(c.Request.Context(), username, roomID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete"})
		return
	}
	if h.hub.RoomSize(roomID) == 0 {
		_ = h.store.DeleteRoom(c.Request.Context(), roomID)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
