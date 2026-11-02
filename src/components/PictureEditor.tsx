import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultAnim, deletePicture, putPicture, uid } from '../lib/db';
import { canvasToBlob, normalizeUpload, prepare, removeSolidBackground, type Prepared } from '../lib/images';
import { computeTrack, demoRms, estimateFloor, frameAt, IDLE_FRAME } from '../lib/motion';
import { drawBackground, drawIllustration } from '../lib/render';
import type { Category, Picture } from '../lib/types';
import { guessAnim } from '../lib/builtins';
import { useApp } from '../store';
import { AnimControls } from './AnimControls';
import { Stage } from './Stage';
import { Chips, ConfirmButton, Sheet, Slider } from './ui';

export const CATEGORY_OPTIONS: { v: Category; label: string }[] = [
  { v: 'fruit', label: '과일·채소' },
  { v: 'animal', label: '동물' },
  { v: 'thing', label: '자연·사물' },
  { v: 'custom', label: '기타' },
];

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/*';

export function newPicture(name = ''): Picture {
  const now = Date.now();
  return {
    id: 'u-' + uid(),
    name,
    category: 'custom',
    anim: defaultAnim(guessAnim(name)),
    transform: { scale: 1, x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

export function PictureEditor({ picture, onClose, onSaved }: { picture: Picture | null; onClose: () => void; onSaved?: (p: Picture) => void }) {
  const { reloadPictures, toast } = useApp();
  const isNew = !picture;
  const [d, setD] = useState<Picture>(() => (picture ? structuredCloneSafe(picture) : newPicture()));
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoStart, setDemoStart] = useState<number | null>(null);
  const [bgOpen, setBgOpen] = useState(false);
  const [tol, setTol] = useState(30);
  const [bgPreview, setBgPreview] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!d.image && !d.builtinKey) {
      setPrep(null);
      return;
    }
    prepare(d).then((p) => alive && setPrep(p)).catch((e) => setErr(e.message));
    return () => {
      alive = false;
    };
  }, [d.image, d.builtinKey]);

  const demo = useMemo(() => {
    const rms = demoRms(4.2);
    return computeTrack(rms, { sensitivity: d.anim.sensitivity, speed: d.anim.speed }, estimateFloor(rms));
  }, [d.anim.sensitivity, d.anim.speed]);

  const set = (p: Partial<Picture>) => setD((o) => ({ ...o, ...p }));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const blob = await normalizeUpload(f);
      const name = d.name || f.name.replace(/\.[^.]+$/, '').slice(0, 20);
      setD((o) => ({
        ...o,
        image: blob,
        originalImage: blob,
        transform: { scale: 1, x: 0, y: 0 },
        name,
        anim: isNew && !o.name ? defaultAnim(guessAnim(name)) : o.anim,
      }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function runBg(t: number) {
    if (!d.originalImage) return;
    setBusy(true);
    try {
      const c = await removeSolidBackground(d.originalImage, t);
      setBgPreview((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { canvas: c, url: '' };
      });
      const blob = await canvasToBlob(c);
      setBgPreview({ canvas: c, url: URL.createObjectURL(blob) });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyBg() {
    if (!bgPreview) return;
    const blob = await canvasToBlob(bgPreview.canvas);
    set({ image: blob });
    URL.revokeObjectURL(bgPreview.url);
    setBgPreview(null);
    setBgOpen(false);
  }

  async function save() {
    if (!d.name.trim()) return setErr('단어 이름을 적어 주세요');
    if (!d.image && !d.builtinKey) return setErr('그림을 올려 주세요');
    const p = { ...d, name: d.name.trim() };
    await putPicture(p);
    await reloadPictures();
    toast(isNew ? `"${p.name}" 그림을 추가했어요` : '저장했어요');
    onSaved?.(p);
    onClose();
  }

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
    drawBackground(ctx, W, H);
    const S = W * 0.62;
    // 그림 상자 표시 (영상 속 그림 자리)
    ctx.save();
    ctx.setLineDash([W * 0.015, W * 0.012]);
    ctx.strokeStyle = 'rgba(125,117,144,0.35)';
    ctx.lineWidth = Math.max(1, W * 0.004);
    ctx.strokeRect(W / 2 - S / 2, H / 2 - S / 2, S, S);
    ctx.restore();
    if (!prep) return;
    let m = { ...IDLE_FRAME, t: now };
    if (demoStart !== null) {
      const t = now - demoStart;
      if (t > demo.duration + 0.8) setTimeout(() => setDemoStart(null));
      m = frameAt(demo, t);
      m.t = now;
    }
    drawIllustration(ctx, S, W / 2, H / 2, prep, d.transform, d.anim, m);
  };

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>, W: number) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const S = rect.width * 0.62;
    if (e.type === 'pointerdown') {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, tx: d.transform.x, ty: d.transform.y };
    } else if (e.type === 'pointermove' && drag.current) {
      const nx = drag.current.tx + (e.clientX - drag.current.x) / S;
      const ny = drag.current.ty + (e.clientY - drag.current.y) / S;
      set({ transform: { ...d.transform, x: clampN(nx), y: clampN(ny) } });
    } else if (e.type === 'pointerup') drag.current = null;
    void W;
  };

  const replaced = !!d.builtinKey && !!d.image;
  const bgApplied = !!d.image && !!d.originalImage && d.image !== d.originalImage;

  return (
    <Sheet open onClose={onClose} title={isNew ? '새 단어 그림 추가' : `"${picture!.name}" 그림 편집`}>
      <div className="space-y-5 pb-4">
        <div>
          <Stage draw={draw} aspect={1} maxHeight="40dvh" onPointer={prep ? onPointer : undefined} />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button className="btn-sky !py-2.5 text-[15px]" disabled={!prep} onClick={() => setDemoStart(performance.now() / 1000)}>
              예시 소리로 움직여 보기
            </button>
          </div>
          <p className="hint mt-1 text-center">예시 소리 패턴으로 움직임만 보여줘요. 그림을 끌어서 위치를 옮길 수 있어요.</p>
        </div>

        {err && <p className="cut bg-berry/10 px-4 py-2.5 text-[14px] text-berry">{err}</p>}

        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn-main !py-2.5 text-[15px]" onClick={() => fileRef.current?.click()} disabled={busy}>
              {d.image ? '그림 바꾸기' : d.builtinKey ? '내 그림으로 바꾸기' : '그림 올리기'}
            </button>
            {replaced && (
              <button
                className="btn-sheet !py-2.5 text-[15px]"
                onClick={() => set({ image: undefined, originalImage: undefined, transform: { scale: 1, x: 0, y: 0 } })}
              >
                원래 그림으로 되돌리기
              </button>
            )}
            {d.originalImage && (
              <button className="btn-sheet !py-2.5 text-[15px]" onClick={() => { setBgOpen((v) => !v); if (!bgPreview) runBg(tol); }}>
                단색 배경 지우기
              </button>
            )}
            {bgApplied && (
              <button className="btn-ghost text-[14px]" onClick={() => set({ image: d.originalImage })}>
                배경 지우기 전으로
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <p className="hint">배경이 투명한 PNG·WebP가 가장 예뻐요. JPG도 쓸 수 있어요. 올린 그림은 다시 그리지 않고 그대로 움직여요.</p>

          {bgOpen && d.originalImage && (
            <div className="card space-y-3 p-4">
              <p className="label">배경 지우기 미리보기</p>
              <div className="checker cut grid aspect-square w-full max-w-[260px] place-items-center overflow-hidden justify-self-center mx-auto">
                {bgPreview?.url ? <img src={bgPreview.url} alt="배경을 지운 결과" className="max-h-full max-w-full object-contain" /> : <span className="hint">만드는 중…</span>}
              </div>
              <Slider id="bg-tol" label="지우는 범위" value={tol} min={5} max={80} step={1} onChange={(v) => setTol(v)} format={(v) => `${Math.round(v)}`} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-sheet !py-2.5 text-[15px]" onClick={() => runBg(tol)} disabled={busy}>
                  다시 보기
                </button>
                <button className="btn-leaf !py-2.5 text-[15px]" onClick={applyBg} disabled={!bgPreview?.url || busy}>
                  이대로 적용
                </button>
                <button className="btn-ghost" onClick={() => { setBgOpen(false); if (bgPreview) URL.revokeObjectURL(bgPreview.url); setBgPreview(null); }}>
                  취소
                </button>
              </div>
              <p className="hint">원본은 그대로 보관돼요. 마음에 안 들면 "배경 지우기 전으로"를 누르세요.</p>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <label htmlFor="pic-name" className="label block">
            단어 이름
          </label>
          <input id="pic-name" className="field" value={d.name} maxLength={20} placeholder="예: 사과, 붕붕, 엄마" onChange={(e) => set({ name: e.target.value })} />
          <p className="label">분류</p>
          <Chips value={d.category} options={CATEGORY_OPTIONS} onChange={(v) => set({ category: v })} />
        </section>

        <section className="space-y-2">
          <p className="label">크기와 위치</p>
          <Slider id="tf-scale" label="크기" value={d.transform.scale} min={0.4} max={1.6} onChange={(v) => set({ transform: { ...d.transform, scale: v } })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider id="tf-x" label="좌우" value={d.transform.x} min={-0.4} max={0.4} step={0.01} onChange={(v) => set({ transform: { ...d.transform, x: v } })} format={(v) => (Math.abs(v) < 0.005 ? '가운데' : v < 0 ? '왼쪽' : '오른쪽')} />
          <Slider id="tf-y" label="위아래" value={d.transform.y} min={-0.4} max={0.4} step={0.01} onChange={(v) => set({ transform: { ...d.transform, y: v } })} format={(v) => (Math.abs(v) < 0.005 ? '가운데' : v < 0 ? '위' : '아래')} />
          <button className="btn-ghost" onClick={() => set({ transform: { scale: 1, x: 0, y: 0 } })}>
            가운데로 맞추기
          </button>
        </section>

        <section>
          <AnimControls idPrefix="pic" value={d.anim} onChange={(anim) => set({ anim })} hasMouth={!!d.builtinKey && !d.image} />
        </section>

        <div className="sticky bottom-0 -mx-1 flex items-center gap-2 bg-paper/95 py-3 backdrop-blur">
          {!isNew && (
            <ConfirmButton
              label={picture!.builtinKey ? '목록에서 숨기기' : '삭제'}
              confirmLabel="한 번 더 누르면 삭제"
              onConfirm={async () => {
                await deletePicture(picture!);
                await reloadPictures();
                toast(picture!.builtinKey ? '숨겼어요. 설정에서 다시 꺼낼 수 있어요' : '삭제했어요');
                onClose();
              }}
            />
          )}
          <span className="flex-1" />
          <button className="btn-main" onClick={save} disabled={busy}>
            저장
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function clampN(v: number) {
  return Math.max(-0.45, Math.min(0.45, v));
}

function structuredCloneSafe<T>(o: T): T {
  // Blob은 그대로 두고 나머지만 복사
  return { ...(o as any), anim: { ...(o as any).anim }, transform: { ...(o as any).transform } };
}
