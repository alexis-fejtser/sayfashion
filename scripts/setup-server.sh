#!/usr/bin/env sh
set -eu

TARGET_PATH="${1:-/opt/sayfashion}"
DEPLOY_USER="${2:-root}"

if [ "$(id -u)" -ne 0 ]; then
  echo "setup-server.sh должен запускаться через root или sudo" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Автоустановка поддерживает Ubuntu/Debian. Установите Docker вручную." >&2
    exit 1
  fi
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  case "$ID" in
    ubuntu|debian) ;;
    *) echo "Автоустановка Docker поддерживает Ubuntu/Debian." >&2; exit 1 ;;
  esac
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  ARCH="$(dpkg --print-architecture)"
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

mkdir -p "$TARGET_PATH" "$TARGET_PATH/backups"
if id "$DEPLOY_USER" >/dev/null 2>&1; then
  chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$TARGET_PATH"
fi

echo "Сервер подготовлен: Docker $(docker --version)"
