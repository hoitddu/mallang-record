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
  | 'fluke'; // 꼬리지느러미 (돌고래): 물을 차며 헤엄

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
  base: string;
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
};

const SEED: Record<string, number> = { rabbit: 0.7, puppy: 2.3, dolphin: 4.1 };

type Meta = Record<string, { eyes: EyeDef[]; boxes: Record<string, [number, number, number, number]> }>;

export const RIGS: Record<string, RigDef> = Object.fromEntries(
  Object.entries(PARTS).map(([key, parts]) => {
    const m = (meta as unknown as Meta)[key];
    return [
      key,
      {
        parts: parts.map((p) => ({ ...p, box: m.boxes[p.name], src: file(`${key}-${p.name}`) })),
        eyes: m.eyes,
        base: file(`${key}-base`),
        eyesSrc: file(`${key}-eyes`),
        seed: SEED[key] ?? 0,
      } satisfies RigDef,
    ];
  })
);
