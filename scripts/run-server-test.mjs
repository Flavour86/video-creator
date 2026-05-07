import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(path.resolve(__dirname, ".."), "apps", "server");

const pythonExe =
  process.platform === "win32"
    ? path.join(serverDir, ".venv", "Scripts", "python.exe")
    : path.join(serverDir, ".venv", "bin", "python");

const child = spawn(pythonExe, ["-m", "pytest", "-q"], {
  cwd: serverDir,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
