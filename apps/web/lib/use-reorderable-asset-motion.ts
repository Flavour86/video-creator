import type { MouseEvent, PointerEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ReorderPlacement } from "@/lib/media-order";

type ItemLayout = {
  id: string;
  left: number;
  right: number;
  width: number;
};

type ActiveDrag = {
  dragging: boolean;
  id: string;
  lastX: number;
  lastY: number;
  layouts: ItemLayout[];
  node: HTMLElement;
  pointerId: number;
  previewIndex: number;
  startX: number;
  startY: number;
  sourceIndex: number;
};

type CommitCleanup = {
  shiftedIds: string[];
  sourceId: string;
};

const DRAG_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const DRAG_SCALE = 1.03;
const DRAG_START_DISTANCE = 4;
const DROP_COMMIT_MS = 180;
const OVERLAP_REORDER_RATIO = 0.4;

export function useReorderableAssetMotion(
  ids: readonly string[],
  onReorder?: (sourceId: string, targetId: string, placement: ReorderPlacement) => void,
) {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const activeRef = useRef<ActiveDrag | null>(null);
  const commitCleanupTimerRef = useRef<number | null>(null);
  const dropCommitTimerRef = useRef<number | null>(null);
  const pendingCommitCleanupRef = useRef<CommitCleanup | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const registerNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      nodesRef.current.set(id, node);
      return;
    }
    nodesRef.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const pending = pendingCommitCleanupRef.current;
    if (!pending) return;
    clearCommittedMotion(pending, nodesRef.current);
    pendingCommitCleanupRef.current = null;
    if (commitCleanupTimerRef.current !== null) {
      window.clearTimeout(commitCleanupTimerRef.current);
      commitCleanupTimerRef.current = null;
    }
  });

  useEffect(() => () => {
    if (dropCommitTimerRef.current !== null) window.clearTimeout(dropCommitTimerRef.current);
    if (commitCleanupTimerRef.current !== null) window.clearTimeout(commitCleanupTimerRef.current);
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const beginPointerDrag = useCallback((id: string, event: PointerEvent<HTMLElement>) => {
    if ((typeof event.button === "number" && event.button !== 0) || shouldIgnorePointerTarget(event.target)) return;
    const node = nodesRef.current.get(id) ?? event.currentTarget;
    const startX = dragCoordinate(event.clientX);
    const startY = dragCoordinate(event.clientY);
    const layouts = captureLayouts(ids, nodesRef.current);
    const sourceIndex = layouts.findIndex((item) => item.id === id);
    clearDeferredCommit(nodesRef.current, pendingCommitCleanupRef, commitCleanupTimerRef);
    if (dropCommitTimerRef.current !== null) {
      window.clearTimeout(dropCommitTimerRef.current);
      dropCommitTimerRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    activeRef.current = {
      dragging: false,
      id,
      lastX: startX,
      lastY: startY,
      layouts,
      node,
      pointerId: event.pointerId,
      previewIndex: sourceIndex,
      startX,
      startY,
      sourceIndex,
    };
  }, [ids]);

  const movePointerDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const clientX = dragCoordinate(event.clientX);
    const clientY = dragCoordinate(event.clientY);
    const dx = Math.round(clientX - active.startX);
    active.lastX = clientX;
    active.lastY = clientY;
    if (!active.dragging) {
      if (Math.abs(dx) < DRAG_START_DISTANCE) return;
      active.dragging = true;
      beginLiveMotion(active.node);
      safelySetPointerCapture(active.node, active.pointerId);
    }
    event.preventDefault();
    active.node.style.transform = `translate3d(${dx}px, 0px, 0) scale(${DRAG_SCALE})`;
    applyPreviewMotion(active, previewIndexForOffset(active, dx), nodesRef.current);
  }, []);

  const endPointerDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = activeRef.current;
    activeRef.current = null;
    if (!active || active.pointerId !== event.pointerId) return;
    safelyReleasePointerCapture(active.node, event.pointerId);
    if (!active.dragging) return;
    event.preventDefault();
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const placementTarget = targetForPreview(active) ?? targetForPoint(active, active.lastX, active.startY);
    if (!placementTarget) {
      clearPreviewMotion(active, nodesRef.current, false);
      endLiveMotion(active.node, settleTimerRef);
      return;
    }
    const commitCleanup = {
      shiftedIds: shiftedIdsForPreview(active),
      sourceId: active.id,
    };
    settleDroppedSource(active.node, finalOffsetForPreview(active));
    dropCommitTimerRef.current = window.setTimeout(() => {
      dropCommitTimerRef.current = null;
      pendingCommitCleanupRef.current = commitCleanup;
      onReorder?.(active.id, placementTarget.targetId, placementTarget.placement);
      commitCleanupTimerRef.current = window.setTimeout(() => {
        if (pendingCommitCleanupRef.current !== commitCleanup) return;
        clearCommittedMotion(commitCleanup, nodesRef.current);
        pendingCommitCleanupRef.current = null;
        commitCleanupTimerRef.current = null;
      }, 0);
    }, DROP_COMMIT_MS);
  }, [onReorder]);

  const cancelPointerDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = activeRef.current;
    activeRef.current = null;
    if (!active || active.pointerId !== event.pointerId) return;
    safelyReleasePointerCapture(active.node, event.pointerId);
    if (active.dragging) {
      clearPreviewMotion(active, nodesRef.current, false);
      endLiveMotion(active.node, settleTimerRef);
    }
  }, []);

  const suppressClickAfterDrag = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return useMemo(
    () => ({
      beginPointerDrag,
      cancelPointerDrag,
      endPointerDrag,
      movePointerDrag,
      registerNode,
      suppressClickAfterDrag,
    }),
    [beginPointerDrag, cancelPointerDrag, endPointerDrag, movePointerDrag, registerNode, suppressClickAfterDrag],
  );
}

function beginLiveMotion(node: HTMLElement): void {
  delete node.dataset.dragDropSettling;
  delete node.dataset.dragSettling;
  node.dataset.dragActive = "true";
  node.style.zIndex = "20";
  node.style.pointerEvents = "none";
  node.style.filter = "brightness(1.12) saturate(1.08)";
  node.style.boxShadow = "0 14px 30px rgb(0 0 0 / 0.35), 0 0 0 2px var(--amber)";
  node.style.transition = `transform 80ms ${DRAG_EASING}, filter 120ms ${DRAG_EASING}, box-shadow 120ms ${DRAG_EASING}`;
  node.style.transform = `translate3d(0px, 0px, 0) scale(${DRAG_SCALE})`;
}

function captureLayouts(ids: readonly string[], nodes: Map<string, HTMLElement>): ItemLayout[] {
  return ids.flatMap((id) => {
    const node = nodes.get(id);
    if (!node) return [];
    const rect = node.getBoundingClientRect();
    const width = rect.width || rect.right - rect.left;
    return [{ id, left: rect.left, right: rect.right, width }];
  });
}

function dragCoordinate(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function endLiveMotion(node: HTMLElement, settleTimerRef: { current: number | null }): void {
  delete node.dataset.dragActive;
  node.dataset.dragSettling = "true";
  node.style.pointerEvents = "";
  node.style.filter = "";
  node.style.boxShadow = "";
  node.style.transition = `transform 180ms ${DRAG_EASING}, filter 160ms ${DRAG_EASING}, box-shadow 160ms ${DRAG_EASING}`;
  node.style.transform = "translate3d(0px, 0px, 0) scale(1)";
  settleTimerRef.current = window.setTimeout(() => {
    delete node.dataset.dragSettling;
    node.style.zIndex = "";
    node.style.transition = "";
    node.style.transform = "";
    settleTimerRef.current = null;
  }, 190);
}

function settleDroppedSource(node: HTMLElement, finalOffset: number): void {
  delete node.dataset.dragActive;
  node.dataset.dragDropSettling = "true";
  node.style.pointerEvents = "";
  node.style.filter = "";
  node.style.boxShadow = "";
  node.style.transition = `transform ${DROP_COMMIT_MS}ms ${DRAG_EASING}, filter 160ms ${DRAG_EASING}, box-shadow 160ms ${DRAG_EASING}`;
  node.style.transform = `translate3d(${Math.round(finalOffset)}px, 0px, 0) scale(1)`;
}

function previewIndexForOffset(active: ActiveDrag, dx: number): number {
  const source = active.layouts[active.sourceIndex];
  if (!source || active.sourceIndex < 0 || source.width <= 0) return active.sourceIndex;
  const activeLeft = source.left + dx;
  const activeRight = source.right + dx;
  let previewIndex = active.sourceIndex;

  if (dx > 0) {
    for (let index = active.sourceIndex + 1; index < active.layouts.length; index += 1) {
      const target = active.layouts[index];
      if (!target || target.width <= 0 || activeRight < target.left + target.width * OVERLAP_REORDER_RATIO) break;
      previewIndex = index;
    }
  } else if (dx < 0) {
    for (let index = active.sourceIndex - 1; index >= 0; index -= 1) {
      const target = active.layouts[index];
      if (!target || target.width <= 0 || activeLeft > target.right - target.width * OVERLAP_REORDER_RATIO) break;
      previewIndex = index;
    }
  }

  return previewIndex;
}

function applyPreviewMotion(active: ActiveDrag, previewIndex: number, nodes: Map<string, HTMLElement>): void {
  if (previewIndex === active.previewIndex) return;
  active.previewIndex = previewIndex;
  for (let index = 0; index < active.layouts.length; index += 1) {
    const layout = active.layouts[index];
    if (!layout || index === active.sourceIndex) continue;
    const node = nodes.get(layout.id);
    if (!node) continue;
    const shiftX = shiftForPreview(active.layouts, active.sourceIndex, previewIndex, index);
    if (shiftX === 0) {
      clearShiftMotion(node, false);
      continue;
    }
    node.dataset.dragShifted = "true";
    node.style.transition = `transform 160ms ${DRAG_EASING}`;
    node.style.transform = `translate3d(${Math.round(shiftX)}px, 0px, 0)`;
  }
}

function shiftForPreview(layouts: ItemLayout[], sourceIndex: number, previewIndex: number, itemIndex: number): number {
  const layout = layouts[itemIndex];
  if (!layout) return 0;
  if (previewIndex > sourceIndex && itemIndex > sourceIndex && itemIndex <= previewIndex) {
    const previous = layouts[itemIndex - 1];
    return previous ? previous.left - layout.left : 0;
  }
  if (previewIndex < sourceIndex && itemIndex >= previewIndex && itemIndex < sourceIndex) {
    const next = layouts[itemIndex + 1];
    return next ? next.left - layout.left : 0;
  }
  return 0;
}

function clearPreviewMotion(active: ActiveDrag, nodes: Map<string, HTMLElement>, immediate: boolean): void {
  for (const layout of active.layouts) {
    if (layout.id === active.id) continue;
    const node = nodes.get(layout.id);
    if (!node || node.dataset.dragShifted !== "true") continue;
    clearShiftMotion(node, immediate);
  }
}

function finalOffsetForPreview(active: ActiveDrag): number {
  const source = active.layouts[active.sourceIndex];
  const target = active.layouts[active.previewIndex];
  if (!source || !target) return 0;
  return target.left - source.left;
}

function shiftedIdsForPreview(active: ActiveDrag): string[] {
  return active.layouts
    .filter((layout, index) => layout.id !== active.id && shiftForPreview(active.layouts, active.sourceIndex, active.previewIndex, index) !== 0)
    .map((layout) => layout.id);
}

function clearCommittedMotion(commit: CommitCleanup, nodes: Map<string, HTMLElement>): void {
  const source = nodes.get(commit.sourceId);
  if (source) clearNodeMotion(source);
  for (const id of commit.shiftedIds) {
    const node = nodes.get(id);
    if (node) clearNodeMotion(node);
  }
}

function clearDeferredCommit(
  nodes: Map<string, HTMLElement>,
  pendingCommitCleanupRef: { current: CommitCleanup | null },
  commitCleanupTimerRef: { current: number | null },
): void {
  const pending = pendingCommitCleanupRef.current;
  if (pending) {
    clearCommittedMotion(pending, nodes);
    pendingCommitCleanupRef.current = null;
  }
  if (commitCleanupTimerRef.current !== null) {
    window.clearTimeout(commitCleanupTimerRef.current);
    commitCleanupTimerRef.current = null;
  }
}

function clearNodeMotion(node: HTMLElement): void {
  delete node.dataset.dragActive;
  delete node.dataset.dragDropSettling;
  delete node.dataset.dragSettling;
  delete node.dataset.dragShifted;
  node.style.pointerEvents = "";
  node.style.filter = "";
  node.style.boxShadow = "";
  node.style.zIndex = "";
  node.style.transition = "";
  node.style.transform = "";
}

function clearShiftMotion(node: HTMLElement, immediate: boolean): void {
  delete node.dataset.dragShifted;
  if (immediate) {
    node.style.transition = "";
    node.style.transform = "";
    return;
  }
  node.style.transition = `transform 160ms ${DRAG_EASING}`;
  node.style.transform = "";
  window.setTimeout(() => {
    if (node.dataset.dragShifted === "true") return;
    node.style.transition = "";
  }, 170);
}

function targetForPreview(active: ActiveDrag): { targetId: string; placement: ReorderPlacement } | null {
  if (active.previewIndex < 0 || active.previewIndex === active.sourceIndex) return null;
  const targetId = active.layouts[active.previewIndex]?.id;
  if (!targetId) return null;
  return {
    targetId,
    placement: active.previewIndex > active.sourceIndex ? "after" : "before",
  };
}

function targetForPoint(active: ActiveDrag, clientX: number, clientY: number): { targetId: string; placement: ReorderPlacement } | null {
  const targetId = findDropTargetId(clientX, clientY, active.id);
  if (!targetId) return null;
  const targetIndex = active.layouts.findIndex((layout) => layout.id === targetId);
  return {
    targetId,
    placement: targetIndex > active.sourceIndex ? "after" : "before",
  };
}

function findDropTargetId(clientX: number, clientY: number, sourceId: string): string | null {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return null;
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const card = element.closest("[data-reorder-card='true'][data-media-id]") as HTMLElement | null;
    const mediaId = card?.dataset.mediaId;
    if (mediaId && mediaId !== sourceId) return mediaId;
  }
  return null;
}

function shouldIgnorePointerTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest("[data-reorder-delete='true'],input,select,textarea,a"));
}

function safelySetPointerCapture(node: HTMLElement, pointerId: number): void {
  if (typeof node.setPointerCapture !== "function") return;
  try {
    node.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events and cancelled browser pointers can reject capture.
  }
}

function safelyReleasePointerCapture(node: HTMLElement, pointerId: number): void {
  if (typeof node.releasePointerCapture !== "function") return;
  try {
    if (typeof node.hasPointerCapture === "function" && !node.hasPointerCapture(pointerId)) return;
    node.releasePointerCapture(pointerId);
  } catch {
    // The pointer may already have been released by the browser.
  }
}
