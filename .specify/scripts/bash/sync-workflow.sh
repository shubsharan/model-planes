#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# This intentionally queries GitHub. Use sync-docs.sh for deterministic local synchronization.
"$SCRIPT_DIR/refresh-pr-status.sh"
"$SCRIPT_DIR/sync-docs.sh"
