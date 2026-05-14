import type { Project } from "@vc/shared-schemas";
import type { Layer } from "@/lib/preview/resolveDisplay";
export { isTextEditingTarget } from "@/lib/shortcuts/isTextEditingTarget";

export type EditorWorkingState = {
  layers: Layer[];
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
  | { type: "global_config_update"; before: Project["output"]; after: Project["output"] }
  | { type: "subtitle_settings_update"; before: Project["subtitles"]; after: Project["subtitles"] }
  | { type: "watermark_update"; before: Project["watermark"]; after: Project["watermark"] };

export type StoredEditorOperation = {
  id: string;
  at: string;
  op: EditorOperation;
};

export type StoredOperationLog = {
  redo: StoredEditorOperation[];
  undo: StoredEditorOperation[];
  version: 1;
};

export function emptyOperationLog(): StoredOperationLog {
  return { redo: [], undo: [], version: 1 };
}

export function editorOperationStorageKey(projectId: string): string {
  return `vc.editor.operations.${projectId}`;
}

export function loadOperationLog(projectId: string, storage = browserStorage()): StoredOperationLog {
  if (!projectId || !storage) return emptyOperationLog();
  try {
    const raw = storage.getItem(editorOperationStorageKey(projectId));
    if (!raw) return emptyOperationLog();
    const parsed = JSON.parse(raw) as Partial<StoredOperationLog>;
    if (parsed.version !== 1 || !Array.isArray(parsed.undo) || !Array.isArray(parsed.redo)) return emptyOperationLog();
    return { redo: parsed.redo, undo: parsed.undo, version: 1 };
  } catch {
    return emptyOperationLog();
  }
}

export function saveOperationLog(projectId: string, log: StoredOperationLog, storage = browserStorage()): void {
  if (!projectId || !storage) return;
  storage.setItem(editorOperationStorageKey(projectId), JSON.stringify(log));
}

export function clearOperationLog(projectId: string, storage = browserStorage()): void {
  if (!projectId || !storage) return;
  storage.removeItem(editorOperationStorageKey(projectId));
}

export function appendOperation(projectId: string, op: EditorOperation, storage = browserStorage()): StoredOperationLog {
  const log = loadOperationLog(projectId, storage);
  const next: StoredOperationLog = {
    redo: [],
    undo: [...log.undo, { at: new Date().toISOString(), id: cryptoId(), op }],
    version: 1,
  };
  saveOperationLog(projectId, next, storage);
  return next;
}

export function recoverWorkingState(projectId: string, base: EditorWorkingState, storage = browserStorage()): EditorWorkingState {
  return loadOperationLog(projectId, storage).undo.reduce((state, entry) => applyOperation(state, entry.op), base);
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
  if (op.type === "global_config_update") return { ...op, before: op.after, after: op.before };
  if (op.type === "subtitle_settings_update") return { ...op, before: op.after, after: op.before };
  return { ...op, before: op.after, after: op.before };
}

export function applyOperation(state: EditorWorkingState, op: EditorOperation): EditorWorkingState {
  if (op.type === "global_config_update") return { ...state, output: op.after };
  if (op.type === "subtitle_settings_update") return { ...state, subtitles: op.after };
  if (op.type === "watermark_update") return { ...state, watermark: op.after };
  return { ...state, layers: applyLayerOperation(state.layers, op) };
}

function applyLayerOperation(layers: Layer[], op: Exclude<EditorOperation, { type: "global_config_update" | "subtitle_settings_update" | "watermark_update" }>): Layer[] {
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

function cryptoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `op_${Date.now()}`;
}
