import { spawn } from "node:child_process";

const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const env = { ...process.env };

for (const key of ["ALL_PROXY", "all_proxy", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
  if (env[key]?.toLowerCase().startsWith("socks")) {
    delete env[key];
  }
}

const child = spawn(
  "playwright",
  ["test", "-c", "playwright.config.ts", ...passthroughArgs],
  {
    env,
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
