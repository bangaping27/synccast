package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"synccast/internal/config"
	"synccast/internal/handler"
	"synccast/internal/hub"
	"synccast/internal/pubsub"
	"synccast/internal/store"
	"synccast/pkg/logger"

	"github.com/gin-gonic/gin"
)

func main() {
	// ──────────────────────────────────────────
	// Bootstrap
	// ──────────────────────────────────────────
	cfg := config.Load()
	log := logger.New(cfg.AppEnv)
	defer log.Sync() //nolint:errcheck

	log.Info("🚀 SyncCast engine starting…")

	// ──────────────────────────────────────────
	// Infrastructure
	// ──────────────────────────────────────────
	redisClient := store.NewRedis(cfg.Redis)
	postgresDB := store.NewPostgres(cfg.Postgres, log)
	store.MigratePostgres(postgresDB, log)

	roomStore := store.NewRoomStore(redisClient, log)
	userStore := store.NewUserStore(postgresDB, log)
	ps := pubsub.New(redisClient, log)

	// ──────────────────────────────────────────
	// Hub (in-memory fan-out per room)
	// ──────────────────────────────────────────
	roomHub := hub.New(roomStore, ps, log)
	go roomHub.Run()

	// Subscribe to cross-instance Redis Pub/Sub
	go ps.Subscribe(context.Background(), roomHub)

	// ──────────────────────────────────────────
	// HTTP / Router & Production Mode
	// ──────────────────────────────────────────
	// Support both "production" and "release" as production environments
	if cfg.AppEnv == "production" || cfg.AppEnv == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(corsMiddleware())
	r.Use(requestLogger(log))

	h := handler.New(roomHub, roomStore, userStore, log, cfg)
	h.RegisterRoutes(r)

	// Health
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "ts": time.Now().Unix()})
	})

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.AppPort),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// ──────────────────────────────────────────
	// Graceful shutdown
	// ──────────────────────────────────────────
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Infof("✨ SyncCast engine is live and kicking!")
		log.Infof("🌍 Base URL: %s", cfg.AppBaseURL)
		log.Infof("📡 Listening on port %s", cfg.AppPort)

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-sigCh
	log.Info("🛑 Shutdown signal received, draining…")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Errorf("shutdown error: %v", err)
	}

	roomHub.Shutdown()
	log.Info("✅ SyncCast engine stopped cleanly.")
}

// ──────────────────────────────────────────────────────────────────────────────
// Middleware helpers
// ──────────────────────────────────────────────────────────────────────────────

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-User-Id")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func requestLogger(log logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Infof("%s %s → %d (%s)", c.Request.Method, c.Request.URL.Path,
			c.Writer.Status(), time.Since(start))
	}
}
