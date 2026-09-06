// Tiny, dependency-free helpers shared by server storage code and client
// components. This module must stay free of Node/server-only imports so it can
// be bundled into client components safely.

/**
 * Extracts the storage key from a URL that points at the app proxy
 * (`/api/storage/<key>`). Returns null for external URLs.
 */
export function storageKeyFromUrl(url: string | null | undefined): string | null {
  const match = /\/api\/storage\/(.+)$/.exec(url || '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * True when the key lives inside one of the per-user namespaces (logos,
 * avatars or customers) and belongs to this user. Used to reject cross-user
 * delete attempts.
 */
export function isOwnedKey(key: string | null | undefined, userId: string): boolean {
  const match = /^(logos|avatars|customers)\/([^/]+)\//.exec(key || '');
  return Boolean(match && match[2] === userId);
}

/** Builds the absolute app URL for a storage key on a given origin. */
export function storageUrlFor(origin: string, key: string): string {
  const base = (origin || '').replace(/\/+$/, '');
  return `${base}/api/storage/${key}`;
}
