/**
 * Typed wrappers over chrome.storage.local. All values are JSON-serializable.
 */

/**
 * Get a single key from chrome.storage.local. Returns null if absent.
 */
export async function storageGet<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  return value === undefined ? null : (value as T);
}

/**
 * Set a single key in chrome.storage.local.
 */
export async function storageSet<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Remove one or more keys from chrome.storage.local.
 */
export async function storageRemove(keys: string | string[]): Promise<void> {
  await chrome.storage.local.remove(keys);
}

/**
 * Get multiple keys at once. Missing keys are returned as null.
 */
export async function storageGetMany<T extends Record<string, unknown>>(
  keys: (keyof T)[]
): Promise<Partial<T>> {
  const result = await chrome.storage.local.get(keys as string[]);
  const out: Partial<T> = {};
  for (const k of keys) {
    const v = result[k as string];
    if (v !== undefined) {
      out[k] = v as T[keyof T];
    }
  }
  return out;
}
