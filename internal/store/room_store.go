package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"synccast/pkg/logger"

	"github.com/redis/go-redis/v9"
)

// ──────────────────────────────────────────────────────────────────────────────
// Key helpers
// ──────────────────────────────────────────────────────────────────────────────

func roomKey(roomID string) string     { return fmt.Sprintf("room:%s", roomID) }
func playlistKey(roomID string) string { return fmt.Sprintf("playlist:%s", roomID) }
func membersKey(roomID string) string  { return fmt.Sprintf("members:%s", roomID) }

// ──────────────────────────────────────────────────────────────────────────────
// Domain types stored in Redis
// ──────────────────────────────────────────────────────────────────────────────

// RoomState mirrors the Redis Hash room:{room_id}.
type RoomState struct {
	HostID         string `json:"host_id"`
	ControllerID   string `json:"controller_id"`
	IsLocked       bool   `json:"is_locked"`
	CurrentVideoID string `json:"current_video_id"`
}

// PlaylistItem is one entry in the playlist:{room_id} list.
type PlaylistItem struct {
	Vid   string `json:"vid"`
	ReqBy string `json:"req_by"`
	Title string `json:"title"`
}

// ──────────────────────────────────────────────────────────────────────────────
// RoomStore
// ──────────────────────────────────────────────────────────────────────────────

type RoomStore struct {
	rdb *redis.Client
	log logger.Logger
	ttl time.Duration
}

func NewRoomStore(rdb *redis.Client, log logger.Logger) *RoomStore {
	return &RoomStore{rdb: rdb, log: log, ttl: 24 * time.Hour}
}

// ─── Room ───────────────────────────────────────────────────────────────────

func (s *RoomStore) CreateRoom(ctx context.Context, roomID, hostID string) error {
	key := roomKey(roomID)
	pipe := s.rdb.TxPipeline()
	pipe.HSet(ctx, key,
		"host_id", hostID,
		"controller_id", hostID,
		"is_locked", "false",
		"current_video_id", "",
	)
	pipe.Expire(ctx, key, s.ttl)
	_, err := pipe.Exec(ctx)
	return err
}

func (s *RoomStore) GetRoom(ctx context.Context, roomID string) (*RoomState, error) {
	res, err := s.rdb.HGetAll(ctx, roomKey(roomID)).Result()
	if err != nil {
		return nil, err
	}
	if len(res) == 0 {
		return nil, nil // room not found
	}
	state := &RoomState{
		HostID:         res["host_id"],
		ControllerID:   res["controller_id"],
		IsLocked:       res["is_locked"] == "true",
		CurrentVideoID: res["current_video_id"],
	}
	return state, nil
}

func (s *RoomStore) SetHost(ctx context.Context, roomID, hostID string) error {
	return s.rdb.HSet(ctx, roomKey(roomID), "host_id", hostID).Err()
}

func (s *RoomStore) SetController(ctx context.Context, roomID, controllerID string) error {
	return s.rdb.HSet(ctx, roomKey(roomID), "controller_id", controllerID).Err()
}

func (s *RoomStore) SetLocked(ctx context.Context, roomID string, locked bool) error {
	val := "false"
	if locked {
		val = "true"
	}
	return s.rdb.HSet(ctx, roomKey(roomID), "is_locked", val).Err()
}

func (s *RoomStore) SetCurrentVideo(ctx context.Context, roomID, videoID string) error {
	return s.rdb.HSet(ctx, roomKey(roomID), "current_video_id", videoID).Err()
}

func (s *RoomStore) DeleteRoom(ctx context.Context, roomID string) error {
	pipe := s.rdb.TxPipeline()
	pipe.Del(ctx, roomKey(roomID))
	pipe.Del(ctx, playlistKey(roomID))
	pipe.Del(ctx, membersKey(roomID))
	_, err := pipe.Exec(ctx)
	return err
}

// ─── Members ─────────────────────────────────────────────────────────────────

func (s *RoomStore) AddMember(ctx context.Context, roomID, userID string) error {
	pipe := s.rdb.TxPipeline()
	pipe.SAdd(ctx, membersKey(roomID), userID)
	pipe.Expire(ctx, membersKey(roomID), s.ttl)
	_, err := pipe.Exec(ctx)
	return err
}

func (s *RoomStore) RemoveMember(ctx context.Context, roomID, userID string) error {
	return s.rdb.SRem(ctx, membersKey(roomID), userID).Err()
}

func (s *RoomStore) GetMembers(ctx context.Context, roomID string) ([]string, error) {
	return s.rdb.SMembers(ctx, membersKey(roomID)).Result()
}

func (s *RoomStore) MemberCount(ctx context.Context, roomID string) (int64, error) {
	return s.rdb.SCard(ctx, membersKey(roomID)).Result()
}

// GetFirstMember returns an arbitrary member (used for auto host-election).
func (s *RoomStore) GetFirstMember(ctx context.Context, roomID string) (string, error) {
	members, err := s.GetMembers(ctx, roomID)
	if err != nil || len(members) == 0 {
		return "", err
	}
	return members[0], nil
}

// ─── Playlist ────────────────────────────────────────────────────────────────

func (s *RoomStore) PushPlaylist(ctx context.Context, roomID string, item PlaylistItem) error {
	b, err := json.Marshal(item)
	if err != nil {
		return err
	}
	pipe := s.rdb.TxPipeline()
	pipe.RPush(ctx, playlistKey(roomID), string(b))
	pipe.Expire(ctx, playlistKey(roomID), s.ttl)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *RoomStore) GetPlaylist(ctx context.Context, roomID string) ([]PlaylistItem, error) {
	raw, err := s.rdb.LRange(ctx, playlistKey(roomID), 0, -1).Result()
	if err != nil {
		return nil, err
	}
	items := make([]PlaylistItem, 0, len(raw))
	for _, r := range raw {
		var it PlaylistItem
		if err := json.Unmarshal([]byte(r), &it); err == nil {
			items = append(items, it)
		}
	}
	return items, nil
}

func (s *RoomStore) PopPlaylist(ctx context.Context, roomID string) (*PlaylistItem, error) {
	raw, err := s.rdb.LPop(ctx, playlistKey(roomID)).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var item PlaylistItem
	if err := json.Unmarshal([]byte(raw), &item); err != nil {
		return nil, err
	}
	return &item, nil
}
