import { openDB, type IDBPDatabase } from 'idb';
import { BUILTINS } from './builtins';
import type { AnimSettings, AnimType, CaptionSettings, Clip, Draft, Picture, Settings } from './types';

/** 모든 데이터는 이 기기의 IndexedDB에만 저장됩니다. 서버로 보내지 않습니다. */
const DB_NAME = 'mallang-record';

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('pictures', { keyPath: 'id' });
        d.createObjectStore('clips', { keyPath: 'id' });
        d.createObjectStore('drafts', { keyPath: 'id' });
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export const uid = () =>
  (crypto as any).randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function defaultAnim(type: AnimType): AnimSettings {
  return { type, intensity: 1, speed: 1, sensitivity: 0.5, effects: true, sparkles: true, mouth: true };
}

export function defaultCaption(text: string): CaptionSettings {
  return { show: true, text, mode: 'voice', size: 1, position: 0.5, color: '#3A3350', font: 'hand' };
}

/** 처음 실행 시 기본 그림 23종을 등록 (이미 있는 것은 건너뜀) */
export async function ensureSeeded() {
  const d = await db();
  const all: Picture[] = await d.getAll('pictures');
  const have = new Set(all.map((p) => p.builtinKey).filter(Boolean));
  const tx = d.transaction('pictures', 'readwrite');
  let i = 0;
  for (const b of BUILTINS) {
    i++;
    if (have.has(b.key)) continue;
    const now = Date.now() + i; // 순서 유지
    const p: Picture = {
      id: 'b-' + b.key,
      name: b.name,
      category: b.category,
      builtinKey: b.key,
      anim: defaultAnim(b.anim),
      transform: { scale: 1, x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
    };
    await tx.store.put(p);
  }
  await tx.done;
}

export async function listPictures(): Promise<Picture[]> {
  const all: Picture[] = await (await db()).getAll('pictures');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}
export async function getPicture(id: string): Promise<Picture | undefined> {
  return (await db()).get('pictures', id);
}
export async function putPicture(p: Picture) {
  p.updatedAt = Date.now();
  await (await db()).put('pictures', p);
}
export async function deletePicture(p: Picture) {
  if (p.builtinKey) {
    // 기본 그림은 숨기기만 (설정에서 다시 꺼낼 수 있음)
    await putPicture({ ...p, hidden: true });
  } else {
    await (await db()).delete('pictures', p.id);
  }
}
export async function restoreHiddenBuiltins() {
  const all = await listPictures();
  for (const p of all) if (p.builtinKey && p.hidden) await putPicture({ ...p, hidden: false });
}

export async function listClips(): Promise<Clip[]> {
  const all: Clip[] = await (await db()).getAll('clips');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getClip(id: string): Promise<Clip | undefined> {
  return (await db()).get('clips', id);
}
export async function putClip(c: Clip) {
  await (await db()).put('clips', c);
}
export async function deleteClip(id: string) {
  await (await db()).delete('clips', id);
}

export async function saveDraft(d: Draft) {
  await (await db()).put('drafts', d);
}
export async function getDraft(): Promise<Draft | undefined> {
  return (await db()).get('drafts', 'last');
}
export async function clearDraft() {
  await (await db()).delete('drafts', 'last');
}

export async function getSettings(): Promise<Settings> {
  return ((await (await db()).get('kv', 'settings')) as Settings) ?? { childName: '' };
}
export async function saveSettings(s: Settings) {
  await (await db()).put('kv', s, 'settings');
}

/** 이 기기에 저장된 말랑기록 데이터를 모두 지웁니다 */
export async function wipeAll() {
  const d = await db();
  for (const s of ['pictures', 'clips', 'drafts', 'kv']) await d.clear(s);
}

/** 백업용 */
export async function dumpAll() {
  const d = await db();
  return {
    pictures: (await d.getAll('pictures')) as Picture[],
    clips: (await d.getAll('clips')) as Clip[],
    settings: await getSettings(),
  };
}
export async function rawDb() {
  return db();
}

export function monthsBetween(birth: string | undefined, at: number): number | undefined {
  if (!birth) return undefined;
  const b = new Date(birth + 'T00:00:00');
  if (isNaN(b.getTime())) return undefined;
  const a = new Date(at);
  let m = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (a.getDate() < b.getDate()) m -= 1;
  return m >= 0 ? m : undefined;
}

export function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}
