/**
 * Small per-device conveniences (recently opened items, the running focus
 * timer) that don't belong in the workspace backup. Reads and writes never
 * throw: when storage is unavailable they simply do nothing.
 */
export function readDevice<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(`phq:device:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeDevice(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(`phq:device:${key}`, JSON.stringify(value));
  } catch {
    /* storage blocked or full: the convenience is lost, nothing else */
  }
}
