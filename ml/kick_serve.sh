#!/usr/bin/env bash
# Restart ml/serve.mjs under ml/serve_loop.sh (which starts it again within seconds, with serve.json re-read).
pkill -f '^node ml/serve.mjs'
