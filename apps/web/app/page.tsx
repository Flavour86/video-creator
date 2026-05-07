"use client";

import { useEffect, useState } from "react";

type ServerStatus = "checking" | "ok" | "down";

export default function HomePage() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");

  useEffect(() => {
    async function checkServer() {
      try {
        const response = await fetch("/api/server/health");
        setServerStatus(response.ok ? "ok" : "down");
      } catch {
        setServerStatus("down");
      }
    }

    void checkServer();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Video Creator</h1>
      <p className="text-sm opacity-70">
        Sidecar: <span className="font-mono">{serverStatus}</span>
      </p>
    </main>
  );
}
