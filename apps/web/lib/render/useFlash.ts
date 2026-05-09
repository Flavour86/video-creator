import { useEffect, useState } from "react";

export function useFlash(value: unknown, ms = 700) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!value) return;
    setFlashing(true);
    const id = window.setTimeout(() => setFlashing(false), ms);
    return () => window.clearTimeout(id);
  }, [ms, value]);

  return flashing;
}
