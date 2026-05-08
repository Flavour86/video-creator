import { useCallback, useEffect, useState } from "react";

import type { RuntimeHealthResponse } from "@vc/shared-schemas";
import { getServerJson } from "@/lib/api/server";

type RuntimeStatusState = {
  status: RuntimeHealthResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useRuntimeStatus(): RuntimeStatusState {
  const [status, setStatus] = useState<RuntimeHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const runtimeStatus = await getServerJson<RuntimeHealthResponse>("/health");
      setStatus(runtimeStatus);
      setError(null);
    } catch {
      setStatus(null);
      setError("Runtime status unavailable");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, isLoading, error, refresh };
}
