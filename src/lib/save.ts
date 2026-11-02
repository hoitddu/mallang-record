/** 파일 내보내기: iPhone은 공유 시트("동영상 저장"), 그 밖은 다운로드 */

declare global {
  interface Window {
    claude?: { use?: (name: string) => Promise<any> };
  }
}

async function claudeDownloads(): Promise<any | null> {
  try {
    if (!window.claude?.use) return null;
    const p = window.claude.use('downloads');
    const timeout = new Promise((r) => setTimeout(() => r(null), 3000));
    return (await Promise.race([p, timeout])) as any;
  } catch {
    return null;
  }
}

export function canShareFile(blob: Blob, name: string) {
  try {
    const f = new File([blob], name, { type: blob.type });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
}

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/** 공유 시트 열기 (iPhone: "동영상 저장" → 사진 앱) */
export async function shareFile(blob: Blob, name: string, title = '말랑기록'): Promise<SaveOutcome> {
  const f = new File([blob], name, { type: blob.type });
  try {
    await navigator.share({ files: [f], title });
    return 'shared';
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

/** 기기에 파일로 받기 */
export async function downloadFile(blob: Blob, name: string): Promise<SaveOutcome> {
  const dl = await claudeDownloads();
  if (dl) {
    try {
      await dl.save({ filename: name, data: blob });
      return 'downloaded';
    } catch (e: any) {
      if (e?.code === 'declined') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
