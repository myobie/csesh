# csesh

List running Claude Code sessions and reconnect remote control.

## Requirements

- bash, jq
- [pty](https://github.com/myobie/pty) (for `creconnect` and `ckeepalive`)

## Install

```
git clone https://github.com/myobie/csesh.git
```

Add to your PATH or run directly.

## Usage

```
csesh              # list running sessions
csesh --all        # include non-running projects
csesh --json       # JSON output

creconnect --all           # reconnect all disconnected sessions
creconnect duck            # reconnect one session (pty or project name)
creconnect --all --dry-run # preview what would reconnect

ckeepalive                 # reconnect all every 5 minutes (runs in foreground)
ckeepalive 120             # custom interval in seconds
```

## How it works

- Finds running `claude` processes via `ps` and resolves their working directories with `lsof`
- Reads `~/.claude/projects/*/sessions-index.json` for session metadata
- Detects remote control status via presence of `bridge-pointer.json`
- Builds remote control URLs from the `sessionId` field (`https://claude.ai/code/{sessionId}`)
- `creconnect` joins `csesh --json` with `pty list --json` on matching PIDs, then sends `/remote-control` to disconnected sessions
