import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const children = [];
let shuttingDown = false;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function start(name, cmd, args, env = {}, options = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: options.shell ?? false,
    env: { ...process.env, ...env },
  });

  child.stdout.on("data", (buffer) => process.stdout.write(`[${name}] ${buffer}`));
  child.stderr.on("data", (buffer) => process.stderr.write(`[${name}] ${buffer}`));
  const entry = { child, exited: false };
  child.on("exit", (code) => {
    entry.exited = true;
    if (!shuttingDown) {
      console.error(`[dev] ${name} exited with code ${code}; shutting down`);
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
  if (process.platform === "win32") {
    cleanupWindowsDevProcesses();
    setTimeout(() => {
      for (const { child, exited } of children) {
        if (!exited && child.pid) {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            shell: false,
          });
        }
      }
      cleanupWindowsDevProcesses();
    }, 750);
  }
  setTimeout(() => process.exit(code), 2000);
}

function cleanupWindowsDevProcesses() {
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
      $_.CommandLine -like '*@vc/server*' -or
      $_.CommandLine -like '*@vc/web*' -or
      $_.CommandLine -like '*run-server-dev.mjs*' -or
      $_.CommandLine -like '*next*dev --port 3000*' -or
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

const isWindows = process.platform === "win32";
const pnpmExecPath = process.env.npm_execpath;
const pnpmCmd = pnpmExecPath ? process.execPath : isWindows ? "pnpm.cmd" : "pnpm";
const pnpmBaseArgs = pnpmExecPath ? [pnpmExecPath] : [];
const pnpmOptions = { shell: !pnpmExecPath && isWindows };

start("server", pnpmCmd, [...pnpmBaseArgs, "-F", "@vc/server", "dev"], {}, pnpmOptions);
start("web", pnpmCmd, [...pnpmBaseArgs, "-F", "@vc/web", "dev"], {}, pnpmOptions);
