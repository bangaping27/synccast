#!/bin/bash

# ──────────────────────────────────────────────────────────────────────────────
# SyncCast Deployment Script (PM2 Edition)
# ──────────────────────────────────────────────────────────────────────────────

APP_NAME="synccast"
BINARY_NAME="synccast_bin"
PORT=$(grep APP_PORT .env | cut -d '=' -f2)

echo "🚀 Starting deployment for $APP_NAME..."

# 1. Pull latest changes (optional, uncomment if using git)
# echo "📥 Pulling latest code..."
# git pull origin main

# 2. Build Backend
echo "🔨 Building Go backend..."
go build -o $BINARY_NAME ./cmd/server/main.go

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Deployment aborted."
    exit 1
fi

echo "✅ Build successful."

# 3. Check for PM2 and Restart
echo "🔄 Restarting $APP_NAME with PM2..."

if pm2 list | grep -q "$APP_NAME"; then
    echo "♻️ Existing process found, restarting..."
    pm2 restart $APP_NAME
else
    echo "🆕 Starting new PM2 process..."
    # We use --interpreter none because This is a binary, not a script
    pm2 start ./$BINARY_NAME --name "$APP_NAME" --interpreter none
fi

# 4. Save PM2 state
pm2 save

echo "──────────────────────────────────────────────────────────────────────────────"
echo "✅ DEPLOYMENT COMPLETE!"
echo "📡 App is running on port: $PORT"
echo "📊 Type 'pm2 status' to see all processes"
echo "📝 Type 'pm2 logs $APP_NAME' to see logs"
echo "──────────────────────────────────────────────────────────────────────────────"
