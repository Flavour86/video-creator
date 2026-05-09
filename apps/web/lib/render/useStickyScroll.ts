import { RefObject, useCallback, useRef, useState } from "react";

export function useStickyScroll(ref: RefObject<HTMLElement | null>, threshold = 8) {
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nextPaused = distance > threshold;
    pausedRef.current = nextPaused;
    setPaused(nextPaused);
  }, [ref, threshold]);

  const follow = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    pausedRef.current = false;
    setPaused(false);
  }, [ref]);

  const scrollIfSticky = useCallback(() => {
    if (!pausedRef.current) {
      follow();
    }
  }, [follow]);

  return { follow, onScroll, paused, scrollIfSticky };
}
