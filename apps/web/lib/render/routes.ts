export function isValidRenderProjectId(value: string): boolean {
  return /^p_[A-Za-z0-9_-]+$/.test(value);
}

export function isValidRenderId(value: string): boolean {
  return /^r[-_][A-Za-z0-9_-]+$/.test(value);
}

export function renderRoute(projectId: string, renderId: string): `/render/${string}/${string}` {
  return `/render/${encodeURIComponent(projectId)}/${encodeURIComponent(renderId)}`;
}

export function firstSearchValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
