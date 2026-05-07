"use client";

import { FormEvent, useState } from "react";

type SubmitState = "idle" | "saving" | "saved" | "error";

export default function NewProjectPage() {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const response = await fetch("/api/server/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, name }),
    });
    const body = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(body.error?.message ?? "Project could not be created.");
      return;
    }
    setState("saved");
    setMessage(`Created ${body.name}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">New Project</h1>
        <p className="mt-2 text-sm opacity-70">Choose an empty folder and project name.</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Name
          <input
            className="rounded border border-neutral-300 bg-transparent px-3 py-2 text-base"
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Folder path
          <input
            className="rounded border border-neutral-300 bg-transparent px-3 py-2 font-mono text-sm"
            onChange={(event) => setPath(event.target.value)}
            required
            type="text"
            value={path}
          />
        </label>
        <button
          className="rounded bg-neutral-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={state === "saving"}
          type="submit"
        >
          {state === "saving" ? "Creating..." : "Create Project"}
        </button>
      </form>
      {message ? (
        <p className={state === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}>
          {message}
        </p>
      ) : null}
    </main>
  );
}
