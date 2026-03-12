package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"synccast/pkg/logger"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists   = errors.New("user already exists")
	ErrUserNotFound = errors.New("user not found")
)

type User struct {
	ID           int      `json:"id"`
	Username     string   `json:"username"`
	PasswordHash string   `json:"-"`
	RoomIDs      []string `json:"room_ids"`
}

type UserStore struct {
	db  *sql.DB
	log logger.Logger
}

func NewUserStore(db *sql.DB, log logger.Logger) *UserStore {
	return &UserStore{db: db, log: log}
}

func (s *UserStore) CreateUser(ctx context.Context, username, password string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	var id int
	err = s.db.QueryRowContext(ctx, 
		"INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id", 
		username, string(hash),
	).Scan(&id)

	if err != nil {
		if strings.Contains(err.Error(), "unique_violation") || strings.Contains(err.Error(), "duplicate key") {
			return nil, ErrUserExists
		}
		return nil, err
	}

	return &User{
		ID:       id,
		Username: username,
	}, nil
}

func (s *UserStore) GetUser(ctx context.Context, username string) (*User, error) {
	var user User
	err := s.db.QueryRowContext(ctx, 
		"SELECT id, username, password_hash FROM users WHERE username = $1", 
		username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	// Also fetch their rooms
	user.RoomIDs, _ = s.GetUserRooms(ctx, username)

	return &user, nil
}

func (s *UserStore) AddRoomToUser(ctx context.Context, username, roomID string) error {
	_, err := s.db.ExecContext(ctx, 
		"INSERT INTO rooms (id, host_username) VALUES ($1, $2)", 
		roomID, username,
	)
	return err
}

func (s *UserStore) GetUserRooms(ctx context.Context, username string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, 
		"SELECT id FROM rooms WHERE host_username = $1 ORDER BY created_at DESC", 
		username,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			rooms = append(rooms, id)
		}
	}
	return rooms, nil
}
