import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const generatedFiles = [
  "packages/shared-schemas/ts/index.ts",
  "packages/shared-schemas/py/schemas.py",
];

const pnpmExe = "pnpm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const before = new Map(
  generatedFiles.map((file) => [file, readFileSync(path.join(repoRoot, file), "utf-8")]),
);

run(pnpmExe, ["-F", "@vc/shared-schemas", "gen:ts"]);
run(pnpmExe, ["-F", "@vc/shared-schemas", "gen:py"]);

const stale = generatedFiles.filter(
  (file) => readFileSync(path.join(repoRoot, file), "utf-8") !== before.get(file),
);

if (stale.length > 0) {
  for (const file of stale) {
    console.error(`Schema output drift detected: ${file}`);
  }
  console.error("Generated schema outputs are stale. Re-run generators and commit the results.");
  process.exit(1);
}
