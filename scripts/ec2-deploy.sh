#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/cambliss/webrtc-meet.git}"
BRANCH="${BRANCH:-master}"
APP_DIR="${APP_DIR:-/opt/video-meeting-app}"
ENV_FILE="${ENV_FILE:-/opt/video-meeting-app/.env.production.local}"
APPLY_SCHEMA="${APPLY_SCHEMA:-false}"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is required but not installed."
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd git
require_cmd docker
require_cmd curl

mkdir -p "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  echo "Updating repository in $APP_DIR..."
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  echo "Cloning repository into $APP_DIR..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it first, for example:"
  echo "  cp .env.production.example $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Building and starting containers..."
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" build
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" up -d --remove-orphans

if [[ "$APPLY_SCHEMA" == "true" ]]; then
  echo "Applying DB schema from db/schema.sql..."
  if [[ -z "${DB_NAME:-}" ]]; then
    echo "DB_NAME is not set in $ENV_FILE"
    exit 1
  fi
  cat db/schema.sql | "${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" exec -T postgres psql -U postgres -d "$DB_NAME"
fi

echo "Waiting for health checks..."
for i in {1..40}; do
  if curl -fsS http://localhost:3000 >/dev/null 2>&1 && curl -fsS http://localhost:4000/health >/dev/null 2>&1; then
    echo "Deployment healthy."
    "${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" ps
    exit 0
  fi
  sleep 3
  echo "Health check retry $i/40..."
done

echo "Health checks failed. Recent logs:"
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" logs --tail=120 web signaling postgres
exit 1
