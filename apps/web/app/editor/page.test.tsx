import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";

// Mutable so individual tests can override the "project" param value
let _projectParam: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === "project" ? _projectParam : null) }),
}));

beforeEach(() => {
  _projectParam = null;
  global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
});

// EditorPage wraps EditorContent in Suspense internally
import EditorPage from "./page";

function renderEditor() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Suspense fallback={null}>
        <EditorPage />
      </Suspense>
    </NextIntlClientProvider>,
  );
}

it("shows no-project message when project param is absent", () => {
  renderEditor();
  expect(screen.getByText(/No project open/i)).toBeInTheDocument();
});

it("shows project path in toolbar when project param is present", () => {
  _projectParam = "E:/projects/demo";
  renderEditor();
  expect(screen.getByText("E:/projects/demo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /render draft/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /render final/i })).toBeInTheDocument();
});
