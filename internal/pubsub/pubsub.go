// Package pubsub provides a Redis Pub/Sub adapter for cross-instance fan-out.
// Every BE instance that handles a room publishes playload to Redis channel,
// and all other instances (subscribed to the same channel) fan it out locally.
package pubsub

import (
	"context"
	"encoding/json"
	"fmt"

	"synccast/pkg/logger"

	"github.com/redis/go-redis/v9"
)

const channelPrefix = "synccast:room:"

// Message is the envelope exchanged over Redis Pub/Sub.
type Message struct {
	RoomID  string          `json:"room_id"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// Dispatcher is implemented by the Hub to receive cross-instance messages.
type Dispatcher interface {
	Dispatch(msg Message)
}

// PubSub wraps the Redis client for publish and subscribe operations.
type PubSub struct {
	rdb *redis.Client
	log logger.Logger
}

func New(rdb *redis.Client, log logger.Logger) *PubSub {
	return &PubSub{rdb: rdb, log: log}
}

// Publish serialises msg and publishes it on the room's Redis channel.
func (p *PubSub) Publish(ctx context.Context, roomID string, msg Message) error {
	b, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return p.rdb.Publish(ctx, channelKey(roomID), string(b)).Err()
}

// Subscribe blocks and relays every received message to the dispatcher.
// It subscribes to a wildcard pattern (psubscribe) so one goroutine covers
// all rooms regardless of how many are created.
func (p *PubSub) Subscribe(ctx context.Context, d Dispatcher) {
	ps := p.rdb.PSubscribe(ctx, fmt.Sprintf("%s*", channelPrefix))
	defer ps.Close()

	ch := ps.Channel()
	p.log.Info("pubsub: listening on pattern ", channelPrefix+"*")

	for {
		select {
		case <-ctx.Done():
			return
		case m, ok := <-ch:
			if !ok {
				return
			}
			var msg Message
			if err := json.Unmarshal([]byte(m.Payload), &msg); err != nil {
				p.log.Warnf("pubsub: malformed message: %v", err)
				continue
			}
			d.Dispatch(msg)
		}
	}
}

func channelKey(roomID string) string {
	return fmt.Sprintf("%s%s", channelPrefix, roomID)
}
