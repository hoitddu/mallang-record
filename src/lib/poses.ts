import type { MotionFrame } from './motion';
import type { AnimSettings, AnimType } from './types';

/**
 * 캐릭터별 몸 움직임 (자세 계산)
 *
 * 목표: 소리를 끄고 봐도 캐릭터마다 성격이 구분되는 움직임.
 * 캐릭터마다 "대표 동작"이 하나 있고, 아이 목소리의 크기·리듬이 그 동작의 힘과 박자를 정해요.
 *  - 동작 시작은 motion.ts의 aS/aM/aL(마지막 동작 시작 뒤 지난 초)로 정해져서
 *    "웅크림 → 점프 → 착지 → 반동"처럼 순서가 있는 동작을 그릴 수 있어요.
 *  - 그 전 동작(bS/bM/bL)도 함께 더해서, 새 동작이 시작돼도 그림이 순간 이동하지 않아요.
 *  - 같은 시각·같은 목소리면 언제나 같은 자세 (무작위 값 없음) → 미리보기와 영상이 같아요.
 * 원본 그림은 다시 그리지 않고 이동·회전·크기 변화만 써요.
 */

export interface Pose {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
  /** 회전·크기 변화의 중심 (그림 크기 대비, 가운데가 0,0 / 아래 가운데는 0,0.5) */
  pivot: { x: number; y: number };
  warp?: { axis: 'rows' | 'cols'; amp: number; freq: number; phase: number };
  /** 그림자 진하기 (0이면 없음) */
  shadow: number;
  /** 바닥에서 떠오른 정도 0~1 (그림자가 작고 옅어짐) */
  lift: number;
  /** 주변 효과에 쓰는 값 */
  fx: { thud?: number; splash?: number; heart?: number };
  /** 반짝임 세기 배율 (달·이불처럼 잔잔한 캐릭터는 낮게) */
  sparkle: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sstep = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
/** 동작 시작마다 좌우를 번갈아 */
const dirOf = (n: number) => (n % 2 ? 1 : -1);

/**
 * 감쇠 진동: s초 전에 받은 힘에 대한 반응. 0에서 시작해 한 번 크게, 반대쪽으로 작게 흔들리다 멈춤 (최댓값 1).
 * freq: 흔들림 빠르기(Hz), zeta: 멈추는 빠르기(0.2 출렁출렁 ~ 0.7 바로 멈춤)
 */
export function kick(s: number, freq: number, zeta: number): number {
  if (s <= 0 || s >= 30) return 0;
  const w = 2 * Math.PI * freq;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const tp = Math.atan2(wd, zeta * w) / wd;
  const peak = Math.exp(-zeta * w * tp) * Math.sin(wd * tp);
  return (Math.exp(-zeta * w * s) * Math.sin(wd * s)) / peak;
}

/**
 * 점프 한 번: 웅크림(crouch) → 공중(air) → 착지 눌림(land) → 작은 반동.
 * up: 높이 비율(0~1, 웅크릴 땐 살짝 음수), sq: 세로로 늘어남(+)·눌림(-)
 */
function hop(s: number, o: { crouch: number; air: number; land: number; dip: number; stretch: number; squash: number; rebound: number }) {
  if (s < 0 || s > o.crouch + o.air + o.land + 0.8) return { up: 0, sq: 0 };
  if (s < o.crouch) {
    const u = Math.sin(((s / o.crouch) * Math.PI) / 2);
    return { up: -o.dip * u, sq: -o.squash * 0.6 * u };
  }
  s -= o.crouch;
  if (s < o.air) {
    const u = s / o.air;
    const up = 4 * u * (1 - u) - o.dip * Math.pow(1 - u, 4);
    const target = u < 0.5 ? o.stretch * (1 - u * 1.4) : o.stretch * 0.3 * (1 - u);
    const sq = -o.squash * 0.6 * Math.pow(1 - clamp(u * 6, 0, 1), 2) + target * clamp(u * 6, 0, 1);
    return { up, sq };
  }
  s -= o.air;
  const sq = -o.squash * kick(s, 1 / (o.land * 2.2), 0.5);
  const up = o.rebound * Math.max(0, kick(s - o.land * 0.5, 2.4, 0.55));
  return { up, sq };
}

/** 성격 상한: 강도·속도를 올려도 무거운 캐릭터는 가벼워지지 않고, 잔잔한 캐릭터는 빨라지지 않게 */
const GAIN: Partial<Record<AnimType, { k: number; sp: number }>> = {
  heavy: { k: 0.35, sp: 0.3 },
  rock: { k: 0.6, sp: 0.25 },
  cozy: { k: 0.5, sp: 0.3 },
  nod: { k: 0.6, sp: 0.3 },
  float: { k: 0.6, sp: 0.4 },
  stretch: { k: 0.7, sp: 0.5 },
  waddle: { k: 0.7, sp: 0.4 },
  hang: { k: 0.7, sp: 0.5 },
  squish: { k: 0.8, sp: 0.6 },
  bounce: { k: 0.9, sp: 0.6 },
  bunny: { k: 1, sp: 0.6 },
  leap: { k: 1, sp: 0.6 },
  wag: { k: 1, sp: 0.7 },
  scurry: { k: 1, sp: 0.7 },
};
const eff = (v: number, gain = 1) => (v <= 1 ? v : 1 + (v - 1) * gain);

/** 잔잔한 캐릭터의 반짝임은 덜 자주·덜 밝게 */
const SPARKLE: Partial<Record<AnimType, number>> = { rock: 0.4, cozy: 0.35, float: 0.6, heavy: 0.6, nod: 0.6, stretch: 0.7 };

/**
 * 자세 계산. S: 그림 상자 크기(px), facing: 그림이 보는 방향(오른쪽 1, 왼쪽 -1)
 */
export function computePose(a: AnimSettings, m: MotionFrame, S: number, facing: number): Pose {
  const g = GAIN[a.type];
  const k = eff(a.intensity, g?.k);
  const sp = eff(a.speed, g?.sp);
  const t = m.t;
  // 리듬 위상도 성격 상한을 따르게 (소리 분석은 설정 속도 그대로라, 캐릭터 속도에 맞춰 다시 늘이거나 줄임)
  const phase = m.phase * (sp / Math.max(0.05, a.speed));
  const spr = clamp(m.spring, -0.3, 1.3);
  const lvl = clamp(m.lvl, 0, 1);
  const pulse = clamp(m.pulse, 0, 1);
  const speak = clamp(m.speak, 0, 1);
  const glide = clamp(m.glide, 0, 1);
  const drift = clamp(m.drift, 0, 1);
  const f = facing >= 0 ? 1 : -1;

  const pose: Pose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, pivot: { x: 0, y: 0.5 }, shadow: 1, lift: 0, fx: {}, sparkle: SPARKLE[a.type] ?? 1 };
  const setSquash = (sq: number) => {
    // sq>0 세로로 늘어남, sq<0 납작 (부피가 비슷하게 유지되도록 가로는 반대로)
    pose.sy = 1 + sq;
    pose.sx = 1 - sq * 0.85;
  };

  switch (a.type) {
    // ───────── 기본 움직임 (직접 올린 그림에도 쓰임) ─────────
    case 'squish': {
      // 말랑(토마토): 목소리만큼 부드럽게 눌렸다가, 조용해지면 천천히 둥글게 복원. 반동은 아주 작게
      const sq = 0.05 * k * clamp(glide * 1.15, 0, 1.1);
      const wob = 0.008 * k * pulse * Math.sin(t * 13 * sp);
      const idle = 0.004 * Math.sin(t * 2.1 * sp) * (1 - speak);
      pose.sx = 1 + sq * 0.9 + wob + idle;
      pose.sy = 1 - sq - wob - idle;
      pose.rot = Math.sin(phase * 0.5) * 0.012 * k * speak;
      break;
    }
    case 'hop': {
      // 콩콩: 소리가 툭 커질 때마다 작은 점프
      const h = hop(m.aS, { crouch: 0.05, air: 0.24 / sp, land: 0.1, dip: 0.1, stretch: 0.04, squash: 0.05, rebound: 0.06 });
      const H = S * 0.06 * k * (0.5 + 0.5 * m.eS);
      pose.dy = -h.up * H;
      setSquash(h.sq * k);
      pose.rot = Math.sin(phase * 0.5) * 0.03 * k * speak;
      pose.lift = clamp(h.up, 0, 1);
      break;
    }
    case 'float': {
      // 둥실(풍선): 조용할 땐 조금 낮은 자리에서 아주 작게 둥실. 목소리가 나면 아래에서 위로 둥실 날아오르고
      // (길게 말할수록 높이, 하지만 위쪽 한계에서 멈춰 사라지지 않음), 끝나면 천천히 내려오며 흔들
      const rise = sstep(0, 1, drift * 1.25);
      pose.pivot = { x: 0, y: -0.5 }; // 끈이 아니라 풍선 쪽이 위로 끌려 올라가는 느낌
      pose.dy = S * 0.07 - S * 0.23 * k * rise + Math.sin(t * 1.2 * sp) * S * 0.012;
      pose.dx = Math.sin(t * 0.7 * sp) * S * 0.01 + Math.sin(rise * Math.PI) * S * 0.025;
      // 올라갈 땐 바람을 받아 살짝 기울고, 내려올 땐 좌우로 흔들
      pose.rot = Math.sin(t * 0.9 * sp) * 0.025 + Math.sin(t * 1.6 * sp + 1) * 0.04 * rise;
      pose.sy = 1 + 0.025 * k * clamp(m.glide - drift * 0.5, 0, 1);
      pose.sx = 1 - 0.012 * k * clamp(m.glide - drift * 0.5, 0, 1);
      pose.shadow = 0.35;
      pose.lift = clamp(0.35 + rise, 0, 1);
      break;
    }
    case 'fly': {
      // 날아가기(비행기): 기수 방향으로 기수를 들며 비스듬히 상승, 길게 말하면 완만한 곡선, 끝나면 천천히 수평
      pose.pivot = { x: 0, y: 0 };
      pose.dx = f * S * 0.08 * k * drift;
      pose.dy = -S * 0.055 * k * drift + Math.sin(t * 0.9 * sp) * S * 0.01 * (0.3 + speak);
      pose.rot = -f * (0.12 * k * clamp(drift * 1.1, 0, 1)) + Math.sin(t * 0.8 * sp) * 0.015 * speak;
      pose.shadow = 0;
      break;
    }
    case 'swim': {
      // 물결: 몸이 물결처럼 휘며 헤엄
      pose.pivot = { x: 0, y: 0 };
      pose.dx = f * S * 0.03 * k * spr;
      pose.dy = Math.sin(phase - 0.8) * S * 0.035 * k * speak - S * 0.025 * k * spr;
      pose.rot = Math.sin(phase) * 0.1 * k * (0.15 + speak);
      pose.warp = { axis: 'cols', amp: S * (0.004 + 0.02 * k * lvl), freq: 1.1, phase: phase * 1.4 };
      pose.shadow = 0;
      break;
    }
    case 'cozy': {
      // 포근(이불): 가장 잔잔하게 숨 쉬듯 부풀고, 큰 소리에 살짝 들렸다 천천히 내려옴
      const breath = 0.01 * Math.sin(t * 1.4 * sp);
      const puff = 0.03 * k * drift;
      const s = m.aL;
      const liftEnv = s < 0.3 ? Math.sin(((s / 0.3) * Math.PI) / 2) : Math.exp(-(s - 0.3) / 0.7);
      pose.dy = -S * 0.018 * k * m.eL * (s < 20 ? liftEnv : 0);
      pose.sx = 1 + (breath + puff) * 0.8;
      pose.sy = 1 + breath + puff;
      pose.warp = { axis: 'rows', amp: S * (0.002 + 0.008 * k * lvl), freq: 1.2, phase: t * 2.4 * sp + phase * 0.5 };
      if (m.startT < 1.4) pose.fx.heart = m.startT;
      break;
    }
    case 'roll': {
      // 굴러가기(유모차): 목소리에 앞쪽으로 또르르, 조용해지면 천천히 감속하며 제자리로 (갑작스러운 후진 없이)
      pose.dx = f * S * 0.1 * k * drift;
      pose.dy = -Math.abs(Math.sin(t * 7 * sp)) * S * 0.006 * clamp(drift * 3, 0, 1);
      pose.rot = -f * 0.025 * k * clamp(glide - drift, -0.5, 1);
      break;
    }

    // ───────── 캐릭터 움직임 ─────────
    case 'bounce': {
      // 통통(사과): 살짝 웅크림 → 낮고 둥근 점프 → 착지할 때 가로로 납작 → 작은 반동 후 빠르게 안정
      const o = { crouch: 0.08, air: 0.36 / sp, land: 0.14, dip: 0.15, stretch: 0.05, squash: 0.08, rebound: 0.1 };
      const H = S * 0.065 * k * (0.55 + 0.45 * m.eM);
      const h1 = hop(m.aM, o), h0 = hop(m.bM, o);
      const up = h1.up + h0.up;
      pose.dy = -up * H;
      setSquash((h1.sq + h0.sq) * k - 0.01 * k * glide);
      pose.lift = clamp(up, 0, 1);
      break;
    }
    case 'jelly': {
      // 탱글(귤): 소리마다 제자리에서 눌렸다가 위로 되튀고 빠르게 복원 (위치 이동은 적게)
      const osc = clamp(0.08 * k * m.eS * kick(m.aS, 3.2 * sp, 0.32) + 0.06 * k * kick(m.bS, 3.2 * sp, 0.32) * 0.5, -0.1, 0.1);
      const base = 0.015 * k * glide;
      pose.sx = 1 + osc + base;
      pose.sy = 1 - osc - base;
      pose.dy = -Math.max(0, -osc) * S * 0.35;
      pose.lift = clamp(Math.max(0, -osc) * 4, 0, 1);
      break;
    }
    case 'heavy': {
      // 묵직(수박): 큰 소리에도 살짝 들렸다가 묵직하게 쿵, 착지 후 작은 좌우 흔들림이 천천히 가라앉음
      const s = m.aL;
      const H = S * 0.028 * k * (0.5 + 0.5 * m.eL);
      let up = 0;
      if (s < 0.28 / sp) up = Math.sin(((s / (0.28 / sp)) * Math.PI) / 2);
      else if (s < 0.4 / sp) up = 1 - Math.pow((s - 0.28 / sp) / (0.12 / sp), 2);
      const land = s - 0.4 / sp;
      const squash = 0.06 * k * Math.max(0, kick(land, 2.0 * sp, 0.45)) + 0.02 * k * glide;
      pose.dy = -up * H;
      pose.sx = 1 + squash * 0.9;
      pose.sy = 1 - squash;
      pose.rot = dirOf(m.nL) * 0.05 * k * kick(land, 0.75 * sp, 0.3);
      pose.lift = clamp(up, 0, 1);
      if (land >= 0 && land < 0.5) pose.fx.thud = 1 - land / 0.5;
      break;
    }
    case 'sway': {
      // 살랑춤(바나나): 아래를 축으로 긴 호를 그리며 좌우로 부드럽게, 짧은 소리엔 작은 리듬
      const sw = Math.sin(phase * 0.6);
      pose.rot = sw * 0.13 * k * speak + Math.sin(t * 1.8 * sp) * 0.015 + 0.04 * k * pulse * Math.sin(t * 9 * sp);
      pose.dx = sw * S * 0.025 * k * speak;
      pose.sy = 1 + 0.03 * k * glide;
      pose.sx = 1 - 0.015 * k * glide;
      break;
    }
    case 'wobbly': {
      // 오뚝이(가지): 소리마다 아래를 축으로 크게 기우뚱 → 반대쪽으로 작게 흔들린 뒤 바로 섬 (좌우는 번갈아, 떨림 없이)
      const d = dirOf(m.nM);
      const tilt = 0.17 * k * m.eM * (d * kick(m.aM, 1.1 * sp, 0.42) - d * kick(m.bM, 1.1 * sp, 0.42) * 0.8);
      pose.rot = tilt + d * 0.03 * k * glide;
      pose.sy = 1 - 0.015 * k * pulse;
      break;
    }
    case 'sprout': {
      // 쑥쑥(당근): 아래 기준으로 쏙 솟으며 세로로 길어졌다가 조금 내려앉고, 끝에 작은 좌우 흔들림으로 자리 잡기
      const up = clamp(spr, -0.1, 1.15);
      pose.dy = -S * 0.085 * k * up;
      pose.sy = 1 + 0.07 * k * up - 0.035 * k * pulse;
      pose.sx = 1 - 0.04 * k * up + 0.025 * k * pulse;
      pose.rot = 0.05 * k * kick(m.quietT, 1.4 * sp, 0.35) + Math.sin(phase * 0.7) * 0.02 * k * speak;
      pose.warp = { axis: 'rows', amp: S * (0.002 + 0.008 * k * lvl), freq: 0.9, phase: t * 6 * sp };
      pose.lift = clamp(up * 0.5, 0, 1);
      break;
    }
    case 'popcorn': {
      // 톡톡(옥수수): 짧은 소리의 시작에 작고 빠르게 톡 (간격을 둬서 잡음에 계속 떨지 않게),
      // 길게 이어지는 소리엔 점프 대신 작은 몸 떨림
      const s = m.aS;
      const T = 0.2 / sp;
      const up = s < T ? 4 * (s / T) * (1 - s / T) : 0;
      const tremble = clamp((m.startT - 0.5) / 0.4, 0, 1) * speak * lvl * k;
      pose.dy = -S * 0.05 * k * m.eS * up;
      pose.dx = (Math.sin(t * 47) + Math.sin(t * 31)) * S * 0.004 * tremble;
      pose.rot = Math.sin(t * 39) * 0.03 * tremble;
      setSquash(0.03 * k * up - 0.03 * k * Math.max(0, kick(s - T, 4, 0.5)));
      pose.lift = clamp(up, 0, 1);
      break;
    }
    case 'heartbeat': {
      // 두근(딸기): 소리마다 "두-근"(큰 박동 + 작은 박동)으로 작게 커졌다 돌아옴, 기울기는 아주 조금.
      // 말을 시작하는 순간 작은 하트가 하나 떠올랐다 사라짐
      const s = m.aS;
      const bump = (st: number, d: number) => (s >= st && s <= st + d ? Math.sin((Math.PI * (s - st)) / d) : 0);
      const beat = bump(0, 0.12 / sp) + 0.6 * bump(0.2 / sp, 0.1 / sp);
      const sc = 1 + 0.065 * k * m.eS * beat + 0.022 * k * glide + 0.004 * Math.sin(t * 2 * sp);
      pose.pivot = { x: 0, y: 0.2 };
      pose.sx = sc;
      pose.sy = sc;
      pose.rot = Math.sin(phase * 0.4) * 0.02 * k * speak;
      if (m.startT < 1.1) pose.fx.heart = m.startT;
      break;
    }
    case 'tumble': {
      // 데굴(도토리): 소리마다 굴렀다가 가운데로 돌아옴. 굴러간 거리만큼 회전해서 미끄러지지 않게
      const shape = (s: number) => (s >= 20 ? 0 : s < 0.35 ? Math.sin(((s / 0.35) * Math.PI) / 2) : s < 0.6 ? 1 : 1 - sstep(0.6, 1.5, s));
      const d = dirOf(m.nM);
      const dist = clamp(S * 0.09 * k * m.eM * (d * shape(m.aM / (1 / sp)) - d * shape(m.bM / (1 / sp))), -S * 0.12, S * 0.12);
      pose.pivot = { x: 0, y: 0 };
      pose.dx = dist;
      pose.rot = dist / (S * 0.33);
      pose.dy = -S * 0.012 * k * Math.sin(Math.PI * clamp(m.aM / 0.35, 0, 1));
      break;
    }
    case 'hang': {
      // 대롱(포도): 위쪽 줄기를 축으로 송이째 흔들. 말이 시작될 때 힘을 받고, 끝나면 관성으로 조금 흔들리다 멈춤
      const d = dirOf(m.nM);
      const swing = 0.13 * k * m.eM * (d * kick(m.aM, 0.8 * sp, 0.2) - d * kick(m.bM, 0.8 * sp, 0.2) * 0.7);
      pose.pivot = { x: 0, y: -0.46 };
      pose.rot = swing + Math.sin(t * 1.1 * sp) * 0.012 + 0.025 * k * glide * Math.sin(t * 2.4 * sp);
      pose.sx = pose.sy = 1 + 0.01 * k * glide;
      break;
    }
    case 'bunny': {
      // 깡총(토끼): 웅크림 → 몸이 길어지며 높이 깡총 → 착지할 때 납작 → 복원.
      // 짧은 말엔 한 번, 긴 말엔 충분한 간격(0.95초)을 두고 다시
      const o = { crouch: 0.11 / sp, air: 0.5 / sp, land: 0.16, dip: 0.12, stretch: 0.09, squash: 0.1, rebound: 0.05 };
      const H = S * 0.13 * k * (0.6 + 0.4 * m.eL);
      // 소리가 끊기지 않고 길게 이어지면 충분한 간격(P초)을 두고 다시 깡총. 말이 끝난 뒤엔 새로 뛰지 않음
      const P = Math.max(1.3, o.crouch + o.air + o.land + 0.45);
      const said = m.aL >= 20 ? 0 : m.quietT > 0 ? Math.max(0, m.aL - m.quietT) : m.aL; // 이번 소리가 이어진 시간
      const n = m.aL >= 20 ? 0 : Math.floor(said / P);
      const h1 = hop(m.aL - n * P, o);
      const h0 = n > 0 ? hop(m.aL - (n - 1) * P, o) : hop(m.bL, o);
      const up = h1.up + h0.up;
      pose.dy = -up * H;
      setSquash((h1.sq + h0.sq) * k);
      pose.rot = -0.04 * k * clamp(up, 0, 1) * f;
      pose.lift = clamp(up, 0, 1);
      break;
    }
    case 'waddle': {
      // 뒤뚱(곰): 양발에 번갈아 무게를 싣는 걸음. 몸이 옮겨 가는 쪽으로 같이 기울고, 디딜 때마다 살짝 높이 변화
      const ph = phase * 0.55;
      const th = Math.sin(ph) * 0.09 * k * (0.15 + 0.85 * speak);
      pose.rot = th;
      pose.dy = -Math.abs(Math.sin(th)) * S * 0.22;
      pose.dx = Math.sin(ph) * S * 0.016 * k * speak;
      pose.sy = 1 - 0.025 * k * glide;
      pose.sx = 1 + 0.025 * k * glide;
      break;
    }
    case 'stretch': {
      // 기지개(고양이): 길게 이어지는 소리에 몸이 천천히 위로 길어지며 기울고, 끝나면 여유 있게 돌아옴.
      // 짧은 소리엔 작은 갸웃
      const st = clamp(m.drift * 1.2, 0, 1.1);
      pose.sy = 1 + 0.075 * k * st + 0.007 * Math.sin(t * 1.5 * sp);
      pose.sx = 1 - 0.035 * k * st;
      pose.rot = Math.sin(t * 0.9 * sp) * 0.05 * k * st + 0.06 * k * m.eS * dirOf(m.nS) * kick(m.aS, 1.0 * sp, 0.5);
      pose.warp = { axis: 'rows', amp: S * (0.002 + 0.007 * k * lvl), freq: 0.8, phase: t * 3 * sp };
      break;
    }
    case 'wag': {
      // 신나(강아지): 반가워서 엉덩이를 씰룩이며(머리 쪽을 축으로) 좌우로 빠르게, 작은 발 구름, 큰 소리엔 가끔 작은 점프
      const amp = 0.065 * k * (0.35 * speak + 0.65 * lvl);
      pose.pivot = { x: 0, y: -0.25 };
      pose.rot = Math.sin(t * 15 * sp) * amp + Math.sin(t * 2.2 * sp) * 0.012 * (1 - speak);
      const big = m.eM > 0.65 ? hop(m.aM, { crouch: 0.05, air: 0.24 / sp, land: 0.1, dip: 0.08, stretch: 0.03, squash: 0.04, rebound: 0.04 }) : { up: 0, sq: 0 };
      pose.dy = -Math.abs(Math.sin(t * 7.5 * sp)) * S * 0.012 * speak - big.up * S * 0.045 * k;
      setSquash(big.sq * k);
      pose.lift = clamp(big.up, 0, 1);
      break;
    }
    case 'nod': {
      // 끄덕(소): 뒤쪽 아래를 축으로 머리 쪽이 천천히 숙여졌다 올라옴. 큰 소리에도 급해지지 않게
      pose.pivot = { x: -f * 0.32, y: 0.45 };
      pose.rot = f * (0.065 * k * drift + 0.03 * k * drift * (0.5 + 0.5 * Math.sin(t * 2.3 * sp)));
      pose.sy = 1 - 0.015 * k * drift;
      pose.dy = Math.sin(t * 1.2 * sp) * S * 0.003;
      break;
    }
    case 'scurry': {
      // 쪼르르(다람쥐): 작은 범위에서 두세 번 재빠르게 움직인 뒤 멈춰서 갸웃. 항상 가운데로 돌아옴
      const keys: [number, number][] = [[0, 0], [0.14, 1], [0.28, 0.4], [0.42, 0.85], [0.9, 0.85], [1.5, 0]];
      const pos = (s: number) => {
        s *= sp;
        if (s >= 20 || s <= 0) return 0;
        for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * sstep(keys[i - 1][0], keys[i][0], s);
        return 0;
      };
      const d = dirOf(m.nL);
      const s = m.aL * sp;
      pose.dx = clamp(S * 0.06 * k * m.eL * (d * pos(m.aL) - d * pos(m.bL)), -S * 0.08, S * 0.08);
      pose.dy = s < 0.42 ? -S * 0.03 * k * Math.abs(Math.sin((Math.PI * s) / 0.14)) : 0;
      pose.rot = d * 0.1 * k * kick(s - 0.42, 1.3, 0.45) + (s < 0.42 ? d * 0.04 * Math.sin((Math.PI * s) / 0.14) : 0);
      pose.lift = clamp(-pose.dy / (S * 0.03), 0, 1) * 0.6;
      break;
    }
    case 'leap': {
      // 첨벙(돌고래): 소리마다 곡선 점프 — 머리를 들며 비스듬히 오르고, 정점에서 부드럽게 방향을 바꿔 머리 숙여 입수 + 물방울
      const T = 0.85 / sp;
      const H = S * 0.14 * k * (0.6 + 0.4 * m.eL);
      const arc = (s: number) => (s >= 0 && s < T ? Math.sin((Math.PI * s) / T) : 0);
      const fwd = (s: number) => (s >= 20 ? 0 : s < T ? s / T : Math.exp(-(s - T) / 0.8));
      const u = m.aL / T;
      const up = arc(m.aL) * (0.6 + 0.4 * m.eL) / 1;
      pose.pivot = { x: 0, y: 0 };
      pose.dy = -arc(m.aL) * H + Math.sin(t * 1.6 * sp) * S * 0.008;
      pose.dx = clamp(f * S * 0.07 * k * (fwd(m.aL) + fwd(m.bL)), -S * 0.12, S * 0.12);
      // 머리 방향: 오를 땐 위로, 정점에서 수평, 내려갈 땐 아래로, 입수 뒤 천천히 수평. 이전 점프의 남은 값도 더해 끊김 없이
      const noseOf = (s: number) => (s >= 20 ? 0 : s < T ? Math.cos((Math.PI * s) / T) * sstep(0, 0.15, s / T) : -Math.exp(-(s - T) / 0.25));
      const nose = noseOf(m.aL) * (0.6 + 0.4 * m.eL) + (m.bL >= T ? noseOf(m.bL) * 0.8 : 0);
      pose.rot = -f * 0.38 * k * nose + Math.sin(t * 1.6 * sp) * 0.03;
      pose.shadow = 0;
      pose.lift = clamp(up, 0, 1);
      if (m.aL >= T && m.aL < T + 0.55) pose.fx.splash = (m.aL - T) / 0.55;
      break;
    }
    case 'rock': {
      // 흔들(달): 아래쪽을 축으로 요람처럼 천천히. 목소리가 커지면 빨라지지 않고 흔들림 폭만 조금 커짐
      pose.rot = (0.035 + 0.11 * k * drift) * Math.sin(t * 1.25 * sp);
      pose.dy = -S * 0.025 * k * drift + Math.sin(t * 1.1 * sp) * S * 0.005;
      pose.shadow = 0.45;
      break;
    }
  }

  // 그림이 그림 칸 밖으로 나가지 않도록 상한
  pose.dx = clamp(pose.dx, -S * 0.15, S * 0.15);
  pose.dy = clamp(pose.dy, -S * 0.17, S * 0.1);
  pose.rot = clamp(pose.rot, -0.3, 0.3);
  pose.sx = clamp(pose.sx, 0.88, 1.14);
  pose.sy = clamp(pose.sy, 0.88, 1.14);
  return pose;
}
