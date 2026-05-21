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
  saveOperationLog,
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
  transcript: { kind: "plain_text", path: "transcript.txt" },
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

  it("keeps byte-identical state after replay plus undo/redo of delete, move, and stretch", () => {
    const baseWithClip: EditorWorkingState = {
      ...BASE_STATE,
      layers: [
        {
          ...BG_LAYER,
          items: [{ id: "bg-1", mediaId: "bg.jpg", start: 0, end: 5, sentences: [1, 1] as [number, number] }],
        },
      ],
    };

    appendOperation("p_demo", {
      type: "move",
      layerId: "bg-main",
      itemId: "bg-1",
      before: { start: 0, end: 5 },
      after: { start: 1, end: 6 },
    });
    appendOperation("p_demo", {
      type: "stretch",
      layerId: "bg-main",
      itemId: "bg-1",
      before: { start: 1, end: 6 },
      after: { start: 1, end: 8 },
    });
    appendOperation("p_demo", {
      type: "delete",
      layerId: "bg-main",
      item: { id: "bg-1", mediaId: "bg.jpg", start: 1, end: 8, sentences: [1, 1] },
      index: 0,
    });

    const replayed = recoverWorkingState("p_demo", baseWithClip);
    expect(replayed.layers[0].items).toEqual([]);

    const undo1 = undoLast("p_demo", replayed).state;
    const undo2 = undoLast("p_demo", undo1).state;
    const undo3 = undoLast("p_demo", undo2).state;
    expect(JSON.stringify(undo3)).toBe(JSON.stringify(baseWithClip));

    const redo1 = redoLast("p_demo", undo3).state;
    const redo2 = redoLast("p_demo", redo1).state;
    const redo3 = redoLast("p_demo", redo2).state;
    expect(JSON.stringify(redo3)).toBe(JSON.stringify(replayed));
  });

  it("replays a 1000-op log within the performance target", () => {
    const baseWithClip: EditorWorkingState = {
      ...BASE_STATE,
      layers: [
        {
          ...BG_LAYER,
          items: [{ id: "bg-1", mediaId: "bg.jpg", start: 0, end: 1, sentences: [1, 1] as [number, number] }],
        },
      ],
    };
    saveOperationLog("p_demo", {
      redo: [],
      undo: Array.from({ length: 1000 }, (_, index) => ({
        at: "2026-05-21T00:00:00.000Z",
        id: `op-${index}`,
        op: {
          after: { end: index * 0.01 + 1.01, start: index * 0.01 + 0.01 },
          before: { end: index * 0.01 + 1, start: index * 0.01 },
          itemId: "bg-1",
          layerId: "bg-main",
          type: "move",
        },
      })),
      version: 1,
    });

    const startedAt = performance.now();
    recoverWorkingState("p_demo", baseWithClip);
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs / 1000).toBeLessThan(100);
  });

  it("records global, subtitle, and watermark config updates", () => {
    appendOperation("p_demo", { before: { preset: "draft" }, after: { preset: "final" }, type: "global_config_update" });
    appendOperation("p_demo", { before: null, after: { burn_in: true, style: { font: "Arial", size: 28, position: "bottom", max_chars_per_line: 42, bg_style: "shadow" } }, type: "subtitle_settings_update" });
    appendOperation("p_demo", { before: null, after: { mediaId: "logo.png", posX: 10, posY: 20, scale: 0.1, opacity: 80 }, type: "watermark_update" });

    const recovered = recoverWorkingState("p_demo", BASE_STATE);
    expect(recovered.output.preset).toBe("final");
    expect(recovered.subtitles?.burn_in).toBe(true);
    expect(recovered.watermark?.mediaId).toBe("logo.png");
  });

  it("replays transcript merge as a single operation that updates transcript and layers", () => {
    appendOperation("p_demo", {
      type: "transcript_merge",
      before: {
        transcript: { kind: "plain_text", path: "transcript.txt" },
        layers: [BG_LAYER],
      },
      after: {
        transcript: {
          kind: "plain_text",
          path: "transcript.txt",
          sentences: [{ index: 1, text: "Merged sentence", start_s: 0, end_s: 5, confidence_avg: 0.9 }],
        },
        layers: [{ ...BG_LAYER, items: [{ id: "bg-1", mediaId: "bg.jpg", sentences: [1, 1], start: 0, end: 5, motion: { kind: "none", easing: "linear" }, transitions: { in: "cut", out: "cut" } }] }],
      },
    });

    const recovered = recoverWorkingState("p_demo", BASE_STATE);
    expect(recovered.transcript.sentences).toHaveLength(1);
    expect(recovered.layers[0].items).toHaveLength(1);
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
