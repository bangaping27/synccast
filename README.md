# SyncCast — Maja Ecosystem 🎥🌌

Watch YouTube videos together with your friends in perfect sync. 
Built with **Go (Golang)** for a high-performance backend and a **React + Tailwind** modern Browser Extension (Manifest V3) for a seamless, built-in feeling experience inside the Maja OS ecosystem.

![SyncCast UI Concept](https://img.shields.io/badge/SyncCast-Maja_Ecosystem-7c3aed?style=for-the-badge)

---

## 🏗 Architecture

SyncCast is divided into two main components:

1. **Backend Engine (`cmd/server/`)**
   - High-throughput State Orchestrator written in Go.
   - **Real-time WebSocket protocol** (`gorilla/websocket`).
   - **Zero-downtime Horizontal Scaling** via Redis Pub/Sub (multiple Go instances can effortlessly share rooms).
   - In-memory processing for 0 latency broadcast. Redis handles data persistence (Room Hashes, Member Sets, and Queues with TTL).
   
2. **Browser Extension (`extension/`)**
   - **React 18 + Vite + CRXJS** for modern fast builds.
   - **Manifest V3 Compliant**: Smart Service Worker caching and keepalive alarms ensuring WebSocket connections rarely drop.
   - **Shadow DOM Injection**: Injects "Add to Queue" directly inside YouTube without CSS collisions.
   - **Ad-Detection Guard**: Automatically halts playback syncing if one user is force-watching a YouTube Ad. No forcing ads on others!

---

## 🚀 Quick Start (Local Development)

### 1. Start the Backend

Make sure you have **Go 1.22+** and **Docker** installed.

```bash
# Clone the repository and enter the root directory
cd e:\Stream

# Create your .env file
cp .env.example .env

# Spin up the Redis & PostgreSQL dependency
docker compose up redis postgres -d

# Run the Go Engine (Automated Migrations)
make run
# Or manually: go run cmd/server/main.go
```
The API and WebSocket server will now be listening on port `8080`.

### 2. Install & Start the Browser Extension

```bash
# Navigate to the extension folder
cd extension

# Install React dependencies
npm install

# Start the Vite Hot Module Replacement (HMR) server
npm run dev
```

### 3. Load the Extension into Chrome/Edge
1. Open your Chromium-based browser and navigate to `chrome://extensions/`.
2. Turn on **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `e:\Stream\extension\dist` directory.
5. The SyncCast purple icon will appear in your extension bar. Pin it!

---

## 👤 User Demo

Untuk keperluan testing, akun demo telah tersedia yang secara otomatis dibuat saat server dijalankan pertama kali (Auto-Migration):

- **Username**: `demo`
- **Password**: `demo123`

---

## 🎮 How to Use 

1. **Host a Room**: Click the SyncCast extension icon, enter a nickname, and click **Create New Room**. A Room Code will be generated (e.g. `2b8f9e1a`).
2. **Join a Room**: Share that code with a friend. They click the extension icon and enter the code to join.
3. **Queue a Video**: Open any YouTube video. A new button **"Add to Queue"** will magically appear below the YouTube player.
4. **Take Control**: By default, the Room Host controls the video timeline (The "Sound Master" 🎵). If the host pauses, it pauses for everyone. If the host seeks, it seeks for everyone.
5. **Transfer Power**: The Host can hover over another user's name in the popup's *Members* tab to click "**Give 🎵**" and hand over playback control.
6. **Smart Drag-and-Drop**: Inside the extension popup's *Playlist* tab, the Host can drag and drop videos to reorder the upcoming queue.

---

## 🧠 Core Systems Deep Dive

### The "Sound" Rule (Conflict Resolution)
If `room.is_locked = true`, the Backend absolutely refuses to broadcast `SYNC_STATE` packets unless they originate from the current `controller_id`. This prevents viewers from accidentally pausing the movie for everyone else if they click their own player.

### Auto Host-Election
If the Room Creator unexpectedly disconnects or closes their laptop:
- `onDisconnect` fires inside the Go Hub.
- The Redis Set `members:{room_id}` is evaluated.
- The Engine automatically promotes the next oldest connection to be the new `Host` and `Controller` seamlessly. The room never dies until everyone has left.

---

## 🛠 Commands Reference (Backend)

We use a simple `Makefile` located at the project root for rapid execution.

| Command | Action |
| --- | --- |
| `make run` | Starts the Go server locally. |
| `make build` | Compiles the engine into `/bin/synccast.exe` |
| `make tidy` | Downloads and verifies Go modules. |
| `make test` | Executes the test suite with `-race` detection. |
| `make docker-up` | Spins up the full backend (SyncCast Engine + Redis) inside Docker. |
| `make docker-down` | Tears the Docker containers down. |

---

## 🧑‍💻 Contributing / Future Roadmap
- [ ] Add chat box inside the extension popup.
- [ ] Add side-panel UI for Chromium (V3 feature) so the UI doesn't obscure the video.
- [ ] Netflix support.
- [x] Database persistence (PostgreSQL) — **DONE** ✅

<br/>
<p align="center">
  <i>Part of the Maja Ecosystem</i>
</p>
