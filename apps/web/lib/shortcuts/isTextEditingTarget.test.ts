import { describe, expect, it } from "vitest";
import { isTextEditingTarget } from "./isTextEditingTarget";

describe("isTextEditingTarget", () => {
  it("returns true for direct form controls and contenteditable targets", () => {
    expect(isTextEditingTarget(document.createElement("input"))).toBe(true);
    expect(isTextEditingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTextEditingTarget(document.createElement("select"))).toBe(true);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTextEditingTarget(editable)).toBe(true);
  });

  it("returns true for descendants inside a contenteditable container", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.appendChild(child);
    expect(isTextEditingTarget(child)).toBe(true);
  });

  it("returns false for non-editing targets", () => {
    expect(isTextEditingTarget(document.createElement("button"))).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });
});
