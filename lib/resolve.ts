import { join, basename } from "jsr:@std/path@^1.0";

const SRC_DIR = Deno.env.get("CLAW_PATH") ?? join(Deno.env.get("HOME") ?? "", "src");

/** Resolve a short project name to a full directory path. */
export async function resolveProject(repo?: string): Promise<string> {
  if (!repo) return Deno.cwd();

  const parts = repo.split("/");

  if (parts.length === 3) {
    // host/org/repo — direct lookup
    const dir = join(SRC_DIR, parts[0], parts[1], parts[2]);
    await assertDir(dir, `Project not found: ${dir}`);
    return dir;
  }

  if (parts.length === 2) {
    // org/repo — scan ~/src/*/org/repo
    return await scanForMatch(
      `${parts[0]}/${parts[1]}`,
      async () => {
        const matches: string[] = [];
        for await (const host of Deno.readDir(SRC_DIR)) {
          if (!host.isDirectory) continue;
          const candidate = join(SRC_DIR, host.name, parts[0], parts[1]);
          if (await dirExists(candidate)) matches.push(candidate);
        }
        return matches;
      },
    );
  }

  // bare name — scan ~/src/*/*/name
  return await scanForMatch(
    repo,
    async () => {
      const matches: string[] = [];
      for await (const host of Deno.readDir(SRC_DIR)) {
        if (!host.isDirectory) continue;
        const hostPath = join(SRC_DIR, host.name);
        for await (const org of Deno.readDir(hostPath)) {
          if (!org.isDirectory) continue;
          const candidate = join(hostPath, org.name, repo);
          if (await dirExists(candidate)) matches.push(candidate);
        }
      }
      return matches;
    },
  );
}

async function scanForMatch(
  name: string,
  finder: () => Promise<string[]>,
): Promise<string> {
  const matches = await finder();
  if (matches.length === 0) {
    throw new Error(`No project found matching "${name}"`);
  }
  if (matches.length > 1) {
    const list = matches.map((m) => `  ${m}`).join("\n");
    throw new Error(
      `Ambiguous project "${name}" — multiple matches:\n${list}\nBe more specific (e.g. org/repo or host/org/repo).`,
    );
  }
  return matches[0];
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

async function assertDir(path: string, message: string): Promise<void> {
  if (!(await dirExists(path))) {
    throw new Error(message);
  }
}
