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

const ruff = spawn(pythonExe, ["-m", "ruff", "check", "server"], {
  cwd: serverDir,
  stdio: "inherit",
});
ruff.on("exit", (code) => {
  if (code !== 0) process.exit(code);
  const mypy = spawn(pythonExe, ["-m", "mypy", "server"], {
    cwd: serverDir,
    stdio: "inherit",
  });
  mypy.on("exit", (mypyCode) => process.exit(mypyCode ?? 0));
});
