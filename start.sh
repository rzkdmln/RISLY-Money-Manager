#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
echo "RISLY Money Manager -> http://127.0.0.1:8080 (Ctrl+C untuk berhenti)"
exec python3 -m http.server 8080 --bind 127.0.0.1

