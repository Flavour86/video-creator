import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useAssignModal } from "./useAssignModal";

beforeEach(() => {
  useAssignModal.setState({
    isOpen: false,
    fromSentence: 1,
    toSentence: 1,
    editItemId: undefined,
    editLayerId: undefined,
  });
});

describe("initial state", () => {
  it("is closed with default sentence range", () => {
    const { result } = renderHook(() => useAssignModal());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.fromSentence).toBe(1);
    expect(result.current.toSentence).toBe(1);
    expect(result.current.editItemId).toBeUndefined();
    expect(result.current.editLayerId).toBeUndefined();
  });
});

describe("openForSentence", () => {
  it("opens modal with from and to set to the given index", () => {
    const { result } = renderHook(() => useAssignModal());
    act(() => result.current.openForSentence(6));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.fromSentence).toBe(6);
    expect(result.current.toSentence).toBe(6);
    expect(result.current.editItemId).toBeUndefined();
  });
});

describe("openForEdit", () => {
  it("opens modal in edit mode with provided layer, item, and range", () => {
    const { result } = renderHook(() => useAssignModal());
    act(() => result.current.openForEdit("layer-1", "item-42", 3, 7));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.editLayerId).toBe("layer-1");
    expect(result.current.editItemId).toBe("item-42");
    expect(result.current.fromSentence).toBe(3);
    expect(result.current.toSentence).toBe(7);
  });
});

describe("close", () => {
  it("sets isOpen to false", () => {
    const { result } = renderHook(() => useAssignModal());
    act(() => result.current.openForSentence(2));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });
});
