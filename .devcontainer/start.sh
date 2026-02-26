#!/bin/bash
# Codespace startup: pull images and start services in background
# so the terminal is usable immediately while Docker pulls happen.

set -e
cd /workspaces/SCP

echo "╔══════════════════════════════════════════╗"
echo "║  DemandIQ — starting services…           ║"
echo "║  This takes 2-3 min on first launch      ║"
echo "╚══════════════════════════════════════════╝"

# Ensure .env exists
[ -f .env ] || cp .env.example .env

# Start all services in the background
docker compose up -d &

echo ""
echo "Services are starting in the background."
echo "Run 'docker compose logs -f' to watch progress."
echo "UI → http://localhost:3000 (available after ~2 min)"
echo "API docs → http://localhost:8000/docs"
