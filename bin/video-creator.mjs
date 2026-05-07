#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

const pythonExe = isWindows
  ? path.join(repoRoot, "apps", "server", ".venv", "Scripts", "python.exe")
  : path.join(repoRoot, "apps", "server", ".venv", "bin", "python");

const pnpmExecPath = process.env.npm_execpath;
const pnpmCmd = pnpmExecPath ? process.execPath : isWindows ? "pnpm.cmd" : "pnpm";
const pnpmBaseArgs = pnpmExecPath ? [pnpmExecPath] : [];
const pnpmOptions = { shell: !pnpmExecPath && isWindows };

const children = [];
let shuttingDown = false;

function start(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...opts,
  });

  child.stdout.on("data", (buffer) => process.stdout.write(`[${name}] ${buffer}`));
  child.stderr.on("data", (buffer) => process.stderr.write(`[${name}] ${buffer}`));
  const entry = { child, exited: false };
  child.on("exit", (code) => {
    entry.exited = true;
    if (!shuttingDown) {
      console.error(`[launcher] ${name} exited (${code}); shutting down`);
      shutdown(code ?? 1);
    }
  });
  children.push(entry);
}

function shutdown(code) {
  shuttingDown = true;
  for (const { child, exited } of children) {
    if (!exited && !child.killed) child.kill("SIGINT");
  }
  if (isWindows) {
    cleanupWindowsLauncherProcesses();
    setTimeout(cleanupWindowsLauncherProcesses, 750);
  }
  setTimeout(() => process.exit(code), 1500);
}

function cleanupWindowsLauncherProcesses() {
  const escapedRepoRoot = repoRoot.replaceAll("'", "''");
  const script = `
$repoRoot = '${escapedRepoRoot}'
$selfPid = ${process.pid}
$processes = @(Get-CimInstance Win32_Process)
$targetIds = @($processes |
  Where-Object {
    $_.ProcessId -ne $selfPid -and
    $_.CommandLine -like "*$repoRoot*" -and
    (
      $_.CommandLine -like '*@vc/web*' -or
      $_.CommandLine -like '*next*start --port 3000*' -or
      $_.CommandLine -like '*python.exe -m server*'
    )
  } |
  Select-Object -ExpandProperty ProcessId)
$allIds = [System.Collections.Generic.HashSet[int]]::new()
function Add-ProcessTree([int] $processId) {
  if (-not $allIds.Add($processId)) { return }
  $processes |
    Where-Object { $_.ParentProcessId -eq $processId } |
    ForEach-Object { Add-ProcessTree $_.ProcessId }
}
$targetIds | ForEach-Object { Add-ProcessTree $_ }
$allIds |
  Where-Object { $_ -ne $selfPid } |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
`;
  spawn("powershell.exe", ["-NoProfile", "-Command", script], {
    stdio: "ignore",
    shell: false,
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGBREAK", () => shutdown(0));

console.log("[launcher] starting Video Creator...");

start("server", pythonExe, ["-m", "server"], {
  cwd: path.join(repoRoot, "apps", "server"),
});

start(
  "web",
  pnpmCmd,
  [...pnpmBaseArgs, "-F", "@vc/web", "start"],
  {
    cwd: repoRoot,
    shell: pnpmOptions.shell,
  },
);

async function waitForReady(maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (shuttingDown) return false;
    const [isSidecarReady, isWebReady] = await Promise.all([
      fetch("http://127.0.0.1:8787/health")
        .then((response) => response.ok)
        .catch(() => false),
      fetch("http://127.0.0.1:3000/")
        .then((response) => response.ok)
        .catch(() => false),
    ]);
    if (isSidecarReady && isWebReady) return true;
    await sleep(500);
  }
  return false;
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

waitForReady().then((ready) => {
  if (ready && !shuttingDown) {
    console.log("[launcher] ready - opening browser");
    openBrowser("http://localhost:3000");
  } else if (!shuttingDown) {
    console.error("[launcher] timed out waiting for servers; visit http://localhost:3000");
  }
});
