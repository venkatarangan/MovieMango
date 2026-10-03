export type ShareOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled';

export const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Mobile: the system share sheet, with the .txt attached when supported. Elsewhere: download the .txt. */
export async function shareText(title: string, text: string, filename: string): Promise<ShareOutcome> {
  if (canNativeShare()) {
    const file = new File([text], filename, { type: 'text/plain' });
    const withFile = navigator.canShare?.({ files: [file] }) ? { files: [file] } : {};
    try {
      await navigator.share({ title, text, ...withFile });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Fall through to download if sharing failed for another reason.
    }
  }
  downloadText(text, filename);
  return 'downloaded';
}

export function downloadText(text: string, filename: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
