/** 오디오 도우미: 녹음 형식 확인, 디코딩, WAV 변환, 영상에서 소리 꺼내기 */

let ctx: AudioContext | null = null;
export function audioCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    ctx = new AC() as AudioContext;
  }
  return ctx;
}
/** 버튼을 누른 순간 호출 (iPhone은 사용자 동작 안에서만 소리 엔진을 깨울 수 있음) */
export function unlockAudio() {
  const c = audioCtx();
  if (c.state === 'suspended') c.resume().catch(() => {});
  return c;
}

const AUDIO_TYPES = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'];

export function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of AUDIO_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {}
  }
  return '';
}

export function extFor(mime: string) {
  if (/mp4|aac|m4a/.test(mime)) return 'm4a';
  if (/webm/.test(mime)) return 'webm';
  if (/ogg/.test(mime)) return 'ogg';
  if (/wav/.test(mime)) return 'wav';
  return 'audio';
}

export function decode(ab: ArrayBuffer): Promise<AudioBuffer> {
  const c = audioCtx();
  return new Promise((resolve, reject) => {
    // 구형 Safari는 콜백 방식만 지원
    const p = c.decodeAudioData(ab, resolve, (e) => reject(e || new Error('decode failed')));
    if (p && typeof (p as any).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
  });
}

export async function decodeBlob(b: Blob): Promise<AudioBuffer> {
  return decode(await b.arrayBuffer());
}

/** 모노 16bit WAV (원래 소리 그대로, 압축 없음) */
export function encodeWav(buf: AudioBuffer, start = 0, end = buf.duration): Blob {
  const sr = buf.sampleRate;
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.min(buf.length, Math.ceil(end * sr));
  const n = Math.max(0, s1 - s0);
  const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o: number, s: string) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, sr, true);
  out.setUint32(28, sr * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const c of chs) v += c[s0 + i];
    v = Math.max(-1, Math.min(1, v / chs.length));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

/**
 * 영상에서 소리만 꺼내기.
 * 1) 브라우저가 영상 파일을 바로 해독할 수 있으면 그대로 사용 (빠름)
 * 2) 안 되면 영상을 소리 없이 재생하면서 소리만 녹음 (영상 길이만큼 걸림)
 * 화면(아이 얼굴)은 어디에도 저장하지 않습니다.
 */
export async function extractAudioFromVideo(
  file: Blob,
  onProgress?: (p: number) => void
): Promise<{ buffer: AudioBuffer; blob: Blob }> {
  try {
    const buffer = await decodeBlob(file);
    if (buffer.duration > 0.2) return { buffer, blob: encodeWav(buffer) };
  } catch {
    /* 아래 방법으로 */
  }
  const c = unlockAudio();
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url;
  v.playsInline = true;
  (v as any).webkitPlaysInline = true;
  v.preload = 'auto';
  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error('영상 파일을 열 수 없어요'));
    });
    const src = c.createMediaElementSource(v);
    const dest = c.createMediaStreamDestination();
    src.connect(dest);
    const mime = pickAudioMime();
    const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((res) => (rec.onstop = () => res()));
    rec.start(500);
    v.ontimeupdate = () => onProgress?.(v.currentTime / (v.duration || 1));
    await v.play();
    await new Promise<void>((res) => (v.onended = () => res()));
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: rec.mimeType || mime });
    const buffer = await decodeBlob(blob);
    return { buffer, blob };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 여러 클립의 소리를 하나로 이어 붙이기 */
export function concatBuffers(parts: { buf: AudioBuffer; start: number; end: number; at: number }[], total: number): AudioBuffer {
  const c = audioCtx();
  const sr = c.sampleRate;
  const out = c.createBuffer(1, Math.max(1, Math.ceil(total * sr)), sr);
  const o = out.getChannelData(0);
  for (const p of parts) {
    const ratio = p.buf.sampleRate / sr;
    const chs = Array.from({ length: p.buf.numberOfChannels }, (_, i) => p.buf.getChannelData(i));
    const n = Math.floor((p.end - p.start) * sr);
    const off = Math.floor(p.at * sr);
    for (let i = 0; i < n && off + i < o.length; i++) {
      const si = Math.floor((p.start * sr + i) * ratio);
      let v = 0;
      for (const ch of chs) v += ch[si] ?? 0;
      o[off + i] = v / chs.length;
    }
  }
  return out;
}
