import { spawn } from "node:child_process";

const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const child = spawn(
  "playwright",
  ["test", "-c", "playwright.config.ts", ...passthroughArgs],
  {
    stdio: "inherit",
    shell: true,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
