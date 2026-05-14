import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Layer } from "@/lib/preview/resolveDisplay";
import {
  appendOperation,
  clearOperationLog,
  editorOperationStorageKey,
  recoverWorkingState,
  redoLast,
  undoLast,
  type EditorWorkingState,
} from "./operation-log";

const BG_LAYER: Layer = {
  id: "bg-main",
  kind: "bg",
  name: "Background",
  items: [],
};

const BASE_STATE: EditorWorkingState = {
  layers: [BG_LAYER],
  output: { preset: "draft" },
  subtitles: null,
  watermark: null,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("editor operation log", () => {
  it("stores incremental operations without serializing a full config snapshot", () => {
    appendOperation("p_demo", {
      index: 0,
      item: { id: "bg-1", mediaId: "bg.jpg", start: 0, end: 5 },
      layerId: "bg-main",
      type: "add",
    });

    const raw = window.localStorage.getItem(editorOperationStorageKey("p_demo"));
    expect(raw).toContain("\"type\":\"add\"");
    expect(raw).not.toContain("\"version\":1,\"name\"");
  });

  it("uses the editor-owned browser storage key namespace", () => {
    expect(editorOperationStorageKey("p_demo")).toBe("vc.editor.operations.p_demo");
  });

  it("recovers unsaved working state by replaying operations", () => {
    appendOperation("p_demo", {
      index: 0,
      item: { id: "bg-1", mediaId: "bg.jpg", start: 0, end: 5 },
      layerId: "bg-main",
      type: "add",
    });
    appendOperation("p_demo", {
      after: { end: 8, start: 1 },
      before: { end: 5, start: 0 },
      itemId: "bg-1",
      layerId: "bg-main",
      type: "stretch",
    });

    const recovered = recoverWorkingState("p_demo", BASE_STATE);
    expect(recovered.layers[0].items).toEqual([{ id: "bg-1", mediaId: "bg.jpg", start: 1, end: 8 }]);
  });

  it("undoes and redoes operations with inverse patches", () => {
    appendOperation("p_demo", {
      index: 0,
      item: { id: "bg-1", mediaId: "bg.jpg", start: 0, end: 5 },
      layerId: "bg-main",
      type: "add",
    });
    const current = recoverWorkingState("p_demo", BASE_STATE);

    const undone = undoLast("p_demo", current);
    expect(undone.state.layers[0].items).toEqual([]);

    const redone = redoLast("p_demo", undone.state);
    expect(redone.state.layers[0].items).toHaveLength(1);
  });

  it("records global, subtitle, and watermark config updates", () => {
    appendOperation("p_demo", { before: { preset: "draft" }, after: { preset: "final" }, type: "global_config_update" });
    appendOperation("p_demo", { before: null, after: { burn_in: true, style: { font: "Arial", size: 28, position: "bottom-center", max_chars_per_line: 42, bg_style: "shadow" } }, type: "subtitle_settings_update" });
    appendOperation("p_demo", { before: null, after: { mediaId: "logo.png", posX: 10, posY: 20, scale: 0.1, opacity: 80 }, type: "watermark_update" });

    const recovered = recoverWorkingState("p_demo", BASE_STATE);
    expect(recovered.output.preset).toBe("final");
    expect(recovered.subtitles?.burn_in).toBe(true);
    expect(recovered.watermark?.mediaId).toBe("logo.png");
  });

  it("discards malformed operation logs from browser storage", () => {
    window.localStorage.setItem(editorOperationStorageKey("p_demo"), "{bad json");
    expect(recoverWorkingState("p_demo", BASE_STATE)).toEqual(BASE_STATE);
    expect(window.localStorage.getItem(editorOperationStorageKey("p_demo"))).toBeNull();
  });

  it("ignores cleared storage", () => {
    appendOperation("p_demo", {
      index: 0,
      item: { id: "bg-1", mediaId: "bg.jpg", start: 0, end: 5 },
      layerId: "bg-main",
      type: "add",
    });
    clearOperationLog("p_demo");

    expect(recoverWorkingState("p_demo", BASE_STATE)).toEqual(BASE_STATE);
    expect(window.localStorage.getItem(editorOperationStorageKey("p_demo"))).toBeNull();
  });

  it("keeps global UI preference keys out of server and shared schema sources", () => {
    const repoRoot = path.resolve(__dirname, "../../../..");
    const forbiddenPatterns = ["vc.theme", "vc.language"];
    const contractFiles = [
      "apps/server/server/routes/setup.py",
      "apps/server/server/routes/projects.py",
      "apps/server/server/routes/render.py",
      "apps/server/server/db/migrations/010_app_settings_whitelist.sql",
      "packages/shared-schemas/project.schema.json",
      "packages/shared-schemas/ts/index.ts",
    ];
    const violations: string[] = [];

    for (const relativePath of contractFiles) {
      const fullPath = path.join(repoRoot, relativePath);
      const content = fs.readFileSync(fullPath, "utf8");
      for (const pattern of forbiddenPatterns) {
        if (content.includes(pattern)) {
          violations.push(`${relativePath} -> ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
