export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (target.isContentEditable || target.getAttribute("contenteditable") === "true") return true;
  return Boolean(target.closest("[contenteditable]:not([contenteditable='false'])"));
}
