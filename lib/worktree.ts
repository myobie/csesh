import { basename, join } from "jsr:@std/path@^1.0";
import { resolveProject } from "./resolve.ts";

export interface WorktreeOptions {
  repo?: string;
  branch: string;
}

/** Create a git worktree with the naming convention <repo>--<branch>. */
export async function runWorktree(opts: WorktreeOptions): Promise<void> {
  const projectDir = await resolveProject(opts.repo);
  const repoName = basename(projectDir);
  const worktreePath = join(projectDir, "..", `${repoName}--${opts.branch}`);

  const branchExists = await localBranchExists(projectDir, opts.branch);

  const args = branchExists
    ? ["worktree", "add", worktreePath, opts.branch]
    : ["worktree", "add", "--track", "-b", opts.branch, worktreePath];

  const cmd = new Deno.Command("git", {
    args,
    cwd: projectDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const result = await cmd.output();

  if (!result.success) {
    Deno.exit(result.code);
  }

  console.log(`\nWorktree ready: ${worktreePath}`);
}

async function localBranchExists(
  cwd: string,
  branch: string,
): Promise<boolean> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["rev-parse", "--verify", `refs/heads/${branch}`],
      cwd,
      stdout: "null",
      stderr: "null",
    });
    const result = await cmd.output();
    return result.success;
  } catch {
    return false;
  }
}
