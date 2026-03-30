import { basename } from "jsr:@std/path@^1.0";
import { resolveProject } from "./resolve.ts";

export interface LaunchOptions {
  repo?: string;
  new: boolean;
  resume: boolean;
  yolo: boolean;
  extraArgs: string[];
}

/** Launch claude in a pty session with smart continue/resume detection. */
export async function runLaunch(opts: LaunchOptions): Promise<never> {
  const projectDir = await resolveProject(opts.repo);
  const ptyName = basename(projectDir);

  // Check if a pty session with this name already exists
  const existingPty = await checkExistingPty(ptyName, projectDir);
  if (existingPty) {
    // Session exists and CWD matches — just attach
    const attach = new Deno.Command("pty", {
      args: ["attach", ptyName],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const result = await attach.output();
    Deno.exit(result.code);
  }

  // Build claude command
  const baseArgs = ["claude"];
  if (opts.yolo) baseArgs.push("--dangerously-skip-permissions");
  baseArgs.push(...opts.extraArgs);

  let shellCmd: string;
  if (opts.new) {
    shellCmd = baseArgs.join(" ");
  } else if (opts.resume) {
    shellCmd = [...baseArgs, "--resume"].join(" ");
  } else {
    // Try --continue, fall back to fresh session
    const continueCmd = [...baseArgs, "--continue"].join(" ");
    const freshCmd = baseArgs.join(" ");
    shellCmd = `${continueCmd} || ${freshCmd}`;
  }

  // Launch via pty
  const ptyArgs = ["pty", "run", "-a", ptyName, "--", "bash", "-c", shellCmd];
  const cmd = new Deno.Command(ptyArgs[0], {
    args: ptyArgs.slice(1),
    cwd: projectDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const result = await cmd.output();
  Deno.exit(result.code);
}

async function checkExistingPty(
  ptyName: string,
  projectDir: string,
): Promise<boolean> {
  try {
    const cmd = new Deno.Command("pty", {
      args: ["list", "--json"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await cmd.output();
    const text = new TextDecoder().decode(output.stdout);
    const sessions: { name: string; pid: number | null; command: string; status: string }[] =
      JSON.parse(text);

    const existing = sessions.find((s) => s.name === ptyName);
    if (!existing) return false;

    // If the pty session has exited, kill it and start fresh
    if (existing.status !== "running") {
      await killPty(ptyName);
      return false;
    }

    // Verify CWD matches
    const cwd = await resolvePtyCwd(existing.pid!);
    if (cwd && cwd !== projectDir && !cwd.startsWith(projectDir + "/")) {
      throw new Error(
        `pty session "${ptyName}" already exists but points to ${cwd}, not ${projectDir}.\n` +
          `Use a more specific name (e.g. org/repo) or stop the existing session.`,
      );
    }

    return true;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("pty session")) throw e;
    return false;
  }
}

async function killPty(name: string): Promise<void> {
  try {
    const cmd = new Deno.Command("pty", {
      args: ["kill", name],
      stdout: "null",
      stderr: "null",
    });
    await cmd.output();
  } catch {
    // ignore
  }
}

async function resolvePtyCwd(pid: number): Promise<string | null> {
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

