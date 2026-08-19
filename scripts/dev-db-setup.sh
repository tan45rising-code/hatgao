#!/usr/bin/env bash
# Provisions the local Postgres role + database for development.
# Safe to re-run — every statement is idempotent.
#
# Usage: ./scripts/dev-db-setup.sh
# Requires: a running local Postgres server, and the ability to run
# commands as the `postgres` OS/DB superuser (sudo -u postgres psql ...).

set -euo pipefail

DB_NAME="${HATGAO_DB_NAME:-hatgao_dev}"
DB_USER="${HATGAO_DB_USER:-hatgao}"
DB_PASSWORD="${HATGAO_DB_PASSWORD:-hatgao_dev_local}"

echo "Ensuring role '${DB_USER}' exists..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}' CREATEDB;"

echo "Ensuring database '${DB_NAME}' exists..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

echo "Done. Connection string:"
echo "  postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
echo ""
echo "Make sure .env.local's DATABASE_URL matches the line above, then run:"
echo "  npm run prisma:migrate"
