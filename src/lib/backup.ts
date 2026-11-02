import { dumpAll, putClip, putPicture, saveSettings } from './db';
import type { Clip, Picture } from './types';

/** 기기 안 데이터를 파일 하나로 백업 (그림·녹음 포함). 서버로 보내지 않습니다. */

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
async function dataUrlToBlob(u: string): Promise<Blob> {
  const [head, body] = u.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function encodeBlobs(obj: any): Promise<any> {
  if (obj instanceof Blob) return { __blob: await blobToDataUrl(obj) };
  if (Array.isArray(obj)) return Promise.all(obj.map(encodeBlobs));
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = await encodeBlobs(v);
    return out;
  }
  return obj;
}
async function decodeBlobs(obj: any): Promise<any> {
  if (obj && typeof obj === 'object' && typeof obj.__blob === 'string') return dataUrlToBlob(obj.__blob);
  if (Array.isArray(obj)) return Promise.all(obj.map(decodeBlobs));
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = await decodeBlobs(v);
    return out;
  }
  return obj;
}

export async function makeBackup(): Promise<Blob> {
  const all = await dumpAll();
  const enc = await encodeBlobs({ app: 'mallang-record', version: 1, savedAt: Date.now(), ...all });
  return new Blob([JSON.stringify(enc)], { type: 'application/json' });
}

export async function restoreBackup(file: Blob): Promise<{ pictures: number; clips: number }> {
  const json = JSON.parse(await file.text());
  if (json?.app !== 'mallang-record') throw new Error('말랑기록 백업 파일이 아니에요');
  const data = await decodeBlobs(json);
  for (const p of (data.pictures ?? []) as Picture[]) await putPicture(p);
  for (const c of (data.clips ?? []) as Clip[]) await putClip(c);
  if (data.settings) await saveSettings(data.settings);
  return { pictures: data.pictures?.length ?? 0, clips: data.clips?.length ?? 0 };
}
