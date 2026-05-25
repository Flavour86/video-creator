import type { Project } from "@vc/shared-schemas";
import type { Layer } from "@/lib/preview/resolveDisplay";
export { isTextEditingTarget } from "@/lib/shortcuts/isTextEditingTarget";

export type EditorWorkingState = {
  layers: Layer[];
  transcript: Project["transcript"];
  output: Project["output"];
  subtitles: Project["subtitles"];
  watermark: Project["watermark"];
};

export type EditorOperation =
  | { type: "add"; layerId: string; item: unknown; index?: number }
  | { type: "patch"; layerId: string; itemId: string; before: Record<string, unknown>; after: Record<string, unknown> }
  | { type: "delete"; layerId: string; item: unknown; index: number }
  | { type: "move"; layerId: string; itemId: string; before: { start: number; end: number }; after: { start: number; end: number } }
  | { type: "stretch"; layerId: string; itemId: string; before: { start: number; end: number }; after: { start: number; end: number } }
  | { type: "reorder"; layerId: string; from: number; to: number }
  | { type: "replace_layers"; before: Layer[]; after: Layer[] }
  | {
      type: "transcript_merge";
      before: { layers: Layer[]; transcript: Project["transcript"] };
      after: { layers: Layer[]; transcript: Project["transcript"] };
    }
  | { type: "transcript_timing_update"; before: Project["transcript"]; after: Project["transcript"] }
  | { type: "global_config_update"; before: Project["output"]; after: Project["output"] }
  | { type: "subtitle_settings_update"; before: Project["subtitles"]; after: Project["subtitles"] }
  | { type: "watermark_update"; before: Project["watermark"]; after: Project["watermark"] };

export type StoredEditorOperation = {
  id: string;
  at: string;
  coalesceKey?: string;
  op: EditorOperation;
};

export type StoredOperationLog = {
  redo: StoredEditorOperation[];
  undo: StoredEditorOperation[];
  version: 1;
};

export type EditorRecoverySelection = { itemId: string; layerId: string } | null;
export type EditorResolutionPreset = "1080p" | "720p" | "9:16";

export type EditorRecoveryState = {
  resolution: EditorResolutionPreset;
  selected: EditorRecoverySelection;
  selectedRange: [number, number] | null;
  transcriptScrollTop: number;
  version: 1;
};

export function emptyOperationLog(): StoredOperationLog {
  return { redo: [], undo: [], version: 1 };
}

export function editorOperationStorageKey(projectId: string): string {
  return `vc.editor.operations.${projectId}`;
}

export function editorRecoveryStorageKey(projectId: string): string {
  return `vc.editor.recovery.${projectId}`;
}

export function loadOperationLog(projectId: string, storage = browserStorage()): StoredOperationLog {
  if (!projectId || !storage) return emptyOperationLog();
  const storageKey = editorOperationStorageKey(projectId);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return emptyOperationLog();
    const parsed = JSON.parse(raw) as Partial<StoredOperationLog>;
    if (parsed.version !== 1 || !Array.isArray(parsed.undo) || !Array.isArray(parsed.redo)) {
      storage.removeItem(storageKey);
      return emptyOperationLog();
    }
    return { redo: parsed.redo, undo: parsed.undo, version: 1 };
  } catch {
    storage.removeItem(storageKey);
    return emptyOperationLog();
  }
}

export function saveOperationLog(projectId: string, log: StoredOperationLog, storage = browserStorage()): void {
  if (!projectId || !storage) return;
  storage.setItem(editorOperationStorageKey(projectId), JSON.stringify(log));
}

export function ensureOperationLog(projectId: string, storage = browserStorage()): StoredOperationLog {
  const log = loadOperationLog(projectId, storage);
  saveOperationLog(projectId, log, storage);
  return log;
}

export function clearOperationLog(projectId: string, storage = browserStorage()): void {
  if (!projectId || !storage) return;
  storage.removeItem(editorOperationStorageKey(projectId));
}

export function loadRecoveryState(projectId: string, storage = browserStorage()): EditorRecoveryState | null {
  if (!projectId || !storage) return null;
  const storageKey = editorRecoveryStorageKey(projectId);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorRecoveryState>;
    if (!isRecoveryState(parsed)) {
      storage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function saveRecoveryState(projectId: string, state: EditorRecoveryState, storage = browserStorage()): void {
  if (!projectId || !storage) return;
  storage.setItem(editorRecoveryStorageKey(projectId), JSON.stringify(state));
}

export function clearRecoveryState(projectId: string, storage = browserStorage()): void {
  if (!projectId || !storage) return;
  storage.removeItem(editorRecoveryStorageKey(projectId));
}

export function appendOperation(projectId: string, op: EditorOperation, storage = browserStorage()): StoredOperationLog {
  const log = loadOperationLog(projectId, storage);
  const nowIso = new Date().toISOString();
  const previous = log.undo.at(-1);
  const coalesceKey = coalesceOperationKey(op);
  if (
    coalesceKey &&
    previous?.coalesceKey === coalesceKey &&
    previous.op.type === "replace_layers" &&
    op.type === "replace_layers" &&
    _can_coalesce_replace_layers(previous.at, previous.op.after, op.before)
  ) {
    const merged: StoredEditorOperation = {
      ...previous,
      at: nowIso,
      op: {
        type: "replace_layers",
        before: previous.op.before,
        after: op.after,
      },
    };
    const next: StoredOperationLog = {
      redo: [],
      undo: [...log.undo.slice(0, -1), merged],
      version: 1,
    };
    saveOperationLog(projectId, next, storage);
    return next;
  }
  const next: StoredOperationLog = {
    redo: [],
    undo: [...log.undo, { at: nowIso, coalesceKey, id: cryptoId(), op }],
    version: 1,
  };
  saveOperationLog(projectId, next, storage);
  return next;
}

export function recoverWorkingState(projectId: string, base: EditorWorkingState, storage = browserStorage()): EditorWorkingState {
  return loadOperationLog(projectId, storage).undo.reduce((state, entry) => applyOperation(state, entry.op), base);
}

export function buildWorkingConfig(project: Project, projectId: string, storage = browserStorage()): Project {
  const working = recoverWorkingState(
    projectId,
    {
      layers: (project.layers ?? []) as Layer[],
      transcript: project.transcript,
      output: project.output,
      subtitles: project.subtitles,
      watermark: project.watermark,
    },
    storage,
  );
  return {
    ...project,
    layers: working.layers as Project["layers"],
    transcript: working.transcript,
    output: working.output,
    subtitles: working.subtitles,
    watermark: working.watermark,
  };
}

export function isValidProjectSaveConfig(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Partial<Project>;
  return (
    project.version === 1 &&
    typeof project.name === "string" &&
    typeof project.audio === "string" &&
    typeof project.transcript === "object" &&
    project.transcript !== null &&
    typeof project.output === "object" &&
    project.output !== null &&
    Array.isArray(project.layers)
  );
}

export function undoLast(projectId: string, state: EditorWorkingState, storage = browserStorage()): { log: StoredOperationLog; state: EditorWorkingState } {
  const log = loadOperationLog(projectId, storage);
  const entry = log.undo.at(-1);
  if (!entry) return { log, state };
  const nextLog = { redo: [...log.redo, entry], undo: log.undo.slice(0, -1), version: 1 as const };
  saveOperationLog(projectId, nextLog, storage);
  return { log: nextLog, state: applyOperation(state, invertOperation(entry.op)) };
}

export function redoLast(projectId: string, state: EditorWorkingState, storage = browserStorage()): { log: StoredOperationLog; state: EditorWorkingState } {
  const log = loadOperationLog(projectId, storage);
  const entry = log.redo.at(-1);
  if (!entry) return { log, state };
  const nextLog = { redo: log.redo.slice(0, -1), undo: [...log.undo, entry], version: 1 as const };
  saveOperationLog(projectId, nextLog, storage);
  return { log: nextLog, state: applyOperation(state, entry.op) };
}

export function invertOperation(op: EditorOperation): EditorOperation {
  if (op.type === "add") return { type: "delete", layerId: op.layerId, item: op.item, index: op.index ?? Number.MAX_SAFE_INTEGER };
  if (op.type === "delete") return { type: "add", layerId: op.layerId, item: op.item, index: op.index };
  if (op.type === "patch") return { ...op, before: op.after, after: op.before };
  if (op.type === "move" || op.type === "stretch") return { ...op, before: op.after, after: op.before };
  if (op.type === "reorder") return { ...op, from: op.to, to: op.from };
  if (op.type === "replace_layers") return { ...op, before: op.after, after: op.before };
  if (op.type === "transcript_merge") return { ...op, before: op.after, after: op.before };
  if (op.type === "transcript_timing_update") return { ...op, before: op.after, after: op.before };
  if (op.type === "global_config_update") return { ...op, before: op.after, after: op.before };
  if (op.type === "subtitle_settings_update") return { ...op, before: op.after, after: op.before };
  return { ...op, before: op.after, after: op.before };
}

export function applyOperation(state: EditorWorkingState, op: EditorOperation): EditorWorkingState {
  if (op.type === "replace_layers") return { ...state, layers: op.after };
  if (op.type === "transcript_merge") {
    return {
      ...state,
      layers: op.after.layers,
      transcript: op.after.transcript,
    };
  }
  if (op.type === "transcript_timing_update") return { ...state, transcript: op.after };
  if (op.type === "global_config_update") return { ...state, output: op.after };
  if (op.type === "subtitle_settings_update") return { ...state, subtitles: op.after };
  if (op.type === "watermark_update") return { ...state, watermark: op.after };
  return { ...state, layers: applyLayerOperation(state.layers, op) };
}

function applyLayerOperation(
  layers: Layer[],
  op: Exclude<EditorOperation, { type: "replace_layers" | "transcript_merge" | "transcript_timing_update" | "global_config_update" | "subtitle_settings_update" | "watermark_update" }>,
): Layer[] {
  return layers.map((layer) => {
    if (layer.id !== op.layerId || layer.kind === "sub") return layer;
    const items = [...layer.items] as Array<Record<string, unknown>>;
    if (op.type === "add") items.splice(Math.min(op.index ?? items.length, items.length), 0, op.item as Record<string, unknown>);
    if (op.type === "delete") items.splice(Math.min(op.index, items.length - 1), 1);
    if (op.type === "patch") patchItem(items, op.itemId, op.after);
    if (op.type === "move" || op.type === "stretch") patchItem(items, op.itemId, op.after);
    if (op.type === "reorder") {
      const [item] = items.splice(op.from, 1);
      if (item) items.splice(op.to, 0, item);
    }
    return { ...layer, items } as Layer;
  });
}

function patchItem(items: Array<Record<string, unknown>>, itemId: string, patch: Record<string, unknown>): void {
  const index = items.findIndex((item) => item.id === itemId);
  if (index >= 0) items[index] = { ...items[index], ...patch };
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isRecoveryState(value: Partial<EditorRecoveryState>): value is EditorRecoveryState {
  return (
    value.version === 1 &&
    isResolutionPreset(value.resolution) &&
    isRecoverySelection(value.selected) &&
    isRange(value.selectedRange) &&
    typeof value.transcriptScrollTop === "number" &&
    Number.isFinite(value.transcriptScrollTop) &&
    value.transcriptScrollTop >= 0
  );
}

function isRecoverySelection(value: unknown): value is EditorRecoverySelection {
  if (value === null) return true;
  if (typeof value !== "object" || value === null) return false;
  const selection = value as { itemId?: unknown; layerId?: unknown };
  return typeof selection.itemId === "string" && typeof selection.layerId === "string";
}

function isRange(value: unknown): value is [number, number] | null {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "number" &&
      Number.isFinite(value[0]) &&
      typeof value[1] === "number" &&
      Number.isFinite(value[1]))
  );
}

function isResolutionPreset(value: unknown): value is EditorResolutionPreset {
  return value === "1080p" || value === "720p" || value === "9:16";
}

function cryptoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `op_${Date.now()}`;
}

function _can_coalesce_replace_layers(
  previousAt: string,
  previousAfter: Layer[],
  nextBefore: Layer[],
): boolean {
  const previousAtMs = Date.parse(previousAt);
  if (!Number.isFinite(previousAtMs)) return false;
  if (Date.now() - previousAtMs > 1500) return false;
  return JSON.stringify(previousAfter) === JSON.stringify(nextBefore);
}

function coalesceOperationKey(op: EditorOperation): string | null {
  if (op.type !== "replace_layers") return null;
  const path = singleDiffPath(op.before, op.after);
  return path ? `replace_layers:${path}` : null;
}

function singleDiffPath(left: Layer[], right: Layer[]): string | null {
  const paths: string[] = [];
  collectDiffPaths(left, right, "layers", paths, 2);
  return paths.length === 1 ? paths[0] : null;
}

function collectDiffPaths(left: unknown, right: unknown, path: string, paths: string[], maxPaths: number): void {
  if (paths.length >= maxPaths) return;
  if (Object.is(left, right)) return;
  if (isPrimitive(left) || isPrimitive(right)) {
    paths.push(path);
    return;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      paths.push(path);
      return;
    }
    if (left.length !== right.length) {
      paths.push(`${path}.length`);
      return;
    }
    for (let index = 0; index < left.length; index += 1) {
      collectDiffPaths(left[index], right[index], `${path}[${index}]`, paths, maxPaths);
      if (paths.length >= maxPaths) return;
    }
    return;
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    paths.push(path);
    return;
  }
  const leftObj = left as Record<string, unknown>;
  const rightObj = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftObj), ...Object.keys(rightObj)]);
  for (const key of keys) {
    collectDiffPaths(leftObj[key], rightObj[key], `${path}.${key}`, paths, maxPaths);
    if (paths.length >= maxPaths) return;
  }
}

function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}
