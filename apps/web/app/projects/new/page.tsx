"use client";

import { type FormEvent, useState } from "react";
import { PageChrome } from "@/components/app-shell/PageChrome";
import { Button, Field, Surface, TextInput } from "@/components/ui";

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
    <PageChrome>
      <header className="grid gap-(--space-2)">
        <p className="vc-type-eyebrow text-(--text-3)">Local workspace</p>
        <h1 className="vc-type-display text-(--text)">New Project</h1>
        <p className="vc-type-body text-(--text-2)">Choose an empty local folder and project name.</p>
      </header>

      <Surface className="grid gap-(--space-6)" tone="raised">
        <form className="grid gap-(--space-4)" onSubmit={handleSubmit}>
          <Field htmlFor="project-name" label="Name">
            <TextInput
              id="project-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>
          <Field htmlFor="project-path" label="Folder path" hint="Use a local folder that Video Creator can initialize.">
            <TextInput
              className="font-mono"
              id="project-path"
              onChange={(event) => setPath(event.target.value)}
              required
              value={path}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-(--space-3)">
            <Button disabled={state === "saving"} type="submit" variant="primary">
              {state === "saving" ? "Creating..." : "Create Project"}
            </Button>
            {message ? (
              <p className={state === "error" ? "vc-type-body text-(--red)" : "vc-type-body text-(--green)"}>
                {message}
              </p>
            ) : null}
          </div>
        </form>
      </Surface>
    </PageChrome>
  );
}
