import { spawn } from "node:child_process";
import { resolve } from "node:path";

const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const env = { ...process.env };

for (const key of ["ALL_PROXY", "all_proxy", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
  if (env[key]?.toLowerCase().startsWith("socks")) {
    delete env[key];
  }
}

const playwrightCliPath = resolve(process.cwd(), "node_modules", "@playwright", "test", "cli.js");

const child = spawn(
  process.execPath,
  [playwrightCliPath, "test", "-c", "playwright.e2e.config.ts", ...passthroughArgs],
  {
    env,
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
