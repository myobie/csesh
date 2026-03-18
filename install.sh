#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Compiling claw..."
deno compile --allow-env --allow-read --allow-run \
  --output "${SCRIPT_DIR}/claw" "${SCRIPT_DIR}/claw.ts"
mkdir -p "${HOME}/bin"
cp "${SCRIPT_DIR}/claw" "${HOME}/bin/claw"
echo "Installed claw to ~/bin/claw"
