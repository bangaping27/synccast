package store

import (
	"database/sql"
	"time"

	"synccast/internal/config"
	"synccast/pkg/logger"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

func NewPostgres(cfg config.PostgresConfig, log logger.Logger) *sql.DB {
	db, err := sql.Open("postgres", cfg.DSN)
	if err != nil {
		log.Fatalf("postgres: could not open connection: %v", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Errorf("postgres: could not ping database: %v", err)
	}

	return db
}

func MigratePostgres(db *sql.DB, log logger.Logger) {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS rooms (
			id VARCHAR(16) PRIMARY KEY,
			host_username VARCHAR(255) NOT NULL REFERENCES users(username),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Fatalf("postgres: migration failed: %v", err)
		}
	}
	log.Info("✅ PostgreSQL migrations completed")

	seedDemoUser(db, log)
}

func seedDemoUser(db *sql.DB, log logger.Logger) {
	var exists bool
	err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username = 'demo')").Scan(&exists)
	if err != nil {
		log.Errorf("postgres: failed to check for demo user: %v", err)
		return
	}

	if !exists {
		hash, _ := bcrypt.GenerateFromPassword([]byte("demo123"), bcrypt.DefaultCost)
		_, err = db.Exec("INSERT INTO users (username, password_hash) VALUES ($1, $2)", "demo", string(hash))
		if err != nil {
			log.Errorf("postgres: failed to seed demo user: %v", err)
		} else {
			log.Info("✅ Demo user created: demo / demo123")
		}
	}
}
