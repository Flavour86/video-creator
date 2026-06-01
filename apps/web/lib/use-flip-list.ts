import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

type FlipOptions = {
  durationMs?: number;
  easing?: string;
};

const DEFAULT_DURATION_MS = 220;
const DEFAULT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export function useFlipList(ids: readonly string[], options: FlipOptions = {}) {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const previousRectsRef = useRef(new Map<string, DOMRect>());
  const idsKey = ids.join("\u0000");
  const orderedIds = useMemo(() => [...ids], [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const easing = options.easing ?? DEFAULT_EASING;

  const registerNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      nodesRef.current.set(id, node);
      return;
    }
    nodesRef.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    for (const id of orderedIds) {
      const node = nodesRef.current.get(id);
      if (!node) continue;
      nextRects.set(id, node.getBoundingClientRect());
    }

    if (!prefersReducedMotion()) {
      for (const [id, nextRect] of nextRects) {
        const previousRect = previousRectsRef.current.get(id);
        const node = nodesRef.current.get(id);
        if (!previousRect || !node || typeof node.animate !== "function") continue;
        const dx = previousRect.left - nextRect.left;
        const dy = previousRect.top - nextRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        node.animate(
          [
            {
              transform: `translate(${dx}px, ${dy}px)`,
              filter: "brightness(1.12)",
            },
            {
              transform: "translate(0, 0)",
              filter: "brightness(1)",
            },
          ],
          { duration: durationMs, easing },
        );
      }
    }

    previousRectsRef.current = nextRects;
  }, [durationMs, easing, orderedIds]);

  return useMemo(() => registerNode, [registerNode]);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
