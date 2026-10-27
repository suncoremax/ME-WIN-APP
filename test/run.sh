#!/bin/bash
# Reset the test DB, start the dev server, run the API test.
set -e
cd "$(dirname "$0")/.."
psql -h /tmp -p 5433 -U postgres -q -c "drop database if exists axtest with (force)" -c "create database axtest" 
psql -h /tmp -p 5433 -U postgres -d axtest -v ON_ERROR_STOP=1 -q -f schema.sql
fuser -k 3100/tcp >/dev/null 2>&1 || true
TEST_DATABASE_URL="postgres://postgres@localhost:5433/axtest?host=/tmp" node test/dev-server.js 3100 > /tmp/dev.log 2>&1 &
sleep 1.5
node test/api-test.js "$1" http://localhost:3100
