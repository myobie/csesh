import { join } from "jsr:@std/path@^1.0";

const CLAUDE_DIR = join(Deno.env.get("HOME") ?? "", ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

export interface SessionEntry {
  sessionId: string;
  summary?: string;
  firstPrompt?: string;
  gitBranch?: string;
  messageCount?: number;
  modified?: string;
  isSidechain?: boolean;
}

export interface SessionIndex {
  originalPath: string;
  entries: SessionEntry[];
}

export interface BridgePointer {
  sessionId: string;
}

/** Encode a filesystem path the way Claude does for project directory names. */
export function encodePath(path: string): string {
  return path.replace(/[/.]/g, "-");
}

export function projectsDir(): string {
  return PROJECTS_DIR;
}

/** Read and parse sessions-index.json for a given project path. */
export async function readSessionIndex(
  projectPath: string,
): Promise<SessionIndex | null> {
  const encoded = encodePath(projectPath);
  const indexPath = join(PROJECTS_DIR, encoded, "sessions-index.json");
  try {
    const text = await Deno.readTextFile(indexPath);
    return JSON.parse(text) as SessionIndex;
  } catch {
    return null;
  }
}

/** Read and parse bridge-pointer.json for a given project path. */
export async function readBridgePointer(
  projectPath: string,
): Promise<BridgePointer | null> {
  const encoded = encodePath(projectPath);
  const bridgePath = join(PROJECTS_DIR, encoded, "bridge-pointer.json");
  try {
    const text = await Deno.readTextFile(bridgePath);
    return JSON.parse(text) as BridgePointer;
  } catch {
    return null;
  }
}