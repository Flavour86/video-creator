import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const schema = path.join(repoRoot, "packages", "shared-schemas", "project.schema.json");
const out = path.join(repoRoot, "packages", "shared-schemas", "py", "schemas.py");

const serverDir = path.join(repoRoot, "apps", "server");
const pythonExe =
  process.platform === "win32"
    ? path.join(serverDir, ".venv", "Scripts", "python.exe")
    : path.join(serverDir, ".venv", "bin", "python");

const child = spawn(
  pythonExe,
  [
    "-m",
    "datamodel_code_generator",
    "--input",
    schema,
    "--input-file-type",
    "jsonschema",
    "--output",
    out,
    "--output-model-type",
    "pydantic_v2.BaseModel",
    "--target-python-version",
    "3.11",
    "--disable-timestamp",
    "--snake-case-field",
    "--allow-population-by-field-name",
    "--use-root-model-type-alias",
  ],
  { stdio: "inherit", cwd: repoRoot },
);

child.on("exit", (code) => process.exit(code ?? 0));
