package store

import (
	"context"
	"fmt"

	"synccast/internal/config"

	"github.com/redis/go-redis/v9"
)

// NewRedis creates and pings a Redis client.
func NewRedis(cfg config.RedisConfig) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		panic(fmt.Sprintf("redis: cannot connect to %s – %v", cfg.Addr, err))
	}

	return rdb
}
