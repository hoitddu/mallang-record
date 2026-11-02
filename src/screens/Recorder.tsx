import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../components/Stage';
import { Notice, TopBar } from '../components/ui';
import { decodeBlob, extractAudioFromVideo, pickAudioMime, unlockAudio } from '../lib/audio';
import { clearDraft, defaultCaption, formatDate, getDraft, monthsBetween, putClip, saveDraft, uid } from '../lib/db';
import { inAppBrowser, inIframe, micErrorMessage, micSupport, type FriendlyError } from '../lib/env';
import { prepare, snapshotOf, type Prepared } from '../lib/images';
import { analyzeBuffer, computeTrack, estimateFloor, frameAt, IDLE_FRAME, MotionProcessor, type MotionTrack } from '../lib/motion';
import { renderScene, type SceneInfo } from '../lib/render';
import type { Clip } from '../lib/types';
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
  const { pictures, settings, back, replace, toast } = useApp();
  const pic = pictures.find((p) => p.id === pictureId);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

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
    const blob = new Blob(l.chunks, { type: (l.mime || 'audio/mp4').split(';')[0] });
    if (!blob.size) {
      setErr({ title: '녹음된 소리가 없어요', detail: '녹음 버튼을 누르고 1초 이상 말한 뒤 멈춰 주세요.' });
      setPhase('idle');
      return;
    }
    // 원본 녹음을 먼저 기기에 보관 (앱이 꺼져도 유실 방지)
    await saveDraft({ id: 'last', pictureId, audio: blob, mime: blob.type, source: 'mic', createdAt: Date.now() }).catch(() => {});
    await loadTake(blob, blob.type, 'mic', false);
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
      trimStart: 0,
      trimEnd: take.buffer.duration,
    };
    await putClip(clip);
    await clearDraft();
    toast('기록을 저장했어요');
    replace({ name: 'clip', clipId: clip.id });
  }

  async function retake() {
    audioRef.current?.pause();
    setTake(null);
    setNote(null);
    await clearDraft();
    setPhase('idle');
  }

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
    if (!baseScene) return;
    const l = live.current;
    let frame = { ...IDLE_FRAME, t: now };
    let reveal = 0;
    if (phase === 'recording' && l) {
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
      if (l.proc.firstVoice >= 0) reveal = Math.min(1, (l.proc.t - l.proc.firstVoice) / 0.45);
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
        reveal = take.track.firstVoice >= 0 ? Math.min(1, Math.max(0, (t - take.track.firstVoice) / 0.45)) : 1;
      } else reveal = 1;
      frame.t = now;
    }
    renderScene(ctx, W, H, { ...baseScene, captionReveal: reveal }, frame);
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

      <Stage draw={draw} maxHeight="58dvh" />

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
        {!recording && phase !== 'review' && <p className="hint max-w-[340px] text-center">영상을 고르면 소리만 꺼내 써요. 아이 얼굴은 결과물에 나오지 않고 어디에도 저장되지 않아요.</p>}
      </div>
    </div>
  );
}
