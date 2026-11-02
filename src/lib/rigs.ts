import meta from '../assets/rig/rig.json';

/**
 * 부위별 움직임 (2D 뼈대) — 시범: 토끼·강아지·돌고래
 *
 * 원본 그림을 다시 그리지 않고, scripts/make-rig.py 로 나눈 조각을 씁니다.
 *  - base: 움직일 부위와 눈을 떼어 낸 바탕
 *  - parts: 귀·꼬리 같은 부위 (원본과 같은 크기, 나머지는 투명)
 *  - eyes: 눈만 남긴 조각 (깜빡임용)
 * 부위는 뿌리(pivot)를 축으로 휘어지며 움직입니다. 뿌리 쪽은 움직이지 않아 바탕과 이음새가 생기지 않습니다.
 */

/** 부위를 움직이는 방식 */
export type Drive =
  | 'earUp' // 쫑긋 선 귀 (토끼): 목소리에 귀가 벌어지고, 소리마다 출렁
  | 'earFlop' // 늘어진 귀 (강아지): 목소리에 펄럭 들림
  | 'tailWag' // 꼬리 살랑살랑 (강아지): 말할수록 빠르고 크게
  | 'pom' // 방울 꼬리 (토끼): 소리마다 달랑
  | 'fluke' // 꼬리지느러미 (돌고래): 물을 차며 헤엄
  | 'earTwitch' // 뾰족한 귀 (고양이·다람쥐): 소리가 나면 움찔, 가끔 혼자 쫑긋
  | 'tailSway' // 느긋한 S자 꼬리 (고양이): 천천히 살랑, 큰 소리에 휙
  | 'tailSwish' // 가는 꼬리 (소): 좌우로 휙휙
  | 'bushyTail'; // 큰 꼬리 (다람쥐): 출렁출렁

export interface RigPartDef {
  name: string;
  /** 뿌리(움직이지 않는 곳), 그림 크기 대비 0~1 */
  pivot: [number, number];
  /** 부위 끝 쪽 방향 (뿌리 → 끝) */
  tip: [number, number];
  /** 휘는 정도: 0이면 통째로 회전, 클수록 끝으로 갈수록 더 휨 */
  bend: number;
  drive: Drive;
  /** 왼쪽(-1)·오른쪽(1) 부위 */
  side?: -1 | 1;
  /**
   * 자른 선(두 점). 있으면 이 선은 움직이지 않고, 선에서 멀어질수록 더 많이 휨
   * → 자른 자리 전체에 틈이 생기지 않음 (뿌리는 이 선의 가운데)
   */
  cut?: [[number, number], [number, number]];
  /** 몸 뒤에 있는 부위 (꼬리 등): 바탕보다 먼저 그려서 몸에 가려짐 */
  behind?: boolean;
  /** 움직임 크기 배율 (기본 1) */
  amp?: number;
}

export interface EyeDef {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
}

export interface RigDef {
  parts: (RigPartDef & { box: [number, number, number, number]; src: string })[];
  eyes: EyeDef[];
  /** 부위가 있는 캐릭터: 부위·눈을 떼어 낸 바탕 */
  base?: string;
  /** 눈만 깜빡이는 캐릭터: 원본 위에 얹는 "눈 자리 덮개" (용량이 작음) */
  cover?: string;
  eyesSrc: string;
  /** 깜빡임 박자를 캐릭터마다 다르게 */
  seed: number;
}

const FILES = import.meta.glob('../assets/rig/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const file = (n: string) => FILES[`../assets/rig/${n}.webp`];

const PARTS: Record<string, RigPartDef[]> = {
  rabbit: [
    { name: 'ear-l', pivot: [0.37, 0.305], tip: [0.335, 0.04], bend: 1.3, drive: 'earUp', side: -1 },
    { name: 'ear-r', pivot: [0.595, 0.305], tip: [0.62, 0.04], bend: 1.3, drive: 'earUp', side: 1 },
    { name: 'tail', pivot: [0.716, 0.81], tip: [0.79, 0.81], bend: 0, drive: 'pom' },
  ],
  puppy: [
    { name: 'ear-l', pivot: [0.29, 0.15], tip: [0.1, 0.42], bend: 1.15, drive: 'earFlop', side: -1 },
    { name: 'ear-r', pivot: [0.665, 0.13], tip: [0.85, 0.4], bend: 1.15, drive: 'earFlop', side: 1 },
    { name: 'tail', pivot: [0.8, 0.635], tip: [0.905, 0.52], bend: 1.1, drive: 'tailWag' },
  ],
  dolphin: [{ name: 'tail', pivot: [0.3, 0.575], tip: [0.03, 0.57], bend: 1.7, drive: 'fluke' }],
  bear: [
    { name: 'ear-l', pivot: [0.32, 0.168], cut: [[0.255, 0.22], [0.385, 0.115]], tip: [0.27, 0.05], bend: 0.8, drive: 'earUp', side: -1, amp: 0.55 },
    { name: 'ear-r', pivot: [0.68, 0.168], cut: [[0.615, 0.115], [0.745, 0.22]], tip: [0.73, 0.05], bend: 0.8, drive: 'earUp', side: 1, amp: 0.55 },
  ],
  cat: [
    { name: 'tail', pivot: [0.72, 0.84], tip: [0.84, 0.53], bend: 1.4, drive: 'tailSway', behind: true },
    { name: 'ear-l', pivot: [0.22, 0.21], cut: [[0.143, 0.268], [0.3, 0.152]], tip: [0.14, 0.075], bend: 0.9, drive: 'earTwitch', side: -1 },
    { name: 'ear-r', pivot: [0.6, 0.2], cut: [[0.516, 0.154], [0.68, 0.255]], tip: [0.66, 0.065], bend: 0.9, drive: 'earTwitch', side: 1 },
  ],
  cow: [
    { name: 'tail', pivot: [0.828, 0.43], tip: [0.91, 0.63], bend: 1.2, drive: 'tailSwish', behind: true },
    { name: 'ear-l', pivot: [0.205, 0.3], tip: [0.05, 0.3], bend: 0.9, drive: 'earFlop', side: -1, amp: 0.8, behind: true },
    { name: 'ear-r', pivot: [0.49, 0.3], tip: [0.6, 0.29], bend: 0.9, drive: 'earFlop', side: 1, amp: 0.8, behind: true },
  ],
  squirrel: [
    { name: 'tail', pivot: [0.64, 0.8], tip: [0.8, 0.22], bend: 1.3, drive: 'bushyTail', behind: true },
    { name: 'ear-l', pivot: [0.22, 0.186], cut: [[0.167, 0.217], [0.275, 0.155]], tip: [0.205, 0.085], bend: 0.9, drive: 'earTwitch', side: -1 },
    { name: 'ear-r', pivot: [0.47, 0.195], cut: [[0.405, 0.164], [0.535, 0.225]], tip: [0.5, 0.09], bend: 0.9, drive: 'earTwitch', side: 1 },
  ],
};

type Meta = Record<string, { eyes: EyeDef[]; boxes: Record<string, [number, number, number, number]>; cover?: boolean }>;

/** 캐릭터마다 깜빡이는 박자가 겹치지 않게 (이름으로 정해지는 고정값) */
const seedOf = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h / 997) * 7;
};

/** 부위 움직임(토끼·강아지·돌고래·곰·고양이·소·다람쥐) + 눈 깜빡임(기본 그림 전부) */
export const RIGS: Record<string, RigDef> = Object.fromEntries(
  Object.entries(meta as unknown as Meta).map(([key, m]) => {
    const parts = PARTS[key] ?? [];
    return [
      key,
      {
        parts: parts.map((p) => ({ ...p, box: m.boxes[p.name], src: file(`${key}-${p.name}`) })),
        eyes: m.eyes,
        base: parts.length ? file(`${key}-base`) : undefined,
        cover: m.cover ? file(`${key}-cover`) : undefined,
        eyesSrc: file(`${key}-eyes`),
        seed: seedOf(key),
      } satisfies RigDef,
    ];
  })
);
