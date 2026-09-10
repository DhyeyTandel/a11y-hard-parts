#!/usr/bin/env bash
# ES modules need an http origin; file:// blocks them with a CORS error.
cd "$(dirname "$0")" && exec python3 serve.py "${1:-8080}"
