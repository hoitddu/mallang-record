import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../components/Stage';
import { Notice, Toggle, TopBar } from '../components/ui';
import { decodeBlob, extractAudioFromVideo, pickAudioMime, unlockAudio } from '../lib/audio';
import { clearDraft, defaultCaption, formatDate, getDraft, monthsBetween, putClip, saveDraft, uid } from '../lib/db';
import { inAppBrowser, inIframe, micErrorMessage, micSupport, type FriendlyError } from '../lib/env';
import { prepare, snapshotOf, type Prepared } from '../lib/images';
import { captionTimes } from '../lib/captionTiming';
import { captionProgress, voiceTrim, analyzeBuffer, computeTrack, estimateFloor, frameAt, IDLE_FRAME, MotionProcessor, type MotionTrack } from '../lib/motion';
import { renderScene, type FaceDraw, type SceneInfo } from '../lib/render';
import { artSkinColors, extractPatches, FACE_LEVEL_DEFAULT, LandmarkSmoother, loadFaceLandmarker, type FacePatches } from '../lib/face';
import { FacePlayer, FaceRecorder, facePlayerOf } from '../lib/faceTrack';
import type { Clip, FaceRecord } from '../lib/types';
import { useApp } from '../store';

type Phase = 'idle' | 'starting' | 'recording' | 'processing' | 'review';

interface Take {
  blob: Blob;
  mime: string;
  source: Clip['source'];
  buffer: AudioBuffer;
  track: MotionTrack;
  url: string;
}

const MAX_SEC = 60;

export function Recorder({ pictureId, fromDraft }: { pictureId: string; fromDraft?: boolean }) {
  const { pictures, settings, setSettings, back, replace, toast } = useApp();
  const pic = pictures.find((p) => p.id === pictureId);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // 아이 눈·입 담기 (앞 카메라). 카메라 영상은 저장하지 않고 그림체로 바꾼 눈·입 조각만 남김
  const faceOn = settings.faceCam !== false;
  // 눈·입 자리를 아는 기본 그림에서만 (직접 올린 그림은 다음 단계)
  const faceUsable = faceOn && !!pic?.builtinKey && !pic?.image;
  const [takeFace, setTakeFace] = useState<{ rec: FaceRecord; player: FacePlayer } | null>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const cam = useRef<{
    stream: MediaStream;
    smoother: LandmarkSmoother;
    rec: FaceRecorder;
    patches: FacePatches | null;
    presence: number;
    target: number;
    lastTs: number;
    busy: boolean;
    found: boolean;
  } | null>(null);

  const live = useRef<{
    stream: MediaStream;
    rec: MediaRecorder;
    chunks: Blob[];
    analyser: AnalyserNode;
    buf: Float32Array;
    proc: MotionProcessor;
    last: number;
    start: number;
    mime: string;
    stopping: boolean;
  } | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pic) prepare(pic).then(setPrep).catch(() => {});
  }, [pic?.image, pic?.builtinKey]);

  // 눈·입 담기를 켜 두었으면 얼굴 인식 엔진을 미리 받아 둠 (카메라는 녹음 버튼을 누를 때 켬)
  useEffect(() => {
    if (faceUsable) loadFaceLandmarker().catch(() => {});
  }, [faceUsable]);
  useEffect(() => () => stopCam(), []);

  function stopCam() {
    cam.current?.stream.getTracks().forEach((t) => t.stop());
    cam.current = null;
    if (camRef.current) camRef.current.srcObject = null;
  }

  /** 앞 카메라 켜기 (실패하면 목소리만) */
  async function startCam(): Promise<boolean> {
    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
        loadFaceLandmarker(),
      ]);
      const v = camRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      cam.current = { stream, smoother: new LandmarkSmoother(), rec: new FaceRecorder(FACE_LEVEL_DEFAULT), patches: null, presence: 0, target: 0, lastTs: -1, busy: false, found: false };
      return true;
    } catch {
      setNote('카메라를 켜지 못해서 목소리만 녹음해요. 아이 눈·입을 담으려면 카메라 사용을 허용해 주세요.');
      return false;
    }
  }

  /** 카메라 한 장면: 얼굴 찾기 → 눈·입 오리기(그림체) → 화면에 쓰고, 녹음 중이면 모아 두기 */
  function camStep(now: number, recT: number | null) {
    const c = cam.current;
    const v = camRef.current;
    if (!c || !v || v.readyState < 2 || !v.videoWidth || c.busy) return;
    const ts = Math.max(c.lastTs + 1, now * 1000);
    c.lastTs = ts;
    c.busy = true;
    loadFaceLandmarker()
      .then((lm) => {
        if (cam.current !== c) return;
        const res = lm.detectForVideo(v, ts);
        const lms = res.faceLandmarks[0];
        let p: FacePatches | null = null;
        if (lms && prep) {
          const pts = c.smoother.apply(lms, v.videoWidth, v.videoHeight, ts / 1000);
          const sk = artSkinColors(prep);
          p = extractPatches(v, pts, { level: FACE_LEVEL_DEFAULT, mirror: true, skinEye: sk.eye, skinMouth: sk.mouth }, 'rec');
          c.found = true;
        }
        c.patches = p ?? c.patches;
        c.target = p ? 1 : 0;
        if (recT !== null) c.rec.add(recT, p);
      })
      .catch(() => {})
      .finally(() => {
        c.busy = false;
      });
  }

  // 저장하지 않은 녹음 이어서 보기
  useEffect(() => {
    if (!fromDraft) return;
    (async () => {
      const d = await getDraft();
      if (d) await loadTake(d.audio, d.mime, d.source, false);
    })();
  }, [fromDraft]);

  // 화면을 떠나거나 앱을 전환하면 녹음 정리
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && live.current && !live.current.stopping) {
        setNote('화면이 꺼지거나 다른 앱으로 바뀌어서 녹음을 멈췄어요. 그때까지 녹음된 소리는 남아 있어요.');
        stopRec();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      const l = live.current;
      if (l) {
        try {
          l.rec.state !== 'inactive' && l.rec.stop();
        } catch {}
        l.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => () => {
    if (take?.url) URL.revokeObjectURL(take.url);
  }, [take]);

  const baseScene: SceneInfo | null = useMemo(() => {
    if (!pic) return null;
    const months = monthsBetween(settings.birthDate, Date.now());
    return {
      prepared: prep,
      transform: pic.transform,
      anim: pic.anim,
      title: settings.childName ? `${settings.childName}의 말` : '',
      date: formatDate(Date.now()),
      caption: defaultCaption(pic.name),
      months: months !== undefined ? `${months}개월` : undefined,
    };
  }, [pic, prep, settings]);

  // 녹음한 소리의 박자에 맞춘 자막 글자별 시각
  const takeCapTimes = useMemo(() => {
    if (!take || !baseScene) return null;
    const tr = take.track;
    return captionTimes(baseScene.caption?.text ?? '', tr.syllables, tr.firstVoice, tr.lastVoice);
  }, [take, baseScene]);

  async function startRec() {
    setErr(null);
    setNote(null);
    const sup = micSupport();
    if (!sup.ok) {
      setErr(micErrorMessage({ reason: sup.reason, name: sup.reason === 'https' ? 'TypeError' : '' }));
      return;
    }
    const ctx = unlockAudio(); // 버튼을 누른 순간 소리 엔진 깨우기
    setPhase('starting');
    setTakeFace(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints,
      });
    } catch (e) {
      setErr(micErrorMessage(e));
      setPhase('idle');
      return;
    }
    try {
      if (ctx.state !== 'running') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const mime = pickAudioMime();
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch {
        rec = new MediaRecorder(stream);
      }
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      rec.onstop = () => finishRec();
      stream.getAudioTracks().forEach((t) => (t.onended = () => stopRec()));
      const now = performance.now() / 1000;
      live.current = {
        stream,
        rec,
        chunks,
        analyser,
        buf: new Float32Array(analyser.fftSize),
        proc: new MotionProcessor({ sensitivity: pic!.anim.sensitivity, speed: pic!.anim.speed }, true),
        last: now,
        start: now,
        mime: rec.mimeType || mime,
        stopping: false,
      };
      // 눈·입 담기: 카메라를 켠 뒤 녹음 시작 (시각을 맞추려고 시작 시각을 다시 잡음)
      if (faceUsable) await startCam();
      live.current.start = live.current.last = performance.now() / 1000;
      rec.start(500); // 0.5초마다 조각 저장 → 중간에 멈춰도 유실 최소화
      setElapsed(0);
      setPhase('recording');
    } catch (e: any) {
      stream.getTracks().forEach((t) => t.stop());
      setErr({ title: '녹음을 시작하지 못했어요', detail: e?.message || String(e) });
      setPhase('idle');
    }
  }

  function stopRec() {
    const l = live.current;
    if (!l || l.stopping) return;
    l.stopping = true;
    setPhase('processing');
    try {
      if (l.rec.state !== 'inactive') l.rec.stop();
      else finishRec();
    } catch {
      finishRec();
    }
  }

  async function finishRec() {
    const l = live.current;
    if (!l) return;
    live.current = null;
    l.stream.getTracks().forEach((t) => t.stop());
    // 카메라 끄기 → 모아 둔 눈·입 조각 정리 (원본 카메라 영상은 처음부터 저장하지 않음)
    const c = cam.current;
    stopCam();
    const faceRec = c ? await c.rec.finish().catch(() => null) : null;
    if (c && !faceRec) setNote('녹음하는 동안 얼굴을 찾지 못해서 그린 눈·입으로 보여줘요. 밝은 곳에서 얼굴을 화면 가운데에 비춰 주세요.');
    const blob = new Blob(l.chunks, { type: (l.mime || 'audio/mp4').split(';')[0] });
    if (!blob.size) {
      setErr({ title: '녹음된 소리가 없어요', detail: '녹음 버튼을 누르고 1초 이상 말한 뒤 멈춰 주세요.' });
      setPhase('idle');
      return;
    }
    // 원본 녹음을 먼저 기기에 보관 (앱이 꺼져도 유실 방지)
    await saveDraft({ id: 'last', pictureId, audio: blob, mime: blob.type, source: 'mic', createdAt: Date.now() }).catch(() => {});
    await loadTake(blob, blob.type, 'mic', false);
    if (faceRec) {
      const player = await facePlayerOf(faceRec).catch(() => null);
      if (player) setTakeFace({ rec: faceRec, player });
    }
  }

  async function loadTake(blob: Blob, mime: string, source: Clip['source'], isVideo: boolean, file?: Blob) {
    setPhase('processing');
    try {
      let buffer: AudioBuffer;
      let keep = blob;
      if (isVideo && file) {
        setProgress('영상에서 목소리를 꺼내는 중…');
        const r = await extractAudioFromVideo(file, (p) => setProgress(`영상에서 목소리를 꺼내는 중… ${Math.round(p * 100)}%`));
        buffer = r.buffer;
        keep = r.blob;
      } else {
        buffer = await decodeBlob(blob);
      }
      if (buffer.duration > 300) throw new Error('5분 이하의 파일만 쓸 수 있어요. 짧게 잘라서 올려 주세요.');
      const rms = analyzeBuffer(buffer);
      const track = computeTrack(rms, { sensitivity: pic!.anim.sensitivity, speed: pic!.anim.speed }, estimateFloor(rms));
      if (track.firstVoice < 0) setNote('목소리가 거의 들리지 않아요. 조금 더 가까이에서 말하거나, 편집 화면에서 "목소리 반응 민감도"를 높여 보세요.');
      setTake({ blob: keep, mime: keep.type || mime, source, buffer, track, url: URL.createObjectURL(keep) });
      setPhase('review');
      if (source !== 'mic') {
        await saveDraft({ id: 'last', pictureId, audio: keep, mime: keep.type || mime, source, createdAt: Date.now() }).catch(() => {});
      }
    } catch (e: any) {
      setErr({
        title: '소리를 읽지 못했어요',
        detail: e?.message?.includes('5분') ? e.message : '이 파일 형식은 이 브라우저에서 열 수 없어요. iPhone에서 찍은 영상(MOV/MP4)이나 m4a, mp3, wav 파일을 써 주세요.',
      });
      setPhase('idle');
    } finally {
      setProgress(null);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setTakeFace(null);
    setErr(null);
    setNote(null);
    unlockAudio();
    const isVideo = /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name);
    await loadTake(f, f.type, isVideo ? 'video' : 'audio', isVideo, f);
    if (fileRef.current) fileRef.current.value = '';
  }

  function play() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      return;
    }
    a.currentTime = 0;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  async function saveClip() {
    if (!take || !pic || !baseScene) return;
    const now = Date.now();
    // 앞뒤 조용한 부분은 빼고 아이 목소리 부분만 쓰기 (원본 녹음은 그대로라 편집 화면 '길이'에서 되돌릴 수 있음)
    const cut = voiceTrim(take.track, take.buffer.duration);
    const clip: Clip = {
      id: uid(),
      pictureId: pic.id,
      pictureSnapshot: snapshotOf(pic),
      word: pic.name,
      createdAt: now,
      audio: take.blob,
      mime: take.mime,
      duration: take.buffer.duration,
      source: take.source,
      anim: { ...pic.anim },
      caption: defaultCaption(pic.name),
      title: settings.childName ? `${settings.childName}의 말` : '',
      showTitle: !!settings.childName,
      showDate: true,
      showMonths: monthsBetween(settings.birthDate, now) !== undefined,
      months: monthsBetween(settings.birthDate, now),
      trimStart: cut ? cut.start : 0,
      trimEnd: cut ? cut.end : take.buffer.duration,
      ...(takeFace ? { face: takeFace.rec } : {}),
    };
    await putClip(clip);
    await clearDraft();
    toast('기록을 저장했어요');
    replace({ name: 'clip', clipId: clip.id });
  }

  async function retake() {
    audioRef.current?.pause();
    setTake(null);
    setTakeFace(null);
    setNote(null);
    await clearDraft();
    setPhase('idle');
  }

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
    if (!baseScene) return;
    const l = live.current;
    let frame = { ...IDLE_FRAME, t: now };
    let reveal = 0;
    let capT: number | undefined;
    let face: FaceDraw | null = null;
    if (phase === 'recording' && l) {
      // 카메라: 아이 눈·입을 실시간으로 붙이고 모아 둠
      const c = cam.current;
      if (c) {
        camStep(now, now - l.start);
        c.presence += (c.target - c.presence) * 0.2;
        if (c.patches) face = { patches: c.patches, presence: c.presence };
      }
      const n = l.analyser.fftSize;
      if (typeof l.analyser.getFloatTimeDomainData === 'function') l.analyser.getFloatTimeDomainData(l.buf as any);
      else {
        const b = new Uint8Array(n);
        l.analyser.getByteTimeDomainData(b);
        for (let i = 0; i < n; i++) l.buf[i] = (b[i] - 128) / 128;
      }
      let s = 0;
      for (let i = 0; i < n; i++) s += l.buf[i] * l.buf[i];
      const rms = Math.sqrt(s / n);
      const dt = Math.max(0, Math.min(0.1, now - l.last));
      l.last = now;
      frame = l.proc.step(rms, dt);
      if (l.proc.firstVoice >= 0) reveal = captionProgress(l.proc.t, l.proc.firstVoice, -1, Array.from(baseScene.caption?.text ?? '').length);
      const el = now - l.start;
      if (Math.floor(el * 4) !== Math.floor(elapsed * 4)) setElapsed(el);
      if (el > MAX_SEC) stopRec();
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${Math.max(0.03, l.proc.raw)})`;
      if (stateRef.current) {
        const txt = l.proc.speaking ? '말하는 중' : '듣고 있어요';
        if (stateRef.current.textContent !== txt) stateRef.current.textContent = txt;
      }
    } else if (phase === 'review' && take) {
      const a = audioRef.current;
      if (a && playing) {
        const t = a.currentTime;
        frame = frameAt(take.track, t);
        reveal = captionProgress(t, take.track.firstVoice, take.track.lastVoice, Array.from(baseScene.caption?.text ?? '').length);
        capT = t;
        face = takeFace?.player.at(t) ?? null;
      } else {
        reveal = 1;
        face = takeFace ? takeFace.player.at(take.track.firstVoice >= 0 ? take.track.firstVoice : 0) : null;
      }
      frame.t = now;
    }
    // 미리 듣기: 글자가 말하는 박자에 맞춰 나타남 (저장 후 영상과 같은 계산)
    renderScene(ctx, W, H, { ...baseScene, face, captionReveal: reveal, ...(capT !== undefined ? { captionTimes: takeCapTimes, captionT: capT } : {}) }, frame);
  };

  if (!pic)
    return (
      <div className="page">
        <TopBar title="녹음" onBack={back} />
        <Notice tone="error" title="그림을 찾을 수 없어요" />
      </div>
    );

  const app = inAppBrowser();
  const recording = phase === 'recording';

  return (
    <div className="page">
      <TopBar title={`"${pic.name}" 기록하기`} onBack={back} />

      {phase === 'idle' && !err && (inIframe || app) && (
        <div className="mb-3">
          <Notice tone="warn" title={app ? `${app} 앱 안에서는 마이크가 막힐 수 있어요` : '이 미리보기 화면에서는 마이크가 막혀 있을 수 있어요'}>
            {app ? '메뉴에서 "Safari로 열기"를 눌러 주세요.' : '앱 주소를 Safari·Chrome에서 직접 열면 녹음할 수 있어요. 지금은 아래 "음성·영상 파일 불러오기"로 만들 수 있어요.'}
          </Notice>
        </div>
      )}

      <div className="relative">
        <Stage draw={draw} maxHeight="58dvh" />
        {/* 얼굴이 화면 안에 있는지 보는 작은 화면 (저장하지 않음) */}
        <video ref={camRef} playsInline muted className={`pointer-events-none absolute right-2 top-2 w-16 -scale-x-100 rounded-lg shadow-paper ${recording && cam.current ? 'opacity-90' : 'opacity-0'}`} />
      </div>

      {/* 소리 입력 상태 */}
      <div className="mx-auto mt-3 max-w-[340px]" aria-live="polite">
        {recording ? (
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 shrink-0 rounded-full bg-berry rec-pulse" />
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-line">
              <div ref={meterRef} className="absolute inset-0 origin-left rounded-full bg-leaf transition-transform duration-75" style={{ transform: 'scaleX(0.03)' }} />
            </div>
            <span className="whitespace-nowrap text-right font-display text-[14px] tabular-nums text-soft">
              <span ref={stateRef}>듣고 있어요</span> {Math.floor(elapsed)}초
            </span>
          </div>
        ) : phase === 'processing' ? (
          <p className="text-center font-display text-soft">{progress ?? '목소리를 살펴보는 중…'}</p>
        ) : phase === 'review' ? (
          <p className="text-center font-display text-soft">{take ? `${take.buffer.duration.toFixed(1)}초 · ${take.source === 'mic' ? '직접 녹음' : take.source === 'video' ? '영상에서 꺼낸 목소리' : '음성 파일'}` : ''}</p>
        ) : (
          <p className="text-center text-[15px] text-soft">버튼을 누르고 아이가 "{pic.name}!" 하고 말하면 그림이 움직여요</p>
        )}
      </div>

      {err && (
        <div className="mt-4">
          <Notice tone="error" title={err.title} action={<button className="btn-sheet !py-2.5 text-[15px]" onClick={() => fileRef.current?.click()}>음성·영상 파일 불러오기</button>}>
            {err.detail}
          </Notice>
        </div>
      )}
      {note && (
        <div className="mt-4">
          <Notice tone="warn" title="알려드려요">
            {note}
          </Notice>
        </div>
      )}

      {/* 조작 버튼 */}
      <div className="mt-5 flex flex-col items-center gap-3">
        {phase === 'review' && take ? (
          <>
            <audio ref={audioRef} src={take.url} preload="auto" onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />
            <button className="btn-sky w-full max-w-[340px]" onClick={play}>
              {playing ? '멈추기' : '▶ 들으면서 미리보기'}
            </button>
            <p className="hint max-w-[340px] text-center">저장하면 앞뒤 조용한 부분은 빼고 아이 목소리 부분만 남겨요. 편집 화면 '길이'에서 바꿀 수 있어요.</p>
            <div className="flex w-full max-w-[340px] gap-2">
              <button className="btn-sheet flex-1" onClick={retake}>
                다시 녹음
              </button>
              <button className="btn-main flex-1" onClick={saveClip}>
                기록 저장
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              className={`grid h-24 w-24 place-items-center rounded-full shadow-lift transition-transform active:scale-95 ${recording ? 'bg-ink' : 'bg-berry'}`}
              style={{ borderRadius: '52% 48% 50% 50% / 48% 52% 48% 52%' }}
              onClick={recording ? stopRec : startRec}
              disabled={phase === 'starting' || phase === 'processing'}
              aria-label={recording ? '녹음 멈추기' : '녹음 시작'}
            >
              {recording ? <span className="h-8 w-8 rounded-md bg-white" /> : <span className="h-9 w-9 rounded-full bg-white/95" />}
            </button>
            <span className="font-display text-[16px]">{recording ? '다 말했으면 눌러서 멈추기' : phase === 'starting' ? '마이크 켜는 중…' : '눌러서 녹음 시작'}</span>
            {!recording && (
              <button className="btn-ghost mt-1 text-ink underline decoration-line decoration-2 underline-offset-4" onClick={() => fileRef.current?.click()} disabled={phase !== 'idle'}>
                음성·영상 파일 불러오기
              </button>
            )}
          </>
        )}
        <input ref={fileRef} type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.mov,.mp4" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        {phase === 'idle' && pic.builtinKey && !pic.image && (
          <div className="card w-full max-w-[340px] p-3">
            <Toggle id="face-cam" label="아이 눈·입도 함께 담기 (앞 카메라)" checked={faceOn} onChange={(v) => setSettings({ ...settings, faceCam: v })} />
            <p className="hint mt-1">
              {faceOn
                ? '녹음 버튼을 누르면 앞 카메라가 켜지고, 아이 눈·입이 그림체로 바뀌어 캐릭터에 붙어요. 카메라 영상은 저장하지 않고, 기기 밖으로 보내지 않아요.'
                : '끄면 그린 눈·입으로 움직여요.'}
            </p>
          </div>
        )}
        {!recording && phase !== 'review' && <p className="hint max-w-[340px] text-center">영상 파일을 고르면 소리만 꺼내 써요. 파일 속 얼굴은 결과물에 나오지 않고 어디에도 저장되지 않아요.</p>}
      </div>
    </div>
  );
}
