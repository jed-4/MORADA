import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Get the API base URL
 * - Web app: uses relative URLs (same domain)
 * - Mobile app: uses environment variable pointing to backend server
 */
export function getApiBaseUrl(): string {
  // Mobile apps will set VITE_API_BASE_URL to point to backend
  // Web app leaves it undefined to use relative URLs
  return import.meta.env.VITE_API_BASE_URL || "";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Attempt to parse the body as JSON so callers can read structured fields
    // (e.g. error.payload.attachment) without re-fetching. Falls back to the
    // raw string if the body wasn't JSON.
    let payload: any = undefined;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
    }
    const messageFromBody =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : (payload && typeof payload === "object" && typeof payload.message === "string"
          ? payload.message
          : text);
    const err = new Error(`${res.status}: ${messageFromBody}`) as Error & {
      status?: number;
      payload?: any;
      body?: string;
    };
    err.status = res.status;
    err.payload = payload;
    err.body = text;
    throw err;
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<any> {
  const baseUrl = getApiBaseUrl();
  const fullUrl = `${baseUrl}${url}`;
  
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // Handle 204 No Content responses (e.g., successful DELETE)
  if (res.status === 204) {
    return null;
  }
  
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiBaseUrl();
    const fullUrl = `${baseUrl}${queryKey.join("/")}`;
    
    const res = await fetch(fullUrl, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
