import { useEffect, useRef, useState } from "react";

/**
 * RAF-driven currentTime that polls at ~60fps for smooth playhead movement.
 * Pass a stable `getTime` callback (e.g. () => wavesurferInstance.getCurrentTime()).
 * Returns 0 and stops polling when getTime is null.
 */
export function usePlaybackTime(getTime: (() => number) | null): number {
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!getTime) return;

    function tick() {
      setCurrentTime(getTime!());
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [getTime]);

  return currentTime;
}
