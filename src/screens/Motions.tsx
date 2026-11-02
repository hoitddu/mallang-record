import { useEffect, useMemo, useRef, useState } from 'react';
import { ANIM_OPTIONS } from '../components/AnimControls';
import { Stage } from '../components/Stage';
import { Chips, Notice, TopBar } from '../components/ui';
import { unlockAudio } from '../lib/audio';
import { micErrorMessage, micSupport, type FriendlyError } from '../lib/env';
import { prepare, type Prepared } from '../lib/images';
import { computeTrack, demoRms, estimateFloor, frameAt, MotionProcessor, type MotionFrame, type MotionTrack } from '../lib/motion';
import { COLORS, drawBackground, drawIllustration } from '../lib/render';
import type { AnimType, Picture } from '../lib/types';
import { useApp } from '../store';

/**
 * 움직임 한눈에 보기: 모든 그림이 같은 목소리에 동시에 반응하는 모습을 한 화면에서 봅니다.
 * - 예시 목소리: "사-과!" 같은 짧은 소리를 흉내 낸 신호를 반복 재생
 * - 내 목소리: 마이크 소리에 모든 그림이 함께 반응 (녹음·저장은 하지 않음)
 * 캔버스 하나에 격자로 그려서 그림이 많아도 가볍게 움직입니다.
 */

type Source = 'demo' | 'mic';
type Filter = AnimType | 'all';

interface Live {
  stream: MediaStream;
  analyser: AnalyserNode;
  buf: Float32Array;
  last: number;
  procs: Map<string, MotionProcessor>;
}

const DEMO_SECONDS = 4.4;
const LABEL: Record<string, string> = Object.fromEntries(ANIM_OPTIONS.map((o) => [o.v, o.label]));

export function Motions() {
  const { back, go, pictures } = useApp();
  const [source, setSource] = useState<Source>('demo');
  const [filter, setFilter] = useState<Filter>('all');
  const [preps, setPreps] = useState<Record<string, Prepared>>({});
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [starting, setStarting] = useState(false);
  const [cols, setCols] = useState(() => (window.innerWidth >= 640 ? 4 : 3));
  const live = useRef<Live | null>(null);
  const levelRef = useRef(0);

  const visible = useMemo(() => pictures.filter((p) => !p.hidden), [pictures]);
  const list = useMemo(() => (filter === 'all' ? visible : visible.filter((p) => p.anim.type === filter)), [visible, filter]);

  // 있는 움직임 방식만 필터로 보여주기
  const filterOptions = useMemo(() => {
    const has = new Set(visible.map((p) => p.anim.type));
    return [{ v: 'all' as Filter, label: `전체 ${visible.length}` }, ...ANIM_OPTIONS.filter((o) => has.has(o.v)).map((o) => ({ v: o.v as Filter, label: o.label }))];
  }, [visible]);

  useEffect(() => {
    let alive = true;
    Promise.all(visible.map(async (p) => [p.id, await prepare(p)] as const))
      .then((arr) => alive && setPreps(Object.fromEntries(arr)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible]);

  useEffect(() => {
    const onResize = () => setCols(window.innerWidth >= 640 ? 4 : 3);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 예시 목소리: 그림마다 자기 속도·민감도로 계산 (모두 같은 순간에 소리가 남)
  const demoRaw = useMemo(() => demoRms(DEMO_SECONDS), []);
  const demoTracks = useMemo(() => {
    const floor = estimateFloor(demoRaw);
    const m = new Map<string, MotionTrack>();
    for (const p of visible) m.set(p.id, computeTrack(demoRaw, { sensitivity: p.anim.sensitivity, speed: p.anim.speed }, floor));
    return m;
  }, [visible, demoRaw]);

  function stopMic() {
    const l = live.current;
    live.current = null;
    levelRef.current = 0;
    l?.stream.getTracks().forEach((t) => t.stop());
  }

  useEffect(() => stopMic, []);

  async function startMic() {
    setErr(null);
    const sup = micSupport();
    if (!sup.ok) {
      setErr(micErrorMessage({ reason: sup.reason, name: sup.reason === 'https' ? 'TypeError' : '' }));
      return;
    }
    const ctx = unlockAudio(); // 버튼을 누른 순간 소리 엔진 깨우기 (iPhone)
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints,
      });
      if (ctx.state !== 'running') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      stream.getAudioTracks().forEach((t) => (t.onended = () => switchTo('demo')));
      live.current = { stream, analyser, buf: new Float32Array(analyser.fftSize), last: performance.now() / 1000, procs: new Map() };
      setSource('mic');
    } catch (e) {
      setErr(micErrorMessage(e));
      setSource('demo');
    } finally {
      setStarting(false);
    }
  }

  function switchTo(s: Source) {
    if (s === 'mic') {
      if (!live.current) startMic();
      return;
    }
    stopMic();
    setSource('demo');
  }

  /** 마이크 소리 세기 한 번 읽기 */
  function readRms(l: Live) {
    const n = l.analyser.fftSize;
    if (typeof l.analyser.getFloatTimeDomainData === 'function') l.analyser.getFloatTimeDomainData(l.buf as any);
    else {
      const b = new Uint8Array(n);
      l.analyser.getByteTimeDomainData(b);
      for (let i = 0; i < n; i++) l.buf[i] = (b[i] - 128) / 128;
    }
    let s = 0;
    for (let i = 0; i < n; i++) s += l.buf[i] * l.buf[i];
    return Math.sqrt(s / n);
  }

  const rows = Math.max(1, Math.ceil(list.length / cols));
  const CELL_RATIO = 1.2; // 칸 높이 / 너비 (아래쪽에 이름 자리)

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
    const cw = W / cols;
    const ch = H / rows;
    // 화면에 보이는 줄만 그림 (스크롤 밖 칸까지 매 프레임 그리면 휴대폰에서 무거움)
    const r = ctx.canvas.getBoundingClientRect();
    const k = r.height > 0 ? H / r.height : 1;
    const vTop = Math.max(0, -r.top * k);
    const vBot = Math.min(H, (window.innerHeight - r.top) * k);
    const row0 = Math.max(0, Math.floor(vTop / ch));
    const row1 = Math.min(rows - 1, Math.floor(vBot / ch));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, row0 * ch, W, Math.max(0, (row1 - row0 + 1) * ch));
    ctx.clip();
    drawBackground(ctx, W, H);
    ctx.restore();

    // 이번 프레임의 목소리 → 그림별 움직임
    const l = source === 'mic' ? live.current : null;
    let rms = 0;
    let dt = 0;
    if (l) {
      rms = readRms(l);
      dt = Math.max(0, Math.min(0.1, now - l.last));
      l.last = now;
    }
    const loop = DEMO_SECONDS + 0.8;
    const tDemo = now % loop;
    let maxLvl = 0;

    list.forEach((p: Picture, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x0 = col * cw;
      const y0 = row * ch;

      let m: MotionFrame;
      if (l) {
        let proc = l.procs.get(p.id);
        if (!proc) {
          proc = new MotionProcessor({ sensitivity: p.anim.sensitivity, speed: p.anim.speed }, true);
          l.procs.set(p.id, proc);
        }
        m = proc.step(rms, dt);
        maxLvl = Math.max(maxLvl, m.lvl);
      } else {
        m = frameAt(demoTracks.get(p.id) ?? null, tDemo);
      }
      m = { ...m, t: now };
      // 마이크 분석은 모든 그림에 계속하되, 그리기는 보이는 칸만
      if (row < row0 || row > row1) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, cw, ch);
      ctx.clip();

      const prep = preps[p.id];
      const S = cw * 0.66;
      if (prep) drawIllustration(ctx, S, x0 + cw / 2, y0 + cw * 0.5, prep, p.transform, p.anim, m);

      // 이름 + 움직임 방식
      const fs = Math.round(cw * 0.12);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `${fs}px Jua, "Gowun Dodum", sans-serif`;
      ctx.fillText(p.name, x0 + cw / 2, y0 + ch - fs * 1.25, cw * 0.92);
      ctx.fillStyle = COLORS.soft;
      ctx.font = `${Math.round(fs * 0.72)}px Jua, "Gowun Dodum", sans-serif`;
      ctx.fillText(LABEL[p.anim.type] ?? '', x0 + cw / 2, y0 + ch - fs * 0.3, cw * 0.92);
      ctx.restore();
    });

    levelRef.current = l ? maxLvl : 0;
  };

  // 칸을 누르면 그 그림으로 바로 기록하기
  function onTap(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left) / r.width) * cols);
    const row = Math.floor(((e.clientY - r.top) / r.height) * rows);
    const p = list[row * cols + col];
    if (p) {
      stopMic();
      go({ name: 'record', pictureId: p.id });
    }
  }

  return (
    <div className="page">
      <TopBar title="움직임 한눈에 보기" onBack={back} />

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`cut px-3 py-3 font-display text-[16px] ${source === 'demo' ? 'bg-ink text-white' : 'bg-sheet text-ink shadow-paper'}`}
            aria-pressed={source === 'demo'}
            onClick={() => switchTo('demo')}
          >
            예시 목소리
          </button>
          <button
            className={`cut px-3 py-3 font-display text-[16px] ${source === 'mic' ? 'bg-tangerine text-white' : 'bg-sheet text-ink shadow-paper'}`}
            aria-pressed={source === 'mic'}
            disabled={starting}
            onClick={() => (source === 'mic' ? switchTo('demo') : switchTo('mic'))}
          >
            {starting ? '마이크 켜는 중…' : source === 'mic' ? '마이크 끄기' : '내 목소리로 해보기'}
          </button>
        </div>
        <p className="hint text-center">
          {source === 'mic' ? '아무 말이나 해 보세요. 모든 그림이 함께 움직여요. (녹음은 되지 않아요)' : '모든 그림이 같은 목소리에 반응하는 모습이에요. 그림을 누르면 바로 기록할 수 있어요.'}
        </p>

        {err && (
          <Notice tone="error" title={err.title}>
            {err.detail}
          </Notice>
        )}

        <Chips value={filter} onChange={setFilter} wrap={false} options={filterOptions} />
      </div>

      <div className="mt-3 cursor-pointer" onClick={onTap}>
        {list.length ? (
          <Stage draw={draw} aspect={cols / (rows * CELL_RATIO)} maxHeight="100000px" />
        ) : (
          <div className="card p-6 text-center">
            <p className="font-display text-[17px]">이 움직임의 그림이 없어요</p>
          </div>
        )}
      </div>
    </div>
  );
}
