export async function getServerJson<T>(path: `/${string}`): Promise<T> {
  const response = await fetch(`/api/server${path}`);
  if (!response.ok) {
    throw new Error("Server request failed");
  }
  return (await response.json()) as T;
}
