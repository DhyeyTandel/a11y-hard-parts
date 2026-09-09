#!/usr/bin/env bash
# ES modules need an http origin; file:// blocks them with a CORS error.
cd "$(dirname "$0")" && python3 -m http.server "${1:-8080}"
