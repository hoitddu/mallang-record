/**
 * 목소리 → 움직임 신호
 *
 * 이 모듈은 "소리의 크기와 리듬"만 분석합니다. 음절이나 발음 내용은 알아내지 않습니다.
 *  - RMS(소리 세기) → dB 변환
 *  - 잡음 바닥(noise floor) + 민감도에 따른 노이즈 게이트 (조용하면 0)
 *  - 빠른 상승 / 느린 하강 스무딩 (갑작스러운 움직임 방지)
 *  - 말하기 시작/멈춤 감지 (히스테리시스)
 *  - 소리가 툭 커지는 순간(onset) 감지 → 콩콩·말랑 반동
 *  - 감쇠 스프링 → 말랑한 탄성
 */

import { syllableOnsets } from './captionTiming';

export interface MotionFrame {
  /** 스무딩된 소리 크기 0~1 */
  lvl: number;
  /** 스프링으로 따라가는 값 (탄성, 살짝 넘침) */
  spring: number;
  /** 소리가 툭 커진 순간 1 → 서서히 0 */
  pulse: number;
  /** 말하는 중 0~1 (부드럽게) */
  speak: number;
  /** 리듬 위상 (말할 때 더 빨리 증가) */
  phase: number;
  /** 굴러간 거리 (바퀴 회전용) */
  travel: number;
  /** 초 */
  t: number;
  /** 천천히 따라가는 세기 (빨리 오르고 0.5초에 걸쳐 내려옴) */
  glide: number;
  /** 아주 천천히 따라가는 세기 (오르는 데 0.35초, 내려오는 데 1.5초) — 풍선·유모차·달 */
  drift: number;
  /** 말을 시작한 뒤 지난 초 (마지막 시작 기준, 없으면 99) */
  startT: number;
  /** 말을 멈춘 뒤 지난 초 (말하는 중이면 0, 없으면 99) */
  quietT: number;
  /**
   * "동작 시작" 신호: 소리가 툭 커진 순간 중, 직전 동작과 최소 간격(짧게 0.35초·보통 0.6초·길게 0.95초)이
   * 지난 것만 동작 시작으로 셈. aX: 마지막 시작 뒤 지난 초, bX: 그 전 시작 뒤 지난 초(겹쳐 이어지게),
   * nX: 지금까지 시작 횟수(좌우 번갈아 쓰기), eX: 마지막 시작의 세기 0~1
   */
  aS: number; bS: number; nS: number; eS: number;
  aM: number; bM: number; nM: number; eM: number;
  aL: number; bL: number; nL: number; eL: number;
}

export const IDLE_FRAME: MotionFrame = {
  lvl: 0, spring: 0, pulse: 0, speak: 0, phase: 0, travel: 0, t: 0,
  glide: 0, drift: 0, startT: 99, quietT: 99,
  aS: 99, bS: 99, nS: 0, eS: 0,
  aM: 99, bM: 99, nM: 0, eM: 0,
  aL: 99, bL: 99, nL: 0, eL: 0,
};

/** 동작 시작 사이 최소 간격 (초): 짧게·보통·길게 */
export const ACT_GAPS = { S: 0.35, M: 0.6, L: 0.95 } as const;
const SINCE_MAX = 99;

/** 녹음이 끝난 뒤(over초 지남)의 움직임: 세기는 줄고, 지난 시간은 계속 흐름 */
export function advanceFrame(f: MotionFrame, over: number, t: number): MotionFrame {
  const d = Math.exp(-over / 0.15);
  const adv = (v: number) => Math.min(SINCE_MAX, v + over);
  return {
    ...f,
    lvl: f.lvl * d,
    spring: f.spring * d,
    pulse: f.pulse * d,
    speak: f.speak * d,
    glide: f.glide * Math.exp(-over / 0.5),
    drift: f.drift * Math.exp(-over / 1.5),
    startT: adv(f.startT),
    quietT: f.quietT > 0 ? adv(f.quietT) : Math.min(SINCE_MAX, over),
    aS: adv(f.aS), bS: adv(f.bS), aM: adv(f.aM), bM: adv(f.bM), aL: adv(f.aL), bL: adv(f.bL),
    t,
  };
}

export interface MotionParams {
  sensitivity: number; // 0~1
  speed: number; // 0.5~2
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class MotionProcessor {
  floor: number;
  lvl = 0;
  base = 0;
  fast = 0;
  spring = 0;
  vel = 0;
  pulse = 0;
  speak = 0;
  speaking = false;
  above = 0;
  below = 0;
  refract = 0;
  phase = 0;
  travel = 0;
  t = 0;
  firstVoice = -1;
  /** 원시 게이트 통과값 (소리 표시줄용) */
  raw = 0;
  glide = 0;
  drift = 0;
  startT = SINCE_MAX;
  quietT = SINCE_MAX;
  act = {
    S: { a: SINCE_MAX, b: SINCE_MAX, n: 0, e: 0 },
    M: { a: SINCE_MAX, b: SINCE_MAX, n: 0, e: 0 },
    L: { a: SINCE_MAX, b: SINCE_MAX, n: 0, e: 0 },
  };

  constructor(public p: MotionParams, private adaptive: boolean, floorDb = -58) {
    this.floor = floorDb;
  }

  step(rms: number, dtIn: number): MotionFrame {
    // 큰 dt는 잘게 나눠서 안정적으로 계산
    let remain = Math.min(dtIn, 0.25);
    while (remain > 1e-6) {
      const dt = Math.min(remain, 1 / 120);
      this.sub(rms, dt);
      remain -= dt;
    }
    return this.frame();
  }

  frame(): MotionFrame {
    return {
      lvl: this.lvl,
      spring: this.spring,
      pulse: this.pulse,
      speak: this.speak,
      phase: this.phase,
      travel: this.travel,
      t: this.t,
      glide: this.glide,
      drift: this.drift,
      startT: this.startT,
      quietT: this.quietT,
      aS: this.act.S.a, bS: this.act.S.b, nS: this.act.S.n, eS: this.act.S.e,
      aM: this.act.M.a, bM: this.act.M.b, nM: this.act.M.n, eM: this.act.M.e,
      aL: this.act.L.a, bL: this.act.L.b, nL: this.act.L.n, eL: this.act.L.e,
    };
  }

  private sub(rms: number, dt: number) {
    const { sensitivity, speed } = this.p;
    const db = 20 * Math.log10(Math.max(rms, 1e-6));

    if (this.adaptive) {
      // 실시간 마이크: 주변 소음 수준을 천천히 학습
      if (db < this.floor) this.floor += (db - this.floor) * Math.min(1, dt * 3);
      else if (!this.speaking) this.floor += (db - this.floor) * Math.min(1, dt * 0.15);
      this.floor = clamp(this.floor, -80, -30);
    }

    const margin = lerp(17, 5, sensitivity); // 잡음 바닥 위로 몇 dB부터 반응할지
    const range = lerp(32, 20, sensitivity);
    let x = clamp((db - this.floor - margin) / range, 0, 1);
    x = Math.pow(x, 0.85);
    this.raw = x;

    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    this.fast += (x - this.fast) * k(0.02);
    this.base += (x - this.base) * k(0.22);
    const tau = x > this.lvl ? 0.045 : 0.17 / speed;
    this.lvl += (x - this.lvl) * k(tau);

    // 말하기 시작/멈춤 (히스테리시스)
    if (x > 0.06) {
      this.above += dt;
      this.below = 0;
    } else {
      this.below += dt;
      this.above = 0;
    }
    // 지난 시간들은 계속 흐름 (상한 99초)
    const tick = (v: number) => Math.min(SINCE_MAX, v + dt);
    this.startT = tick(this.startT);
    if (this.quietT > 0) this.quietT = tick(this.quietT);
    for (const g of [this.act.S, this.act.M, this.act.L]) {
      g.a = tick(g.a);
      g.b = tick(g.b);
    }
    if (!this.speaking && this.above >= 0.03) {
      this.speaking = true;
      this.startT = 0;
      this.quietT = 0;
      if (this.firstVoice < 0) this.firstVoice = this.t;
    }
    if (this.speaking && this.below >= 0.22) {
      this.speaking = false;
      this.quietT = 1e-6; // 지금 막 멈춤 → 다음 단계부터 흐름
    }
    this.speak += ((this.speaking ? 1 : 0) - this.speak) * k(0.12);

    // onset (소리가 툭 커지는 순간)
    this.refract -= dt;
    if (this.refract <= 0 && this.fast > 0.14 && this.fast - this.base > 0.16 && this.pulse < 0.4) {
      this.pulse = 1;
      this.refract = 0.16;
      // 동작 시작: 간격이 충분히 지난 것만 (긴 소리에 동작이 끝없이 반복되지 않게)
      const e = clamp((this.fast - this.base) * 1.8 + this.fast * 0.6, 0.35, 1);
      for (const [key, gap] of [['S', ACT_GAPS.S], ['M', ACT_GAPS.M], ['L', ACT_GAPS.L]] as const) {
        const g = this.act[key];
        // 간격은 속도 설정과 무관하게 고정: 속도는 동작을 빠르게 할 뿐, 동작 횟수는 아이 목소리의 리듬을 따름
        if (g.a >= gap) {
          g.b = g.a;
          g.a = 0;
          g.n += 1;
          g.e = e;
        }
      }
    }
    // 천천히 따라가는 세기들
    this.glide += (x - this.glide) * k(x > this.glide ? 0.1 : 0.5 / speed);
    this.drift += (x - this.drift) * k(x > this.drift ? 0.35 : 1.5 / speed);
    this.pulse *= Math.exp(-dt / (0.13 / speed));

    // 감쇠 스프링 (탄성)
    const omega = 2 * Math.PI * 2.3 * speed;
    const zeta = 0.38;
    const acc = omega * omega * (this.lvl - this.spring) - 2 * zeta * omega * this.vel;
    this.vel += acc * dt;
    this.spring += this.vel * dt;

    this.phase += dt * 2 * Math.PI * 1.7 * speed * (0.25 + 0.75 * this.speak);
    this.travel += dt * this.lvl * 5 * speed;
    this.t += dt;
  }
}

/** 오디오 버퍼 → 초당 60개의 RMS 값 */
export const FPS = 60;
export function analyzeBuffer(buf: AudioBuffer): Float32Array {
  const sr = buf.sampleRate;
  const len = buf.length;
  const ch = buf.numberOfChannels;
  const data: Float32Array[] = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  const frames = Math.ceil((len / sr) * FPS) + 1;
  const out = new Float32Array(frames);
  const win = Math.max(64, Math.round(sr * 0.03));
  for (let f = 0; f < frames; f++) {
    const center = Math.round((f / FPS) * sr);
    const s0 = Math.max(0, center - (win >> 1));
    const s1 = Math.min(len, s0 + win);
    let sum = 0;
    for (let i = s0; i < s1; i++) {
      let v = 0;
      for (let c = 0; c < ch; c++) v += data[c][i];
      v /= ch;
      sum += v * v;
    }
    out[f] = s1 > s0 ? Math.sqrt(sum / (s1 - s0)) : 0;
  }
  return out;
}

/** 파일 전체를 보고 잡음 바닥을 추정 */
export function estimateFloor(rms: Float32Array): number {
  const dbs = Array.from(rms, (v) => 20 * Math.log10(Math.max(v, 1e-6))).sort((a, b) => a - b);
  if (!dbs.length) return -58;
  const p10 = dbs[Math.floor(dbs.length * 0.1)];
  const max = dbs[dbs.length - 1];
  return clamp(Math.min(p10, max - 26), -78, -36);
}

/** 프레임마다 저장해 두는 값 이름 (MotionFrame에서 t를 뺀 것) */
const CHANNELS = [
  'lvl', 'spring', 'pulse', 'speak', 'phase', 'travel', 'glide', 'drift', 'startT', 'quietT',
  'aS', 'bS', 'nS', 'eS', 'aM', 'bM', 'nM', 'eM', 'aL', 'bL', 'nL', 'eL',
] as const;
type Channel = (typeof CHANNELS)[number];
/** 사이를 섞지 않고 가까운 값을 쓰는 것 (횟수·세기는 섞으면 안 됨) */
const STEPPED = new Set<Channel>(['nS', 'nM', 'nL', 'eS', 'eM', 'eL']);
/** 지난 시간: 섞되 동작이 새로 시작된 순간(값이 줄어드는 곳)은 섞지 않음 */
const SINCE = new Set<Channel>(['startT', 'quietT', 'aS', 'bS', 'aM', 'bM', 'aL', 'bL']);

export type MotionTrack = Record<Channel, Float32Array> & {
  firstVoice: number; // 초, 없으면 -1
  /** 마지막으로 목소리가 들린 때(초), 없으면 -1 */
  lastVoice: number;
  /** 소리 덩어리(대략 음절)가 시작되는 시각들(초) — 자막 글자를 말하는 박자에 맞추는 데 씀 */
  syllables: number[];
  duration: number;
};

/**
 * 녹음 앞뒤의 조용한 부분을 빼고 아이 목소리 부분만 (원본은 그대로, 쓸 범위만).
 * 목소리 시작 조금 전 ~ 끝난 뒤 그림이 제자리로 돌아올 만큼. 목소리가 없으면 null
 */
export function voiceTrim(tr: MotionTrack, duration: number): { start: number; end: number } | null {
  if (tr.firstVoice < 0 || tr.lastVoice < tr.firstVoice) return null;
  const start = Math.max(0, tr.firstVoice - 0.3);
  const end = Math.min(duration, tr.lastVoice + 0.6);
  if (end - start < 0.5) return null;
  return { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 };
}

/**
 * 자막이 나타난 정도 0~1: 목소리가 시작되면 한 글자씩, 아이가 말하는 동안에 맞춰 나타남.
 * t·first·last는 같은 기준의 초. last를 모르면(녹음 중) 글자 수로 속도를 정함
 */
export function captionProgress(t: number, first: number, last: number, nChars: number): number {
  if (first < 0) return 1;
  const n = Math.max(1, nChars);
  const byLen = 0.16 * n + 0.3;
  const span = last > first ? clamp(last - first, 0.35, Math.max(0.7, 0.3 * n)) : byLen;
  return clamp((t - first) / span, 0, 1);
}

/** 녹음 전체를 미리 계산 → 재생·영상 저장 때 같은 결과 (동기화 보장) */
export function computeTrack(rms: Float32Array, p: MotionParams, floor: number): MotionTrack {
  const n = rms.length;
  const proc = new MotionProcessor(p, false, floor);
  const t = { firstVoice: -1, lastVoice: -1, syllables: [], duration: n / FPS } as unknown as MotionTrack;
  for (const c of CHANNELS) (t as any)[c] = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const fr = i === 0 ? proc.frame() : proc.step(rms[i], 1 / FPS);
    for (const c of CHANNELS) t[c][i] = fr[c];
    if (proc.speaking) t.lastVoice = i / FPS;
  }
  t.firstVoice = proc.firstVoice;
  t.syllables = syllableOnsets(rms, FPS, floor, t.firstVoice, t.lastVoice);
  return t;
}

/** 소리가 끝난 뒤에도 그림이 제자리로 돌아오도록, 범위 밖은 쉬는 상태로 */
export function frameAt(tr: MotionTrack | null, time: number): MotionFrame {
  if (!tr || time <= 0) {
    return { ...IDLE_FRAME, t: time };
  }
  const n = tr.lvl.length;
  const fi = time * FPS;
  const at = (i: number, a: number): MotionFrame => {
    const f = { t: time } as MotionFrame;
    for (const c of CHANNELS) {
      const arr = tr[c];
      const v0 = arr[i], v1 = arr[Math.min(i + 1, n - 1)];
      if (STEPPED.has(c)) f[c] = a < 0.5 ? v0 : v1;
      else if (SINCE.has(c) && v1 < v0) f[c] = v0 + a / FPS; // 새 동작 직전: 섞지 않고 시간만 흐름
      else f[c] = v0 + (v1 - v0) * a;
    }
    return f;
  };
  if (fi >= n - 1) {
    // 끝난 뒤: 세기는 0으로 부드럽게, 지난 시간은 계속 흐름
    const over = time - (n - 1) / FPS;
    const f = advanceFrame(at(n - 1, 0), over, time);
    f.phase = tr.phase[n - 1] + over * 2 * Math.PI * 0.4;
    return f;
  }
  const i = Math.floor(fi);
  return at(i, fi - i);
}

/** "예시 소리 패턴" — 그림 편집에서 움직임을 미리 보는 용도 (실제 목소리 아님) */
export function demoRms(seconds = 4): Float32Array {
  const n = Math.round(seconds * FPS);
  const out = new Float32Array(n);
  // "사-과!", "비-행-기!" 같은 짧은 음절 덩어리 흉내
  const bursts = [
    [0.4, 0.22, 0.12], [0.66, 0.3, 0.2],
    [1.6, 0.18, 0.1], [1.82, 0.18, 0.08], [2.04, 0.34, 0.22],
    [3.0, 0.4, 0.16],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    let v = 0.0015 + Math.random() * 0.0008;
    for (const [s, d, amp] of bursts) {
      if (t >= s && t <= s + d) {
        const u = (t - s) / d;
        v += amp * Math.sin(Math.PI * u) ** 0.6 * (0.85 + Math.random() * 0.15);
      }
    }
    out[i] = v;
  }
  return out;
}
