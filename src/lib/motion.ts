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
}

export const IDLE_FRAME: MotionFrame = { lvl: 0, spring: 0, pulse: 0, speak: 0, phase: 0, travel: 0, t: 0 };

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
    if (!this.speaking && this.above >= 0.03) {
      this.speaking = true;
      if (this.firstVoice < 0) this.firstVoice = this.t;
    }
    if (this.speaking && this.below >= 0.22) this.speaking = false;
    this.speak += ((this.speaking ? 1 : 0) - this.speak) * k(0.12);

    // onset (소리가 툭 커지는 순간)
    this.refract -= dt;
    if (this.refract <= 0 && this.fast > 0.14 && this.fast - this.base > 0.16 && this.pulse < 0.4) {
      this.pulse = 1;
      this.refract = 0.16;
    }
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

export interface MotionTrack {
  lvl: Float32Array;
  spring: Float32Array;
  pulse: Float32Array;
  speak: Float32Array;
  phase: Float32Array;
  travel: Float32Array;
  firstVoice: number; // 초, 없으면 -1
  duration: number;
}

/** 녹음 전체를 미리 계산 → 재생·영상 저장 때 같은 결과 (동기화 보장) */
export function computeTrack(rms: Float32Array, p: MotionParams, floor: number): MotionTrack {
  const n = rms.length;
  const proc = new MotionProcessor(p, false, floor);
  const t: MotionTrack = {
    lvl: new Float32Array(n),
    spring: new Float32Array(n),
    pulse: new Float32Array(n),
    speak: new Float32Array(n),
    phase: new Float32Array(n),
    travel: new Float32Array(n),
    firstVoice: -1,
    duration: n / FPS,
  };
  for (let i = 0; i < n; i++) {
    const fr = i === 0 ? proc.frame() : proc.step(rms[i], 1 / FPS);
    t.lvl[i] = fr.lvl;
    t.spring[i] = fr.spring;
    t.pulse[i] = fr.pulse;
    t.speak[i] = fr.speak;
    t.phase[i] = fr.phase;
    t.travel[i] = fr.travel;
  }
  t.firstVoice = proc.firstVoice;
  return t;
}

/** 소리가 끝난 뒤에도 그림이 제자리로 돌아오도록, 범위 밖은 쉬는 상태로 */
export function frameAt(tr: MotionTrack | null, time: number): MotionFrame {
  if (!tr || time <= 0) {
    return { ...IDLE_FRAME, t: time, phase: tr ? 0 : 0, travel: 0 };
  }
  const n = tr.lvl.length;
  const fi = time * FPS;
  if (fi >= n - 1) {
    // 끝난 뒤: 마지막 값에서 0으로 부드럽게 수렴
    const over = time - (n - 1) / FPS;
    const decay = Math.exp(-over / 0.15);
    const L = n - 1;
    return {
      lvl: tr.lvl[L] * decay,
      spring: tr.spring[L] * decay,
      pulse: tr.pulse[L] * decay,
      speak: tr.speak[L] * decay,
      phase: tr.phase[L] + over * 2 * Math.PI * 0.4,
      travel: tr.travel[L],
      t: time,
    };
  }
  const i = Math.floor(fi);
  const a = fi - i;
  const g = (arr: Float32Array) => arr[i] + (arr[i + 1] - arr[i]) * a;
  return {
    lvl: g(tr.lvl),
    spring: g(tr.spring),
    pulse: g(tr.pulse),
    speak: g(tr.speak),
    phase: g(tr.phase),
    travel: g(tr.travel),
    t: time,
  };
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
