import { basename, join } from "jsr:@std/path@^1.0";
import {
  encodePath,
  projectsDir,
  readBridgePointer,
  readSessionIndex,
} from "./claude.ts";

export interface SessionInfo {
  name: string;
  path: string;
  running: boolean;
  pid: number | null;
  ppid: number | null;
  tty: string | null;
  pty_name: string | null;
  remote_control: boolean;
  url: string | null;
  branch: string | null;
  messages: number;
  summary: string | null;
}

interface ProcessInfo {
  pid: number;
  ppid: number;
  tty: string;
  cwd: string;
}

interface PtySession {
  name: string;
  pid: number;
  command: string;
}

/** Find running claude processes and resolve their CWDs. */
async function findClaudeProcesses(): Promise<ProcessInfo[]> {
  const cmd = new Deno.Command("ps", {
    args: ["-eo", "pid,ppid,tty,args"],
    stdout: "piped",
    stderr: "null",
  });
  const output = await cmd.output();
  const text = new TextDecoder().decode(output.stdout);

  const candidates: { pid: number; ppid: number; tty: string }[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes("/claude")) continue;
    if (line.includes("deno")) continue;
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+/);
    if (match) {
      candidates.push({
        pid: parseInt(match[1]),
        ppid: parseInt(match[2]),
        tty: match[3],
      });
    }
  }

  // Resolve CWDs in parallel
  const results = await Promise.all(
    candidates.map(async (c) => {
      const cwd = await resolveCwd(c.pid);
      if (cwd) return { ...c, cwd };
      return null;
    }),
  );

  return results.filter((r): r is ProcessInfo => r !== null);
}

async function resolveCwd(pid: number): Promise<string | null> {
  try {
    const cmd = new Deno.Command("lsof", {
      args: ["-p", String(pid), "-Fn"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await cmd.output();
    const text = new TextDecoder().decode(output.stdout);
    for (const line of text.split("\n")) {
      if (line.startsWith("n/")) return line.slice(1);
    }
  } catch {
    // ignore
  }
  return null;
}

/** Get pty sessions running claude. */
async function getPtySessions(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const cmd = new Deno.Command("pty", {
      args: ["list", "--json"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await cmd.output();
    const text = new TextDecoder().decode(output.stdout);
    const sessions: PtySession[] = JSON.parse(text);
    for (const s of sessions) {
      if (s.command && s.command.includes("claude")) {
        map.set(s.pid, s.name);
      }
    }
  } catch {
    // pty not available
  }
  return map;
}

/** Get git branch for a directory. */
async function getGitBranch(dir: string): Promise<string | null> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["-C", dir, "branch", "--show-current"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await cmd.output();
    const branch = new TextDecoder().decode(output.stdout).trim();
    return branch || null;
  } catch {
    return null;
  }
}

export interface ListOptions {
  all?: boolean;
}

/** List claude sessions, matching the output of the old csesh script. */
export async function listSessions(opts: ListOptions = {}): Promise<SessionInfo[]> {
  const [processes, ppidPtyName] = await Promise.all([
    findClaudeProcesses(),
    getPtySessions(),
  ]);

  // Build PID lookup maps
  const pidToCwd = new Map<number, string>();
  const pidToTty = new Map<number, string>();
  const pidToPpid = new Map<number, number>();
  for (const p of processes) {
    pidToCwd.set(p.pid, p.cwd);
    pidToTty.set(p.pid, p.tty);
    pidToPpid.set(p.pid, p.ppid);
  }

  const entries: SessionInfo[] = [];
  const seenPaths = new Set<string>();

  // Iterate project directories
  const projDir = projectsDir();
  try {
    for await (const dirEntry of Deno.readDir(projDir)) {
      if (!dirEntry.isDirectory) continue;
      if (dirEntry.name === "memory") continue;

      const projectSubDir = join(projDir, dirEntry.name);

      // Get original path from sessions-index.json
      let originalPath: string | null = null;
      let sessionIndex: Awaited<ReturnType<typeof readSessionIndex>> = null;

      try {
        const indexText = await Deno.readTextFile(
          join(projectSubDir, "sessions-index.json"),
        );
        const parsed = JSON.parse(indexText);
        originalPath = parsed.originalPath ?? null;
        sessionIndex = parsed;
      } catch {
        // No index file — try matching by encoded CWD
        for (const [, cwd] of pidToCwd) {
          if (encodePath(cwd) === dirEntry.name) {
            originalPath = cwd;
            break;
          }
        }
      }

      if (!originalPath) continue;

      // Find matching running process
      let runningPid: number | null = null;
      for (const [pid, cwd] of pidToCwd) {
        if (cwd === originalPath || cwd.startsWith(originalPath + "/")) {
          runningPid = pid;
          break;
        }
      }

      if (runningPid === null && !opts.all) continue;

      seenPaths.add(originalPath);

      // Remote control
      let remoteControl = false;
      let url: string | null = null;
      try {
        const bridgeText = await Deno.readTextFile(
          join(projectSubDir, "bridge-pointer.json"),
        );
        const bridge = JSON.parse(bridgeText);
        remoteControl = true;
        if (bridge.sessionId) {
          url = `https://claude.ai/code/${bridge.sessionId}`;
        }
      } catch {
        // no bridge
      }

      // Session metadata
      let gitBranch: string | null = null;
      let msgCount = 0;
      let summary: string | null = null;

      if (sessionIndex?.entries?.length) {
        const sorted = [...sessionIndex.entries].sort((a, b) => {
          const ma = a.modified ?? "";
          const mb = b.modified ?? "";
          return ma < mb ? 1 : ma > mb ? -1 : 0;
        });
        const last = sorted[0];
        gitBranch = last.gitBranch ?? null;
        msgCount = last.messageCount ?? 0;
        summary = last.summary ?? last.firstPrompt ?? null;
      }

      // Fallback git branch
      if (!gitBranch) {
        gitBranch = await getGitBranch(originalPath);
      }

      let ppid: number | null = null;
      let tty: string | null = null;
      let ptyName: string | null = null;

      if (runningPid !== null) {
        ppid = pidToPpid.get(runningPid) ?? null;
        tty = pidToTty.get(runningPid) ?? null;
        if (ppid !== null) {
          ptyName = ppidPtyName.get(ppid) ?? null;
        }
      }

      entries.push({
        name: basename(originalPath),
        path: originalPath,
        running: runningPid !== null,
        pid: runningPid,
        ppid,
        tty,
        pty_name: ptyName,
        remote_control: remoteControl,
        url,
        branch: gitBranch,
        messages: msgCount,
        summary,
      });
    }
  } catch {
    // projects dir doesn't exist
  }

  // Orphan detection: running processes with no matching project dir
  for (const [pid, cwd] of pidToCwd) {
    let alreadySeen = false;
    for (const seen of seenPaths) {
      if (cwd === seen || cwd.startsWith(seen + "/")) {
        alreadySeen = true;
        break;
      }
    }
    if (!alreadySeen) {
      const ppid = pidToPpid.get(pid) ?? null;
      const ptyName = ppid !== null ? (ppidPtyName.get(ppid) ?? null) : null;
      entries.push({
        name: basename(cwd),
        path: cwd,
        running: true,
        pid,
        ppid,
        tty: pidToTty.get(pid) ?? null,
        pty_name: ptyName,
        remote_control: false,
        url: null,
        branch: null,
        messages: 0,
        summary: null,
      });
    }
  }

  // Sort: running first, then by name
  entries.sort((a, b) => {
    if (a.running !== b.running) return a.running ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

/** Format sessions as a human-readable table. */
export function formatTable(sessions: SessionInfo[]): string {
  if (sessions.length === 0) return "";
  const lines = sessions.map((s) => {
    const status = s.running ? "●" : "○";
    const branch = s.branch ?? "-";
    const urlStr = s.url ?? "-";
    const pidStr = s.pid ? `PID ${s.pid}` : "";
    const ppidStr = s.ppid ? `PPID ${s.ppid}` : "";
    const ttyStr = s.tty ?? "";
    return [status, s.name, branch, urlStr, pidStr, ppidStr, ttyStr]
      .join("\t");
  });
  return lines.join("\n");
}
