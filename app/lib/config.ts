export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (!path) return path;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalizedPath}` : normalizedPath;
}
