#!/bin/bash
# Start OpenClaw gateway with proper proxy settings for V2Ray.
#
# Fixes: the @mariozechner/pi-ai module creates EnvHttpProxyAgent which
# cannot handle SOCKS proxy URLs from macOS system settings.
# Solution: explicitly set HTTP proxy env vars and unset SOCKS-related ones.
#
# Usage: ./scripts/start-gateway.sh [gateway args...]

export HTTP_PROXY=http://127.0.0.1:10808
export HTTPS_PROXY=http://127.0.0.1:10808
export NO_PROXY="localhost,127.0.0.1,::1"

# Prevent SOCKS proxy from being picked up
unset ALL_PROXY SOCKS_PROXY all_proxy socks_proxy

exec openclaw gateway run "$@"
