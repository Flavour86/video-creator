# Milestone 1 — Skeleton

> **Goal**: From an empty directory, produce a runnable monorepo where `pnpm dev` boots both the Next.js frontend and FastAPI sidecar, and `npx @yourname/video-creator` (in dev) opens a browser to a "Hello" page.

---

## Tasks

| ID | Title | Time |
|---|---|---|
| T1.1 | Initialize pnpm monorepo | 30 min |
| T1.2 | Bootstrap Next.js app (apps/web) | 60 min |
| T1.3 | Bootstrap FastAPI app (apps/server) | 90 min |
| T1.4 | Create shared-schemas package | 60 min |
| T1.5 | Concurrent dev script (`pnpm dev`) | 30 min |
| T1.6 | npx launcher (bin script) | 90 min |
| T1.7 | Browser auto-open + graceful shutdown | 30 min |

---

## T1.1 — Initialize pnpm monorepo

### Goal
Create the workspace root with `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.base.json`, and an initial Git commit.

### Prerequisites
- Milestone 0 complete.

### Skip-detection
```powershell
Test-Path package.json -PathType Leaf
Test-Path pnpm-workspace.yaml -PathType Leaf
```
If both return `True` and contain the workspace config below, skip.

### Steps

#### 1. Initialize Git (if not already)
```powershell
git init -b master
```

#### 2. Create `package.json` (root)
Write to `package.json`:
```json
{
  "name": "video-creator",
  "private": true,
  "version": "0.1.0",
  "description": "Local-first AI-augmented video creator.",
  "engines": {
    "node": ">=22",
    "pnpm": ">=9"
  },
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "format": "prettier --write \"**/*.{ts,tsx,js,mjs,json,md}\" --ignore-path .gitignore",
    "gen:types": "pnpm -F @vc/shared-schemas gen:ts",
    "gen:py": "pnpm -F @vc/shared-schemas gen:py"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "cross-env": "^7.0.3",
    "prettier": "^3.3.0",
    "tsx": "^4.19.0"
  },
  "packageManager": "pnpm@10.0.0"
}
```

#### 3. Create `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

#### 4. Create `.gitignore`
Use the contents from `CONVENTIONS.md` §10 verbatim.

#### 5. Create `.editorconfig`
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

#### 6. Create `.nvmrc`
```
22
```

#### 7. Create `.python-version`
```
3.11
```

#### 8. Create `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "incremental": true,
    "jsx": "preserve",
    "allowJs": false,
    "forceConsistentCasingInFileNames": true
  }
}
```

#### 9. Create `README.md`
```markdown
# Video Creator

Local-first AI-augmented video creator. Phase 1: ffmpeg-based composition of voice + transcript + images.

## Run (dev)
```
pnpm install
pnpm dev
```

## Documentation
- Design: [`docs/designs/PHASE_1_DESIGN.md`](docs/designs/PHASE_1_DESIGN.md)
- Execution guide: [`docs/executions/00_OVERVIEW.md`](docs/executions/00_OVERVIEW.md)
```

#### 10. Create `scripts/` directory placeholder
```powershell
New-Item -ItemType Directory -Force -Path scripts
"# placeholder" | Out-File -FilePath scripts/.gitkeep -Encoding utf8
```

#### 11. Install root dev deps
```powershell
pnpm install
```

This will create `pnpm-lock.yaml` and `node_modules/`. The lockfile will be near-empty (no workspace packages exist yet).

#### 12. Stage and commit
```powershell
git add .
git commit -m "chore(repo): scaffold pnpm workspace`n`nRefs: T1.1"
```

(Note: PowerShell uses backticks for newlines in heredoc-like cases. If the multi-line message is awkward, use `git commit -F <(temp file)` or just a single line.)

### Verification
```powershell
Test-Path package.json
Test-Path pnpm-workspace.yaml
Test-Path .gitignore
Test-Path tsconfig.base.json
Test-Path pnpm-lock.yaml
git log --oneline -1   # must show "chore(repo): scaffold pnpm workspace"
```
All paths exist; git log shows the commit.

### Common failures
- **`pnpm install` errors with "ERR_PNPM_PEER_DEP_ISSUES"**: acceptable warnings; continue. If actual errors, ensure `engines` block matches installed Node.
- **Lockfile not created**: `pnpm install` was skipped or failed silently. Re-run.

---

## T1.2 — Bootstrap Next.js app (apps/web)

### Goal
Create a minimal Next.js 15 app at `apps/web/` with TypeScript, Tailwind, App Router, a homepage that fetches from `/api/health`, and a passing test.

### Prerequisites
- T1.1 complete.

### Skip-detection
```powershell
Test-Path apps/web/package.json
Test-Path apps/web/app/page.tsx
```
Both return True → skip.

### Steps

#### 1. Create `apps/web/` and `cd` in
Do **not** use `create-next-app` interactively — write the files directly to keep the result deterministic.

```powershell
New-Item -ItemType Directory -Force -Path apps/web/app
New-Item -ItemType Directory -Force -Path apps/web/components
New-Item -ItemType Directory -Force -Path apps/web/lib
New-Item -ItemType Directory -Force -Path apps/web/styles
New-Item -ItemType Directory -Force -Path apps/web/public
```

#### 2. `apps/web/package.json`
```json
{
  "name": "@vc/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0",
    "zustand": "^5.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "vitest": "^2.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0",
    "jsdom": "^25.0.0"
  }
}
```

#### 3. `apps/web/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "noEmit": true
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

#### 4. `apps/web/next.config.ts`
```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/server/:path*",
        destination: "http://127.0.0.1:8787/:path*",
      },
    ];
  },
};

export default config;
```

#### 5. `apps/web/postcss.config.mjs`
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

#### 6. `apps/web/styles/globals.css`
```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: 222 47% 5%;
    --foreground: 0 0% 100%;
  }
}

html, body {
  height: 100%;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

#### 7. `apps/web/app/layout.tsx`
```tsx
import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Video Creator",
  description: "Local-first AI-augmented video creator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

#### 8. `apps/web/app/page.tsx`
```tsx
"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [serverStatus, setServerStatus] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    fetch("/api/server/health")
      .then((r) => (r.ok ? "ok" : "down"))
      .catch(() => "down")
      .then((s) => setServerStatus(s as "ok" | "down"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Video Creator</h1>
      <p className="text-sm opacity-70">
        Sidecar: <span className="font-mono">{serverStatus}</span>
      </p>
    </main>
  );
}
```

#### 9. `apps/web/app/api/server/[...path]/route.ts`
This is **not strictly needed** because `next.config.ts` handles the rewrite. Skip unless an explicit handler is needed later.

#### 10. `apps/web/.eslintrc.json`
```json
{
  "extends": "next/core-web-vitals",
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

#### 11. `apps/web/vitest.config.ts`
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

#### 12. `apps/web/vitest.setup.ts`
```ts
import "@testing-library/jest-dom/vitest";
```

#### 13. `apps/web/app/page.test.tsx`
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("renders the title", () => {
    render(<HomePage />);
    expect(screen.getByText("Video Creator")).toBeInTheDocument();
  });

  it("shows ok when sidecar responds", async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
  });
});
```

#### 14. Install
```powershell
pnpm install
```

#### 15. Smoke test
```powershell
pnpm -F @vc/web build
pnpm -F @vc/web test
```
Both must succeed.

#### 16. Commit
```powershell
git add apps/web pnpm-lock.yaml package.json
git commit -m "feat(web): scaffold Next.js app with health check"
```

### Verification
```powershell
pnpm -F @vc/web build       # exits 0
pnpm -F @vc/web test        # exits 0, 2 tests passed
Test-Path apps/web/.next    # True
```

### Common failures
- **Tailwind v4 syntax errors**: Tailwind 4 uses `@import "tailwindcss"` rather than `@tailwind base; @tailwind components; …`. If you see "unknown at-rule", you have v3 config; check the version in `package.json`.
- **`fetch is not defined` in tests**: jsdom lacks fetch. The test mocks it explicitly — make sure `beforeEach` runs.

---

## T1.3 — Bootstrap FastAPI app (apps/server)

### Goal
Create a minimal FastAPI app at `apps/server/` with `/health` endpoint, structured logging, settings via env, a passing pytest, and a Python venv with the right PyTorch wheel.

### Prerequisites
- T1.1, T1.2 complete.
- `scripts/.env-detect` exists from T0.5.

### Skip-detection
```powershell
Test-Path apps/server/pyproject.toml
Test-Path apps/server/.venv
```
Both True → skip.

### Steps

#### 1. Create directories
```powershell
New-Item -ItemType Directory -Force -Path apps/server/server
New-Item -ItemType Directory -Force -Path apps/server/server/routes
New-Item -ItemType Directory -Force -Path apps/server/server/pipeline
New-Item -ItemType Directory -Force -Path apps/server/server/domain
New-Item -ItemType Directory -Force -Path apps/server/server/adapters
New-Item -ItemType Directory -Force -Path apps/server/server/adapters/ai
New-Item -ItemType Directory -Force -Path apps/server/tests
```

#### 2. `apps/server/pyproject.toml`
```toml
[project]
name = "vc-server"
version = "0.1.0"
description = "Video Creator backend (FastAPI sidecar)."
requires-python = "==3.11.*"
readme = "README.md"
dependencies = [
  "fastapi>=0.115,<0.120",
  "uvicorn[standard]>=0.32,<0.40",
  "websockets>=13,<15",
  "pydantic>=2.9,<3.0",
  "pydantic-settings>=2.5,<3.0",
  "structlog>=24.0,<26.0",
  "python-multipart>=0.0.18,<0.1",
  "ffmpeg-python>=0.2,<0.3",
  "soundfile>=0.12,<0.14",
  "numpy>=1.26,<3.0",
  "nltk>=3.9,<4.0",
]

[project.optional-dependencies]
ml = [
  "torch>=2.6",
  "torchaudio>=2.6",
  "whisperx>=3.1",
]
dev = [
  "pytest>=8.3,<9.0",
  "pytest-asyncio>=0.24,<1.0",
  "httpx>=0.27,<1.0",
  "ruff>=0.7,<1.0",
  "mypy>=1.13,<2.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["server"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "B", "UP", "RUF"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.mypy]
python_version = "3.11"
strict = true
exclude = ["tests/", "build/"]
```

#### 3. Create the venv

Read `scripts/.env-detect` to determine the PyTorch index.

```powershell
$detect = Get-Content scripts/.env-detect | ConvertFrom-StringData
$pytorchIndex = $detect.PYTORCH_INDEX

cd apps/server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip wheel
```

If `$pytorchIndex` is set (GPU path):
```powershell
pip install --index-url $pytorchIndex torch torchaudio
pip install -e ".[ml,dev]"
```

If no GPU (CPU path):
```powershell
pip install -e ".[ml,dev]"
```
(PyPI default index includes CPU torch wheels.)

#### 4. `apps/server/server/__init__.py`
Empty file.

#### 5. `apps/server/server/settings.py`
```python
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="VC_",
        case_sensitive=False,
    )

    host: str = "127.0.0.1"
    port: int = 8787
    debug: bool = False
    app_db_path: Path = Field(
        default_factory=lambda: _default_app_db_path(),
        description="SQLite DB for global app state (recent projects, settings).",
    )


def _default_app_db_path() -> Path:
    import os
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", "~")) / "videocreator"
    else:
        base = Path("~/.videocreator").expanduser()
    base.mkdir(parents=True, exist_ok=True)
    return base / "app.db"


settings = Settings()
```

#### 6. `apps/server/server/main.py`
```python
import logging

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from server.settings import settings

logging.basicConfig(level=logging.INFO if not settings.debug else logging.DEBUG)
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer() if settings.debug else structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()

app = FastAPI(title="Video Creator Sidecar", version="0.1.0")


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "version": "0.1.0"})


@app.on_event("startup")
async def startup() -> None:
    log.info("server.startup", host=settings.host, port=settings.port)


@app.on_event("shutdown")
async def shutdown() -> None:
    log.info("server.shutdown")
```

#### 7. `apps/server/server/__main__.py`
```python
import uvicorn

from server.settings import settings


def main() -> None:
    uvicorn.run(
        "server.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info" if not settings.debug else "debug",
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
```

#### 8. `apps/server/.env.example`
```
VC_DEBUG=0
VC_HOST=127.0.0.1
VC_PORT=8787
```

#### 9. `apps/server/tests/__init__.py`
Empty.

#### 10. `apps/server/tests/test_health.py`
```python
import httpx
import pytest

from server.main import app


@pytest.mark.asyncio
async def test_health_returns_ok() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
```

#### 11. `apps/server/package.json`
A thin wrapper so `pnpm -F @vc/server <script>` works.
```json
{
  "name": "@vc/server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "node ../../scripts/run-server-dev.mjs",
    "test": "node ../../scripts/run-server-test.mjs",
    "build": "echo \"Python; no build step\" && exit 0",
    "lint": "node ../../scripts/run-server-lint.mjs"
  }
}
```

#### 12. `scripts/run-server-dev.mjs`
```js
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const serverDir = path.join(repoRoot, "apps", "server");

const pythonExe =
  process.platform === "win32"
    ? path.join(serverDir, ".venv", "Scripts", "python.exe")
    : path.join(serverDir, ".venv", "bin", "python");

const child = spawn(pythonExe, ["-m", "server"], {
  cwd: serverDir,
  stdio: "inherit",
  env: { ...process.env, VC_DEBUG: process.env.VC_DEBUG ?? "1" },
});

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
```

#### 13. `scripts/run-server-test.mjs`
```js
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
```

#### 14. `scripts/run-server-lint.mjs`
```js
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
  mypy.on("exit", (mc) => process.exit(mc ?? 0));
});
```

#### 15. Smoke test
```powershell
.\apps\server\.venv\Scripts\Activate.ps1
cd apps/server
python -m pytest -q
deactivate
cd ../..
```
Must show `1 passed`.

#### 16. Commit
```powershell
git add apps/server scripts package.json pnpm-lock.yaml
git commit -m "feat(server): scaffold FastAPI sidecar with health endpoint"
```

### Verification
```powershell
pnpm -F @vc/server test
Test-Path apps/server/.venv/Scripts/python.exe   # Windows
& apps/server/.venv/Scripts/python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```
Last command should print a version and `True`/`False` (matches `.env-detect`).

### Common failures
- **`whisperx` install fails**: usually a transitive dep clash. Check pip's error; if `ctranslate2` complains about CUDA mismatch, the wrong PyTorch wheel was installed. Re-run T0.5.
- **`mypy` errors on first run**: missing stubs for some libs. Add `# type: ignore[import-untyped]` only where unavoidable, prefer fixing.
- **`No module named server`**: working directory is wrong. The venv expects `cwd=apps/server`.

---

## T1.4 — Create shared-schemas package

### Goal
Create `packages/shared-schemas/` containing the canonical `project.schema.json` (a stub for now — fully populated in T2.2) and codegen scripts that produce TypeScript types and Pydantic models.

### Prerequisites
- T1.1 complete.

### Skip-detection
```powershell
Test-Path packages/shared-schemas/package.json
Test-Path packages/shared-schemas/project.schema.json
```
Both True → skip.

### Steps

#### 1. Create directories
```powershell
New-Item -ItemType Directory -Force -Path packages/shared-schemas/ts
New-Item -ItemType Directory -Force -Path packages/shared-schemas/py
```

#### 2. `packages/shared-schemas/package.json`
```json
{
  "name": "@vc/shared-schemas",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./ts/index.ts",
  "types": "./ts/index.ts",
  "scripts": {
    "gen:ts": "json2ts -i project.schema.json -o ts/index.ts",
    "gen:py": "node ../../scripts/gen-pydantic.mjs"
  },
  "devDependencies": {
    "json-schema-to-typescript": "^15.0.0"
  }
}
```

#### 3. `packages/shared-schemas/project.schema.json` (stub)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://video-creator.local/schemas/project.json",
  "title": "Project",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "name", "audio", "transcript", "output", "layers"],
  "properties": {
    "version": { "const": 1 },
    "name": { "type": "string", "minLength": 1, "maxLength": 200 },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "audio": { "type": "string" },
    "transcript": {
      "type": "object",
      "required": ["kind", "path"],
      "properties": {
        "kind": { "enum": ["plain_text", "pre_segmented"] },
        "path": { "type": "string" }
      }
    },
    "output": {
      "type": "object",
      "required": ["preset"],
      "properties": {
        "preset": { "enum": ["draft", "final"] }
      }
    },
    "layers": {
      "type": "object",
      "properties": {
        "auto_distribute": { "type": ["object", "null"] },
        "foreground": { "type": "array", "items": { "type": "object" } }
      }
    },
    "subtitles": { "type": ["object", "null"] },
    "watermark": { "type": ["object", "null"] }
  }
}
```

This stub is intentionally loose. T2.2 fills it in fully.

#### 4. `scripts/gen-pydantic.mjs`
```js
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
  ],
  { stdio: "inherit", cwd: repoRoot }
);
child.on("exit", (code) => process.exit(code ?? 0));
```

#### 5. Add `datamodel-code-generator` to server dev deps
Edit `apps/server/pyproject.toml`, add to `[project.optional-dependencies].dev`:
```
"datamodel-code-generator>=0.26,<1.0",
```
Then re-install:
```powershell
.\apps\server\.venv\Scripts\Activate.ps1
cd apps/server
pip install -e ".[ml,dev]"
deactivate
cd ../..
```

#### 6. Generate
```powershell
pnpm install
pnpm gen:types
pnpm gen:py
```

This creates `packages/shared-schemas/ts/index.ts` and `packages/shared-schemas/py/schemas.py`.

#### 7. `packages/shared-schemas/py/__init__.py`
Empty.

#### 8. Commit
```powershell
git add packages scripts apps/server/pyproject.toml pnpm-lock.yaml
git commit -m "feat(schema): add shared JSON schema with TS+Pydantic codegen"
```

### Verification
```powershell
pnpm gen:types
pnpm gen:py
Test-Path packages/shared-schemas/ts/index.ts
Test-Path packages/shared-schemas/py/schemas.py
& apps/server/.venv/Scripts/python -c "import sys; sys.path.insert(0, 'packages/shared-schemas/py'); from schemas import Project; print(Project.model_json_schema()['title'])"
```
Last line prints `Project`.

### Common failures
- **`json2ts: command not found`**: pnpm didn't link the bin. Run `pnpm install --frozen-lockfile=false`.
- **`datamodel-code-generator` import error**: not installed. Re-do step 5.

---

## T1.5 — Concurrent dev script (`pnpm dev`)

### Goal
Make `pnpm dev` from the repo root start both the FastAPI sidecar and Next.js dev server, with combined output and graceful shutdown on Ctrl+C.

### Prerequisites
- T1.2, T1.3 complete.

### Skip-detection
```powershell
Test-Path scripts/dev.mjs
```
True and the file looks like step 1 below → skip.

### Steps

#### 1. `scripts/dev.mjs`
```js
import { spawn } from "node:child_process";
import process from "node:process";

const children = [];
let shuttingDown = false;

function start(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: { ...process.env, ...env },
  });
  child.stdout.on("data", (b) => process.stdout.write(`[${name}] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[${name}] ${b}`));
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[dev] ${name} exited with code ${code}; shutting down`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

function shutdown(code) {
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGINT");
  }
  setTimeout(() => process.exit(code), 1000);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const isWindows = process.platform === "win32";
const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

start("server", pnpmCmd, ["-F", "@vc/server", "dev"]);
start("web", pnpmCmd, ["-F", "@vc/web", "dev"]);
```

#### 2. Smoke test
```powershell
pnpm dev
```
Wait ~10 seconds. You should see:
- `[server] INFO ... server.startup ...`
- `[web] ▲ Next.js 15...`
- `[web] - Local: http://localhost:3000`

Open http://localhost:3000 in a browser. Confirm "Sidecar: ok" appears.

Press Ctrl+C. Both processes must exit within 2 seconds.

#### 3. Commit
```powershell
git add scripts/dev.mjs
git commit -m "feat(repo): concurrent pnpm dev for web + server"
```

### Verification
Manual smoke test as in step 2.

### Common failures
- **`spawn ENOENT`**: `pnpm.cmd` not found on Windows; try `pnpm` without `.cmd`.
- **Ctrl+C kills only one**: the script's signal forwarding has a bug; ensure SIGINT is sent to children before exit.
- **Port 3000 or 8787 in use**: another process holds it. Find it (`netstat -ano | findstr :3000`) and kill, or override `VC_PORT`.

---

## T1.6 — npx launcher (bin script)

### Goal
Make `npx -y .` (or, post-publish, `npx @yourname/video-creator`) execute the same flow as `pnpm dev` but in production mode (`next start` after `next build`), with a single command.

For Phase 1 (unpublished), this task creates the `bin/` script and wires it up so `npm run launch` works locally; publishing to npm is deferred.

### Prerequisites
- T1.5 complete.

### Skip-detection
```powershell
Test-Path bin/video-creator.mjs
```
True → skip.

### Steps

#### 1. Create `bin/video-creator.mjs`
```js
#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const isWindows = process.platform === "win32";
const pythonExe =
  isWindows
    ? path.join(repoRoot, "apps", "server", ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, "apps", "server", ".venv", "bin", "python");

const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

const children = [];
let shuttingDown = false;

function start(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...opts,
  });
  child.stdout.on("data", (b) => process.stdout.write(`[${name}] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[${name}] ${b}`));
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[launcher] ${name} exited (${code}); shutting down`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

function shutdown(code) {
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGINT");
  }
  setTimeout(() => process.exit(code), 1500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[launcher] starting Video Creator...");

start("server", pythonExe, ["-m", "server"], {
  cwd: path.join(repoRoot, "apps", "server"),
});

start("web", pnpmCmd, ["-F", "@vc/web", "start"], {
  cwd: repoRoot,
});

setTimeout(() => {
  if (shuttingDown) return;
  console.log("[launcher] http://localhost:3000");
  // Browser auto-open is added in T1.7.
}, 4000);
```

#### 2. Make it executable (Unix)
```bash
chmod +x bin/video-creator.mjs
```
On Windows this is a no-op.

#### 3. Update root `package.json`
Add to the top-level object:
```json
"bin": {
  "video-creator": "./bin/video-creator.mjs"
},
"scripts": {
  ...,
  "launch": "node bin/video-creator.mjs"
}
```

(Replace the existing `"scripts"` block, preserving its other entries.)

#### 4. Smoke test (production mode)
```powershell
pnpm -F @vc/web build
pnpm launch
```
Wait until you see `[launcher] http://localhost:3000`. Open in browser; confirm "Sidecar: ok".

Press Ctrl+C; both processes exit.

#### 5. Commit
```powershell
git add bin package.json
git commit -m "feat(repo): add bin/video-creator.mjs launcher"
```

### Verification
- `pnpm launch` starts both servers in production mode.
- Browser at localhost:3000 shows "Sidecar: ok".
- Ctrl+C cleanly shuts down both.

### Common failures
- **Next.js complains "no production build"**: run `pnpm -F @vc/web build` first. The launcher does not auto-build.
- **PATH issue with venv python**: confirm `apps/server/.venv/Scripts/python.exe` exists.

---

## T1.7 — Browser auto-open and graceful shutdown

### Goal
The launcher waits until the sidecar's `/health` returns 200 *and* Next.js is serving, then opens the user's default browser to `http://localhost:3000`. Shutdown handles SIGINT robustly.

### Prerequisites
- T1.6 complete.

### Skip-detection
Search `bin/video-creator.mjs` for the string `health`. If present and a browser-open call exists, skip.

### Steps

#### 1. Edit `bin/video-creator.mjs`
Add at the top, alongside other imports:
```js
import { setTimeout as sleep } from "node:timers/promises";
```

Replace the `setTimeout(() => { ... }, 4000)` block with:

```js
async function waitForReady(maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (shuttingDown) return false;
    try {
      const [a, b] = await Promise.all([
        fetch("http://127.0.0.1:8787/health").then((r) => r.ok).catch(() => false),
        fetch("http://127.0.0.1:3000/").then((r) => r.ok).catch(() => false),
      ]);
      if (a && b) return true;
    } catch {
      /* ignore */
    }
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
    console.log("[launcher] ready — opening browser");
    openBrowser("http://localhost:3000");
  } else if (!shuttingDown) {
    console.error("[launcher] timed out waiting for servers; visit http://localhost:3000");
  }
});
```

#### 2. Smoke test
```powershell
pnpm -F @vc/web build
pnpm launch
```
A browser window should open automatically after both servers are ready.

#### 3. Commit
```powershell
git add bin/video-creator.mjs
git commit -m "feat(repo): wait for ready then auto-open browser"
```

### Verification
Manual: run `pnpm launch`; browser opens within 30 sec; Ctrl+C exits both.

### Common failures
- **Browser doesn't open**: `xdg-open` missing on Linux. Print URL to stderr as fallback (already done).
- **Browser opens before server is ready**: `waitForReady` is broken. Check that both `fetch` calls return `true`.

---

## Milestone 1 verification (run all)

```powershell
pnpm install --frozen-lockfile
pnpm -F @vc/web build
pnpm -F @vc/web test
pnpm -F @vc/server test
pnpm gen:types
pnpm gen:py

# Smoke: launch and curl
$proc = Start-Process pnpm -ArgumentList "launch" -PassThru
Start-Sleep -Seconds 30
Invoke-WebRequest http://localhost:3000 -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest http://127.0.0.1:8787/health -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Stop-Process -Id $proc.Id
```

Expected:
- Both `StatusCode` lines print `200`.
- Test suites pass.
- Codegen produces both files.

---

## End of Milestone 1

When everything above passes:
- Update `STATE.md` to check off T1.1–T1.7.
- Append a Notes log entry summarizing.
- Move to `03_MILESTONE_PROJECT_IO.md`.
