#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AUDIT_ROOTS = ["apps/web/app/", "apps/web/components/", "apps/web/styles/"];
const AUDIT_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);

const AUDIT_RULES = [
  { rule: "raw oklch color", pattern: /oklch\([^)]*\)/gi },
  { rule: "raw hsl color", pattern: /hsl\([^)]*\)/gi },
  { rule: "raw hex color", pattern: /#[0-9a-f]{3,8}\b/gi },
  {
    rule: "raw font size",
    pattern: /(?:text-\[[0-9.]+px\]|font-size\s*:\s*[0-9.]+px|fontSize\s*[:=]\s*["'`{]?[0-9.]+px)/gi,
  },
  {
    rule: "raw radius",
    pattern:
      /(?:rounded-\[[0-9.]+px\]|border-radius\s*:\s*[0-9.]+px|borderRadius\s*[:=]\s*["'`{]?[0-9.]+px)/gi,
  },
];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isTokenDeclaration(line) {
  return /^\s*--[a-z0-9-]+:\s*.+;\s*$/i.test(line);
}

export function isAuditableFrontendFile(filePath) {
  const normalizedPath = normalizePath(filePath);
  const extension = extname(normalizedPath);

  if (!AUDIT_EXTENSIONS.has(extension)) {
    return false;
  }

  if (normalizedPath.includes(".test.") || normalizedPath.includes(".spec.")) {
    return false;
  }

  return AUDIT_ROOTS.some((root) => normalizedPath.startsWith(root));
}

export function auditFiles(files) {
  const violations = [];

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (isTokenDeclaration(line)) {
        return;
      }

      for (const auditRule of AUDIT_RULES) {
        for (const match of line.matchAll(auditRule.pattern)) {
          violations.push({
            path: normalizePath(file.path),
            line: index + 1,
            column: (match.index ?? 0) + 1,
            rule: auditRule.rule,
            match: match[0],
          });
        }
      }
    });
  }

  return violations;
}

function readGitLines(args, cwd) {
  const output = execFileSync("git", args, { cwd, encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getGitRoot(cwd) {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
}

function getChangedFiles(cwd) {
  const tracked = readGitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--", "apps/web"], cwd);
  const untracked = readGitLines(["ls-files", "--others", "--exclude-standard", "apps/web"], cwd);
  return [...new Set([...tracked, ...untracked])];
}

function getAllFrontendFiles(cwd) {
  return readGitLines(["ls-files", "apps/web/app", "apps/web/components", "apps/web/styles"], cwd);
}

function readAuditFiles(paths, cwd) {
  return paths
    .filter(isAuditableFrontendFile)
    .filter((filePath) => existsSync(resolve(cwd, filePath)))
    .map((filePath) => ({
      path: filePath,
      content: readFileSync(resolve(cwd, filePath), "utf8"),
    }));
}

function formatViolations(violations) {
  return violations
    .map(
      (violation) =>
        `${violation.path}:${violation.line}:${violation.column} ${violation.rule} (${violation.match})`,
    )
    .join("\n");
}

export function runTokenAudit({ cwd = process.cwd(), all = false } = {}) {
  const gitRoot = getGitRoot(cwd);
  const candidatePaths = all ? getAllFrontendFiles(gitRoot) : getChangedFiles(gitRoot);
  const files = readAuditFiles(candidatePaths, gitRoot);
  const violations = auditFiles(files);

  return {
    checkedFileCount: files.length,
    violations,
  };
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const result = runTokenAudit({ cwd, all: argv.includes("--all") });

  if (result.violations.length > 0) {
    console.error(`Token audit failed with ${result.violations.length} violation(s):`);
    console.error(formatViolations(result.violations));
    return 1;
  }

  console.log(`Token audit passed (${result.checkedFileCount} changed frontend file(s) checked).`);
  return 0;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";

if (import.meta.url === entryPoint) {
  process.exitCode = main();
}
