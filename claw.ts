import { listSessions, formatTable } from "./lib/sessions.ts";
import { runLaunch } from "./lib/launch.ts";

const HELP = `claw — launch and manage Claude Code sessions

Usage:
  claw                        Auto-detect: --continue if <12h, else --resume
  claw --new                  Fresh session, no continue/resume
  claw --resume               Always show resume picker
  claw <repo>                 Launch in a project directory
  claw sessions               List running sessions
  claw sessions --json        JSON output
  claw sessions --all         Include non-running sessions

Project resolution:
  claw csesh                  ~/src/*/*/csesh
  claw myobie/csesh           ~/src/*/myobie/csesh
  claw github.com/myobie/csesh  ~/src/github.com/myobie/csesh

Flags:
  -n, --new       Start a fresh session
  -r, --resume    Always show resume picker
  -j, --json      JSON output (sessions command)
  -a, --all       Include non-running (sessions command)
  -y, --yolo      Skip permissions (--dangerously-skip-permissions)
  -h, --help      Show this help

Any unrecognized flags are passed through to claude.

Environment:
  CLAW_PATH       Project root (default: ~/src)
`;

const CLAW_BOOLEANS: Record<string, string> = {
  "-n": "new", "--new": "new",
  "-r": "resume", "--resume": "resume",
  "-j": "json", "--json": "json",
  "-a": "all", "--all": "all",
  "-y": "yolo", "--yolo": "yolo",
  "-h": "help", "--help": "help",
};

const flags: Record<string, boolean> = {
  new: false, resume: false, json: false,
  all: false, yolo: false, help: false,
};
let subcommand: string | undefined;
const extraArgs: string[] = [];
let pastSeparator = false;

for (const arg of Deno.args) {
  if (pastSeparator) {
    extraArgs.push(arg);
    continue;
  }
  if (arg === "--") {
    pastSeparator = true;
    continue;
  }
  const mapped = CLAW_BOOLEANS[arg];
  if (mapped) {
    flags[mapped] = true;
  } else if (arg.startsWith("-")) {
    extraArgs.push(arg);
  } else if (!subcommand) {
    subcommand = arg;
  } else {
    extraArgs.push(arg);
  }
}

if (flags.help) {
  console.log(HELP);
  Deno.exit(0);
}

if (subcommand === "sessions") {
  const sessions = await listSessions({ all: flags.all });
  if (flags.json) {
    console.log(JSON.stringify(sessions, null, 2));
  } else if (sessions.length === 0) {
    if (flags.all) {
      console.log("No claude sessions found.");
    } else {
      console.log("No running claude sessions. Use --all to see all projects.");
    }
  } else {
    console.log(formatTable(sessions));
  }
} else {
  try {
    await runLaunch({
      repo: subcommand,
      new: flags.new,
      resume: flags.resume,
      yolo: flags.yolo,
      extraArgs,
    });
  } catch (e) {
    console.error((e as Error).message);
    Deno.exit(1);
  }
}
