#!/usr/bin/env bash
# Demo: shows drift between the example and production files.
set -u
cd "$(dirname "$0")"
echo "== full diff =="
node ../bin/envdiff .env.example .env.production || true
echo
echo "== CI mode: only missing keys matter =="
node ../bin/envdiff .env.example .env.production --only-missing || true
echo
echo "== JSON, secrets still masked =="
node ../bin/envdiff .env.example .env.production --json || true
