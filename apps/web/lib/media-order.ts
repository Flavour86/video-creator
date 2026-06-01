export type ReorderPlacement = "before" | "after";

export function moveIdBefore(ids: readonly string[], sourceId: string, targetId: string): string[] {
  return moveIdRelativeTo(ids, sourceId, targetId, "before");
}

export function moveIdRelativeTo(
  ids: readonly string[],
  sourceId: string,
  targetId: string,
  placement: ReorderPlacement,
): string[] {
  if (!sourceId || !targetId || sourceId === targetId) return [...ids];
  if (!ids.includes(sourceId) || !ids.includes(targetId)) return [...ids];
  const withoutSource = ids.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  if (targetIndex < 0) return [...ids];
  const insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...withoutSource.slice(0, insertionIndex),
    sourceId,
    ...withoutSource.slice(insertionIndex),
  ];
}

export function reorderItemsByIds<T>(
  items: readonly T[],
  orderedIds: readonly string[],
  idForItem: (item: T) => string | null | undefined,
): T[] {
  const orderSet = new Set(orderedIds);
  const itemsById = new Map<string, T>();
  for (const item of items) {
    const id = idForItem(item);
    if (!id || !orderSet.has(id) || itemsById.has(id)) continue;
    itemsById.set(id, item);
  }
  const orderedItems = orderedIds
    .map((id) => itemsById.get(id))
    .filter((item): item is T => item !== undefined);
  let orderedIndex = 0;
  return items.map((item) => {
    const id = idForItem(item);
    if (!id || !orderSet.has(id)) return item;
    const next = orderedItems[orderedIndex];
    orderedIndex += 1;
    return next ?? item;
  });
}
