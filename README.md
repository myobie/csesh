# claw

Launch and manage Claude Code sessions.

Wraps `claude` in [pty](https://github.com/myobie/pty) sessions with smart auto-continue/resume, project directory resolution from short names, and session listing.

## Requirements

- [pty](https://github.com/myobie/pty)
- [claude](https://docs.anthropic.com/en/docs/claude-code)
- [deno](https://deno.com) (only for development/compiling)

## Install

```
./install.sh
```

This compiles a standalone binary and copies it to `~/bin/claw`.

## Usage

### Launching sessions

```
claw                              # auto-detect: --continue if <12h, else --resume
claw --new                        # fresh session, no continue/resume
claw --resume                     # always show resume picker
```

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAW_PATH` | `~/src` | Root directory for project resolution |

### Project resolution

```
claw csesh                        # resolves ~/src/*/*/csesh
claw myobie/csesh                 # resolves ~/src/*/myobie/csesh
claw github.com/myobie/csesh      # resolves ~/src/github.com/myobie/csesh
claw --new csesh                  # fresh session in resolved project
```

### Listing sessions

```
claw sessions                     # list running sessions
claw sessions --json              # JSON output
claw sessions --all               # include non-running
```

### Remote control cycling

```
crc-cycle <pty-name>              # disconnect and reconnect remote control
crc-cycle --json <pty-name>       # JSON output
```

## How it works

- **Session discovery**: Finds running `claude` processes via `ps`, resolves their working directories with `lsof`, and cross-references with `~/.claude/projects/*/sessions-index.json` for metadata.
- **Project resolution**: Scans `~/src/` with progressive specificity — bare names search `~/src/*/*/<name>`, `org/repo` searches `~/src/*/org/repo`, and `host/org/repo` is a direct lookup. Errors on ambiguous matches.
- **Age-based continue/resume**: Reads the most recent non-sidechain session from `sessions-index.json`. If modified within the last 12 hours, uses `--continue`; otherwise uses `--resume`.
- **pty integration**: Every session runs inside a named `pty` session. If a session with that name already exists, `claw` attaches to it instead of creating a new one.
