import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRenderHotkeys } from "./useRenderHotkeys";

describe("useRenderHotkeys", () => {
  const handlers = {
    onBack: vi.fn(),
    onCancel: vi.fn(),
    onPlay: vi.fn(),
    onReveal: vi.fn(),
  };

  beforeEach(() => {
    handlers.onBack.mockReset();
    handlers.onCancel.mockReset();
    handlers.onPlay.mockReset();
    handlers.onReveal.mockReset();
  });

  it("does not fire shortcuts while typing in guarded targets", () => {
    renderHook(() => useRenderHotkeys({ job: null, ...handlers }));

    const targets = [
      document.createElement("input"),
      document.createElement("textarea"),
      document.createElement("select"),
      (() => {
        const editable = document.createElement("div");
        editable.setAttribute("contenteditable", "true");
        return editable;
      })(),
      (() => {
        const editable = document.createElement("div");
        editable.setAttribute("contenteditable", "true");
        const child = document.createElement("span");
        editable.appendChild(child);
        return child;
      })(),
    ];

    for (const target of targets) {
      const event = new KeyboardEvent("keydown", { bubbles: true, ctrlKey: true, key: "b" });
      Object.defineProperty(event, "target", { configurable: true, value: target });
      window.dispatchEvent(event);
    }

    expect(handlers.onBack).not.toHaveBeenCalled();
  });

  it("fires shortcuts when event target is not a typing surface", () => {
    renderHook(() => useRenderHotkeys({ job: null, ...handlers }));
    const event = new KeyboardEvent("keydown", { bubbles: true, ctrlKey: true, key: "b" });
    Object.defineProperty(event, "target", { configurable: true, value: document.createElement("button") });
    window.dispatchEvent(event);
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });
});
