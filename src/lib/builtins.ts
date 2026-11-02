import type { AnimType, Category } from './types';

/**
 * 기본 그림 23종 — 수채화 질감의 귀여운 그림책 그림체
 * - 고양이·강아지·소·풍선·이불·토마토·다람쥐·포도·도토리·유모차·비행기: 사용자가 제공한 그림에서 잘라낸 것
 * - 나머지 12종: 같은 그림체(납작한 색, 점 눈, 볼터치, 수채화 질감)로 새로 그린 것
 * - 모든 그림은 원래 그려져 있던 입을 지운 상태로 저장되어 있고,
 *   앱이 같은 색·굵기의 입을 그 자리에 그립니다 (목소리에 맞춰 열리거나, 끄면 미소로 고정).
 */

export interface MouthMeta {
  /** 그림 크기 대비 0~1 좌표 (입 가운데) */
  x: number;
  y: number;
  /** 그림 너비 대비 입 너비 */
  w: number;
  color: string;
}

export interface BuiltinDef {
  key: string;
  name: string;
  category: Category;
  anim: AnimType;
  src: string;
  mouth: MouthMeta;
  /** 그림이 보는 방향: 오른쪽 1, 왼쪽 -1 (앞을 보면 1). 날아가기·굴러가기·첨벙·끄덕의 이동 방향 */
  facing: 1 | -1;
}

const ART = import.meta.glob('../assets/art/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const art = (k: string) => ART[`../assets/art/${k}.webp`];

const MOUTH: Record<string, MouthMeta> = {
  cat: { x: 0.3918, y: 0.4548, w: 0.0822, color: '#1f1e1c' },
  puppy: { x: 0.4787, y: 0.4427, w: 0.0827, color: '#23201c' },
  cow: { x: 0.3024, y: 0.5619, w: 0.0539, color: '#201e1c' },
  balloon: { x: 0.4976, y: 0.3952, w: 0.0714, color: '#231b1b' },
  blanket: { x: 0.4137, y: 0.5142, w: 0.0615, color: '#1b1b1a' },
  tomato: { x: 0.4923, y: 0.6092, w: 0.1046, color: '#2e1916' },
  squirrel: { x: 0.2857, y: 0.4164, w: 0.0701, color: '#201f1b' },
  grape: { x: 0.4683, y: 0.5482, w: 0.0882, color: '#281930' },
  acorn: { x: 0.5784, y: 0.6176, w: 0.085, color: '#282018' },
  stroller: { x: 0.3827, y: 0.5404, w: 0.0647, color: '#251c1e' },
  airplane: { x: 0.2731, y: 0.4921, w: 0.0511, color: '#1c1c1c' },
  apple: { x: 0.4991, y: 0.6795, w: 0.0981, color: '#2A2422' },
  eggplant: { x: 0.5145, y: 0.7247, w: 0.0896, color: '#2A2422' },
  banana: { x: 0.4683, y: 0.8141, w: 0.083, color: '#2A2422' },
  mandarin: { x: 0.5, y: 0.6558, w: 0.1121, color: '#2A2422' },
  watermelon: { x: 0.5, y: 0.4291, w: 0.1027, color: '#2A2422' },
  strawberry: { x: 0.4991, y: 0.604, w: 0.1016, color: '#2A2422' },
  carrot: { x: 0.5, y: 0.5437, w: 0.0827, color: '#2A2422' },
  corn: { x: 0.4991, y: 0.5208, w: 0.0874, color: '#2A2422' },
  bear: { x: 0.4992, y: 0.4616, w: 0.0699, color: '#2A2422' },
  rabbit: { x: 0.474, y: 0.5801, w: 0.0577, color: '#2A2422' },
  dolphin: { x: 0.8838, y: 0.5404, w: 0.0517, color: '#2A2422' },
  moon: { x: 0.3073, y: 0.6853, w: 0.0803, color: '#2A2422' },
};

const LIST: [string, string, Category, AnimType][] = [
  ['apple', '사과', 'fruit', 'bounce'],
  ['eggplant', '가지', 'fruit', 'wobbly'],
  ['banana', '바나나', 'fruit', 'sway'],
  ['mandarin', '귤', 'fruit', 'jelly'],
  ['watermelon', '수박', 'fruit', 'heavy'],
  ['strawberry', '딸기', 'fruit', 'heartbeat'],
  ['carrot', '당근', 'fruit', 'sprout'],
  ['corn', '옥수수', 'fruit', 'popcorn'],
  ['tomato', '토마토', 'fruit', 'squish'],
  ['grape', '포도', 'fruit', 'hang'],
  ['acorn', '도토리', 'fruit', 'tumble'],
  ['bear', '곰', 'animal', 'waddle'],
  ['rabbit', '토끼', 'animal', 'bunny'],
  ['dolphin', '돌고래', 'animal', 'leap'],
  ['cat', '고양이', 'animal', 'stretch'],
  ['puppy', '강아지', 'animal', 'wag'],
  ['cow', '소', 'animal', 'nod'],
  ['squirrel', '다람쥐', 'animal', 'scurry'],
  ['moon', '달', 'thing', 'rock'],
  ['balloon', '풍선', 'thing', 'float'],
  ['blanket', '이불', 'thing', 'cozy'],
  ['stroller', '유모차', 'thing', 'roll'],
  ['airplane', '비행기', 'thing', 'fly'],
];

/** 실제 그림을 보고 정한 방향: 비행기 기수·유모차 앞쪽·소 머리는 왼쪽, 돌고래 머리는 오른쪽 */
const FACING: Record<string, 1 | -1> = { airplane: -1, stroller: -1, cow: -1, dolphin: 1 };

export const BUILTINS: BuiltinDef[] = LIST.map(([key, name, category, anim]) => ({ key, name, category, anim, src: art(key), mouth: MOUTH[key], facing: FACING[key] ?? 1 }));

export const BUILTIN_MAP: Record<string, BuiltinDef> = Object.fromEntries(BUILTINS.map((b) => [b.key, b]));

/** 이름으로 어울리는 움직임 추측 (새 그림을 올릴 때 사용) */
const KEYWORDS: [RegExp, AnimType][] = [
  [/이불|베개|담요|인형|잠옷|곰인형/, 'cozy'],
  [/당근|^무$|^파$|새싹/, 'sprout'],
  [/비행기|새|나비|헬리콥터|로켓|잠자리|독수리|갈매기/, 'fly'],
  [/돌고래|고래/, 'leap'],
  [/물고기|상어|거북|문어|오리|해파리|금붕어/, 'swim'],
  [/토끼|캥거루|개구리/, 'bunny'],
  [/곰|펭귄|오리|코끼리|하마/, 'waddle'],
  [/고양이|야옹|사자|호랑이/, 'stretch'],
  [/강아지|멍멍|댕댕/, 'wag'],
  [/^소$|음매|젖소|^말$|기린|^양$/, 'nod'],
  [/다람쥐|쥐|햄스터|병아리/, 'scurry'],
  [/딸기|하트/, 'heartbeat'],
  [/사과|^공$|복숭아/, 'bounce'],
  [/수박|호박/, 'heavy'],
  [/바나나/, 'sway'],
  [/옥수수|팝콘/, 'popcorn'],
  [/포도|체리|송이|열쇠고리|종/, 'hang'],
  [/귤|젤리|푸딩|오렌지/, 'jelly'],
  [/가지|오뚝이/, 'wobbly'],
  [/도토리|^밤$|구슬/, 'tumble'],
  [/^달$|초승달/, 'rock'],
  [/^달$|풍선|구름|별|무지개|비눗방울|해님/, 'float'],
  [/유모차|자동차|차|버스|기차|트럭|자전거|붕붕|공|바퀴/, 'roll'],
  [/곰|토끼|고양이|강아지|멍멍|야옹|소|다람쥐|말|돼지|양|사자|호랑이|코끼리|기린|병아리|닭|원숭이|개구리|여우|쥐|판다/, 'hop'],
];

export function guessAnim(name: string): AnimType {
  const b = BUILTINS.find((d) => d.name === name);
  if (b) return b.anim;
  for (const [re, a] of KEYWORDS) if (re.test(name)) return a;
  return 'squish';
}
