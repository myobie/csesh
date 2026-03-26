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
claw                              # continue most recent session (or start fresh)
claw --new                        # fresh session, no continue/resume
claw --resume                     # always show resume picker
claw --yolo                       # skip permissions (--dangerously-skip-permissions)
```

Any unrecognized flags are passed through to `claude`.

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

### Worktrees

```
claw worktree <branch>            # create worktree at ../<repo>--<branch>
claw worktree <branch> <repo>     # create worktree in a resolved project
claw wt <branch>                  # shorthand
```

If the branch already exists locally, the worktree checks it out. Otherwise, a new tracking branch is created (`--track -b`).

### Remote control cycling

```
crc-cycle <pty-name>              # disconnect and reconnect remote control
crc-cycle --json <pty-name>       # JSON output
```

## How it works

- **Session discovery**: Finds running `claude` processes via `ps`, resolves their working directories with `lsof`, and cross-references with `~/.claude/projects/*/sessions-index.json` for metadata.
- **Project resolution**: Scans `CLAW_PATH` (default `~/src`) with progressive specificity — bare names search `*/*/name`, `org/repo` searches `*/org/repo`, and `host/org/repo` is a direct lookup. Errors on ambiguous matches.
- **Auto-continue**: Always passes `--continue` by default, which continues the most recent session if one exists or starts fresh otherwise. Use `--resume` to pick from older sessions.
- **pty integration**: Every session runs inside a named `pty` session. If a running session with that name already exists, `claw` attaches to it. Exited pty sessions are automatically cleaned up and replaced with a fresh session.
