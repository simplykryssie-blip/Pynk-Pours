#!/usr/bin/env bash
# Local, disposable Postgres 16 for migration + security tests.
# Usage: scripts/db/local-pg.sh start|stop|status
# Never points at a hosted database.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA_DIR="${PP_PGDATA:-/tmp/pynkpours-local-pg}"
PORT="${PP_PGPORT:-54329}"
SOCK_DIR="/tmp"

as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

case "${1:-}" in
  start)
    if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
      mkdir -p "$DATA_DIR"
      [ "$(id -u)" = "0" ] && chown postgres:postgres "$DATA_DIR"
      as_pg "$PGBIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust --encoding=UTF8 >/dev/null
      cat >> "$DATA_DIR/postgresql.conf" <<CONF
listen_addresses = '127.0.0.1'
port = $PORT
unix_socket_directories = '$SOCK_DIR'
max_connections = 200
fsync = off
synchronous_commit = off
full_page_writes = off
timezone = 'UTC'
CONF
    fi
    if ! as_pg "$PGBIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      as_pg "$PGBIN/pg_ctl" -D "$DATA_DIR" -l "$DATA_DIR/server.log" -w start >/dev/null
    fi
    echo "Local Postgres running: postgres://postgres@127.0.0.1:$PORT/postgres"
    ;;
  stop)
    as_pg "$PGBIN/pg_ctl" -D "$DATA_DIR" -m fast stop || true
    ;;
  status)
    as_pg "$PGBIN/pg_ctl" -D "$DATA_DIR" status
    ;;
  *)
    echo "usage: $0 start|stop|status" >&2; exit 2;;
esac
