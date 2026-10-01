#!/usr/bin/env sh
set -eu

PROJECT_PATH="${1:-/opt/sayfashion}"
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_DIR="$PROJECT_PATH/backups"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_PATH"
docker compose exec -T database pg_dump -U sayfashion -d sayfashion | gzip > "$BACKUP_DIR/sayfashion-$STAMP.sql.gz"
find "$BACKUP_DIR" -type f -name 'sayfashion-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "$BACKUP_DIR/sayfashion-$STAMP.sql.gz"
