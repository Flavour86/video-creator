export type ServerRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export class ServerRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super("Server request failed");
    this.name = "ServerRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export async function request<T>(path: `/${string}`, options: ServerRequestOptions = {}): Promise<T> {
  if (Object.keys(options).length === 0) {
    const response = await fetch(`/api/server${path}`);
    if (!response.ok) {
      throw await requestError(response);
    }
    return (await response.json()) as T;
  }

  const { body, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  const init: RequestInit = { ...requestOptions, headers };
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`/api/server${path}`, init);
  if (!response.ok) {
    throw await requestError(response);
  }
  return (await response.json()) as T;
}

export async function getServerJson<T>(path: `/${string}`): Promise<T> {
  return request<T>(path);
}

async function requestError(response: Response): Promise<ServerRequestError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return new ServerRequestError(response.status, payload);
}
