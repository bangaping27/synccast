package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// RedisConfig holds Redis connection settings.
type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

// PostgresConfig holds PostgreSQL connection settings.
type PostgresConfig struct {
	DSN string
}

// Config is the top-level application configuration.
type Config struct {
	AppPort  string
	AppEnv   string
	Redis    RedisConfig
	Postgres PostgresConfig

	WSReadBufferSize  int
	WSWriteBufferSize int
	WSMaxMessageSize  int64

	RoomTTLSeconds int64
	JWTSecret      string
}

// Load reads the .env file (if present) and environment variables.
func Load() *Config {
	_ = godotenv.Load() // ignore error – env vars may already be set

	return &Config{
		AppPort: getEnv("APP_PORT", "8080"),
		AppEnv:  getEnv("APP_ENV", "development"),

		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},

		Postgres: PostgresConfig{
			DSN: getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5432/synccast?sslmode=disable"),
		},

		WSReadBufferSize:  getEnvInt("WS_READ_BUFFER_SIZE", 1024),
		WSWriteBufferSize: getEnvInt("WS_WRITE_BUFFER_SIZE", 1024),
		WSMaxMessageSize:  int64(getEnvInt("WS_MAX_MESSAGE_SIZE", 512)),

		RoomTTLSeconds: int64(getEnvInt("ROOM_TTL_SECONDS", 86400)),
		JWTSecret:      getEnv("JWT_SECRET", "super-secret-change-me"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
