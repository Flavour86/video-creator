import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewProjectPage from "./page";

function fillForm(name: string, path: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: path } });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

it("renders page heading", () => {
  render(<NewProjectPage />);
  expect(screen.getByText("New Project")).toBeInTheDocument();
});

it("renders name and folder path inputs", () => {
  render(<NewProjectPage />);
  expect(screen.getByLabelText("Name")).toBeInTheDocument();
  expect(screen.getByLabelText("Folder path")).toBeInTheDocument();
});

it("renders Create Project button", () => {
  render(<NewProjectPage />);
  expect(screen.getByRole("button", { name: /create project/i })).toBeInTheDocument();
});

describe("form submission", () => {
  it("button shows Creating... while saving", async () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));

    render(<NewProjectPage />);
    fillForm("My Vid", "C:/vids");
    fireEvent.submit(screen.getByRole("button", { name: /create project/i }).closest("form")!);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /creating/i })).toBeInTheDocument(),
    );
    act(() => resolve({ ok: true, json: async () => ({ name: "My Vid" }) }));
  });

  it("shows success message after creation", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "My Vid" }),
    });

    render(<NewProjectPage />);
    fillForm("My Vid", "C:/vids");
    fireEvent.submit(screen.getByRole("button").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/Created My Vid/)).toBeInTheDocument(),
    );
  });

  it("shows error message when API fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Path already exists." } }),
    });

    render(<NewProjectPage />);
    fillForm("My Vid", "C:/vids");
    fireEvent.submit(screen.getByRole("button").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Path already exists.")).toBeInTheDocument(),
    );
  });

  it("sends name and path to the server", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "X" }),
    });

    render(<NewProjectPage />);
    fillForm("X", "D:/x");
    fireEvent.submit(screen.getByRole("button").closest("form")!);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url as string).toContain("/projects");
    const body = JSON.parse((opts as RequestInit).body as string) as { name: string; path: string };
    expect(body.name).toBe("X");
    expect(body.path).toBe("D:/x");
  });
});
