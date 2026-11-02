import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../components/Stage';
import { Chips, Notice, TopBar } from '../components/ui';
import { BUILTINS } from '../lib/builtins';
import { defaultAnim } from '../lib/db';
import { artSkinColors, extractPatches, LandmarkSmoother, loadFaceLandmarker, type FacePatches } from '../lib/face';
import { prepare, type Prepared } from '../lib/images';
import { IDLE_FRAME } from '../lib/motion';
import { COLORS, drawBackground, drawIllustration } from '../lib/render';
import { useApp } from '../store';

/** 실사 정도 세 단계 (시안에서 비교) */
const LEVELS = [
  { v: '0', level: 0, label: '그림에 가깝게' },
  { v: '0.5', level: 0.5, label: '중간' },
  { v: '1', level: 1, label: '실제에 가깝게' },
] as const;
type LevelKey = (typeof LEVELS)[number]['v'];

type Source = 'none' | 'camera' | 'photo';

/**
 * 얼굴 실험실 (시안): 아이의 실제 눈·입을 그림체로 바꿔 캐릭터에 붙여 보는 화면.
 * 카메라 영상·사진은 이 기기 안에서만 처리하고 저장하지 않아요.
 */
export function FaceLab() {
  const { back } = useApp();
  const [key, setKey] = useState('apple');
  const [levelKey, setLevelKey] = useState<LevelKey>('0');
  const [source, setSource] = useState<Source>('none');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoRef = useRef<HTMLCanvasElement | null>(null);
  const photoPts = useRef<{ x: number; y: number }[] | null>(null);
  const prepRef = useRef<Prepared | null>(null);
  prepRef.current = prep;
  // 프레임마다 바뀌는 값 (화면 다시 그리기 없이)
  const st = useRef({ patches: {} as Record<string, FacePatches>, presence: 0, target: 0, lastTs: -1, found: false, busy: false });
  const smoother = useMemo(() => new LandmarkSmoother(), []);
  const def = BUILTINS.find((b) => b.key === key)!;

  useEffect(() => {
    let alive = true;
    prepare({ id: 'b-' + key, builtinKey: key }).then((p) => {
      prepKeys.set(p, key);
      if (alive) setPrep(p);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // 화면을 나가면 카메라 끄기
  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  /** 이 그림의 눈 둘레·입 자리 얼굴 색 (사람 피부색 대신) */
  // 지금 고른 그림 기준 (그림을 바꾼 직후에도 이전 그림 색이 남지 않게 ref로)
  const skins = () => {
    const pr = prepRef.current;
    if (!pr || prepKeys.get(pr) !== key) return {};
    const c = artSkinColors(pr);
    return { skinEye: c.eye, skinMouth: c.mouth };
  };

  async function ready() {
    setStatus('얼굴 인식 준비 중… (처음 한 번은 조금 걸려요)');
    const lm = await loadFaceLandmarker();
    return lm;
  }

  async function startCamera() {
    setErr(null);
    try {
      stopCamera();
      const lmP = ready();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      await lmP;
      smoother.reset();
      st.current.found = false;
      photoRef.current = null;
      setSource('camera');
      setStatus('얼굴을 찾는 중…');
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setErr(name === 'NotAllowedError' ? '카메라 사용을 허용해 주세요. 주소창 옆 자물쇠 → 카메라 → 허용' : '카메라를 켜지 못했어요. 다른 앱이 카메라를 쓰고 있는지 확인해 주세요.');
      setStatus('');
    }
  }

  async function usePhoto(f?: File) {
    if (!f) return;
    setErr(null);
    stopCamera();
    try {
      const lm = await ready();
      const img = await createImageBitmap(f);
      const s = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const ts = Math.max(st.current.lastTs + 1, performance.now());
      st.current.lastTs = ts;
      const res = lm.detectForVideo(c, ts);
      const lms = res.faceLandmarks[0];
      photoRef.current = c;
      setSource('photo');
      if (!lms) {
        st.current.found = false;
        st.current.target = 0;
        setStatus('사진에서 얼굴을 찾지 못했어요. 정면 얼굴이 크게 나온 사진으로 해 주세요.');
        return;
      }
      smoother.reset();
      const pts = lms.map((p) => ({ x: p.x * c.width, y: p.y * c.height }));
      photoPts.current = pts;
      photoPatches();
      st.current.found = true;
      st.current.target = 1;
      setStatus('사진의 눈·입을 붙였어요');
    } catch {
      setErr('사진을 열지 못했어요.');
    }
  }

  /** 사진 모드: 저장해 둔 얼굴 점으로 지금 그림에 맞춰 눈·입 다시 오리기 */
  function photoPatches() {
    const c = photoRef.current, pts = photoPts.current;
    if (!c || !pts) return;
    for (const L of LEVELS) st.current.patches[L.v] = cloneP(extractPatches(c, pts, { level: L.level, mirror: false, ...skins() }, 'p' + L.v));
  }
  // 그림을 바꾸면 사진의 눈·입도 새 그림 색으로
  useEffect(() => {
    if (source === 'photo' && prep) photoPatches();
  }, [prep, source]);

  // 카메라: 프레임마다 얼굴 찾기 → 눈·입 오리기 (세 단계 모두)
  function track(now: number) {
    const s = st.current;
    if (source === 'camera') {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth && !s.busy) {
        const ts = Math.max(s.lastTs + 1, now * 1000);
        s.lastTs = ts;
        loadFaceLandmarker().then((lm) => {
          s.busy = true;
          try {
            const res = lm.detectForVideo(v, ts);
            const lms = res.faceLandmarks[0];
            if (lms) {
              const pts = smoother.apply(lms, v.videoWidth, v.videoHeight, ts / 1000);
              for (const L of LEVELS) s.patches[L.v] = extractPatches(v, pts, { level: L.level, mirror: true, ...skins() }, 'c' + L.v);
              s.target = 1;
              if (!s.found) setStatus('찾았어요! 말해 보세요');
              s.found = true;
            } else {
              s.target = 0;
              if (s.found) setStatus('얼굴이 안 보여요 — 그린 눈·입으로 바뀌어요');
              s.found = false;
            }
          } finally {
            s.busy = false;
          }
        });
      }
    }
    s.presence += (s.target - s.presence) * 0.18;
  }

  const drawWith = (lk: LevelKey, main: boolean) => (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
    if (main) track(now);
    drawBackground(ctx, W, H);
    if (!prep) return;
    const s = st.current;
    const patches = s.patches[lk];
    const S = Math.min(W, H) * 0.78;
    drawIllustration(ctx, S, W / 2, H * 0.5, prep, { scale: 1, x: 0, y: 0 }, defaultAnim(def.anim), { ...IDLE_FRAME, t: now }, patches ? { patches, presence: s.presence } : null);
    if (!main) {
      ctx.fillStyle = COLORS.soft;
      ctx.font = `${Math.round(W * 0.09)}px Jua, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(LEVELS.find((l) => l.v === lk)!.label, W / 2, H * 0.95);
    }
  };

  return (
    <div className="page">
      <TopBar title="얼굴 실험실 (시안)" onBack={back} />
      <Notice tone="info" title="아이 눈·입을 그림에 붙여 보는 시안이에요">
        카메라 영상과 사진은 이 기기 안에서만 처리되고, 어디에도 저장하거나 보내지 않아요.
      </Notice>
      {err && <Notice tone="error" title={err} />}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className={`cut px-3 py-3 font-display text-[16px] ${source === 'camera' ? 'bg-ink text-white' : 'bg-sheet text-ink shadow-paper'}`} onClick={startCamera}>
          앞 카메라로 해보기
        </button>
        <button className={`cut px-3 py-3 font-display text-[16px] ${source === 'photo' ? 'bg-ink text-white' : 'bg-sheet text-ink shadow-paper'}`} onClick={() => fileRef.current?.click()}>
          사진으로 해보기
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => usePhoto(e.target.files?.[0])} />
      {status && <p className="hint mt-2 text-center">{status}</p>}

      <div className="relative mt-3">
        <Stage draw={drawWith(levelKey, true)} aspect={1} maxHeight="60dvh" />
        {/* 얼굴을 잘 비추는지 확인용 작은 화면 (저장 안 함) */}
        <video ref={videoRef} playsInline muted className={`absolute right-2 top-2 w-20 -scale-x-100 rounded-lg shadow-paper ${source === 'camera' ? '' : 'hidden'}`} />
      </div>

      <div className="mt-3">
        <Chips value={levelKey} onChange={setLevelKey} options={LEVELS.map((l) => ({ v: l.v, label: l.label }))} />
      </div>

      <h2 className="mt-5 font-display text-[17px]">세 단계 나란히</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {LEVELS.map((l) => (
          <button key={l.v} onClick={() => setLevelKey(l.v)} className={levelKey === l.v ? 'ring-2 ring-ink rounded-lg' : ''}>
            <Stage draw={drawWith(l.v, false)} aspect={0.85} maxHeight="30dvh" />
          </button>
        ))}
      </div>

      <h2 className="mt-5 font-display text-[17px]">그림 고르기</h2>
      <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
        <Chips value={key} onChange={setKey} wrap={false} options={BUILTINS.map((b) => ({ v: b.key, label: b.name }))} />
      </div>
      <p className="hint mt-3">밝은 곳에서 얼굴을 화면 가운데에 크게 비춰 주세요. 고개를 돌리면 잠깐 그린 눈·입으로 바뀌어요.</p>
    </div>
  );
}

/** 준비된 그림이 어느 그림 것인지 */
const prepKeys = new WeakMap<Prepared, string>();

/** 사진 모드: 조각을 따로 복사해 두기 (카메라 모드가 같은 캔버스를 다시 써도 남도록) */
function cloneP(p: FacePatches): FacePatches {
  const cp = (c: HTMLCanvasElement) => {
    const d = document.createElement('canvas');
    d.width = c.width;
    d.height = c.height;
    d.getContext('2d')!.drawImage(c, 0, 0);
    return d;
  };
  return { eyes: [cp(p.eyes[0]), cp(p.eyes[1])], mouth: cp(p.mouth) };
}
