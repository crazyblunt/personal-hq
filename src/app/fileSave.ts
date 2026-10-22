/**
 * Offers a generated file to the user. Inside a Claude artifact the page
 * cannot start downloads itself, so it asks the viewer through the
 * `downloads` capability (the viewer confirms). Elsewhere (local dev,
 * a normal web host) it falls back to a regular browser download.
 */
interface DownloadsApi {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

async function downloadsApi(): Promise<DownloadsApi | null> {
  const use = window.claude?.use;
  if (typeof use !== 'function') return null;
  try {
    const api = await Promise.race([use.call(window.claude, 'downloads'), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
    return api && typeof (api as DownloadsApi).save === 'function' ? (api as DownloadsApi) : null;
  } catch {
    return null;
  }
}

/** True when running inside a host (such as a Claude artifact) that controls downloads. */
export const insideArtifactHost = () => typeof window.claude?.use === 'function';

export async function saveTextFile(filename: string, text: string, mime = 'application/json'): Promise<SaveOutcome> {
  const api = await downloadsApi();
  if (api) {
    try {
      await api.save({ filename, data: text });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  if (insideArtifactHost()) return 'unavailable';
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
