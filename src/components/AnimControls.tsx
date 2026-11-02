import type { AnimSettings, AnimType } from '../lib/types';
import { Slider, Toggle } from './ui';

export const ANIM_OPTIONS: { v: AnimType; label: string; desc: string; group: 'basic' | 'character' }[] = [
  { v: 'squish', label: '말랑', desc: '살짝 납작해졌다 통통 복원', group: 'basic' },
  { v: 'hop', label: '콩콩', desc: '소리마다 작게 콩 뛰기', group: 'basic' },
  { v: 'float', label: '둥실', desc: '떠오르며 흔들흔들', group: 'basic' },
  { v: 'fly', label: '날아가기', desc: '앞으로 쓩, 바람선과 구름', group: 'basic' },
  { v: 'swim', label: '물결', desc: '몸이 물결처럼 헤엄', group: 'basic' },
  { v: 'cozy', label: '포근', desc: '숨 쉬듯 부풀고 살랑', group: 'basic' },
  { v: 'roll', label: '굴러가기', desc: '앞으로 데굴, 먼지 폴폴', group: 'basic' },
  { v: 'bounce', label: '통통', desc: '공처럼 튀고 바닥에서 찌그러짐', group: 'character' },
  { v: 'jelly', label: '탱글', desc: '젤리처럼 탱글탱글 떨림', group: 'character' },
  { v: 'heavy', label: '묵직', desc: '무겁게 쿵, 천천히 흔들', group: 'character' },
  { v: 'sway', label: '살랑춤', desc: '아래를 축으로 좌우로 춤', group: 'character' },
  { v: 'wobbly', label: '오뚝이', desc: '기우뚱했다 다시 서기', group: 'character' },
  { v: 'sprout', label: '쑥쑥', desc: '땅에서 쑥 뽑히듯 솟음', group: 'character' },
  { v: 'popcorn', label: '톡톡', desc: '팝콘처럼 톡톡 튀며 바르르', group: 'character' },
  { v: 'heartbeat', label: '두근', desc: '하트처럼 두근두근 커짐', group: 'character' },
  { v: 'tumble', label: '데굴', desc: '좌우로 구르듯 기울기', group: 'character' },
  { v: 'bunny', label: '깡총', desc: '높이 깡총, 착지할 때 납작', group: 'character' },
  { v: 'waddle', label: '뒤뚱', desc: '양발로 번갈아 뒤뚱뒤뚱', group: 'character' },
  { v: 'stretch', label: '기지개', desc: '몸을 쭉 늘이며 느긋하게', group: 'character' },
  { v: 'wag', label: '신나', desc: '빠르게 몸을 흔들며 들뜸', group: 'character' },
  { v: 'nod', label: '끄덕', desc: '느릿하게 고개를 끄덕', group: 'character' },
  { v: 'scurry', label: '쪼르르', desc: '작고 빠르게 콩콩, 갸웃갸웃', group: 'character' },
  { v: 'leap', label: '첨벙', desc: '물 위로 뛰어올라 몸을 젖힘', group: 'character' },
  { v: 'rock', label: '흔들', desc: '요람처럼 흔들흔들', group: 'character' },
];

const GROUPS: { g: 'character' | 'basic'; title: string }[] = [
  { g: 'character', title: '캐릭터 움직임' },
  { g: 'basic', title: '기본 움직임' },
];

export function AnimControls({ value, onChange, idPrefix, hasMouth }: { value: AnimSettings; onChange: (a: AnimSettings) => void; idPrefix: string; hasMouth?: boolean }) {
  const set = (p: Partial<AnimSettings>) => onChange({ ...value, ...p });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="label">움직임 방식</p>
        {GROUPS.map(({ g, title }) => (
        <div key={g}>
        <p className="hint mb-1.5">{title}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ANIM_OPTIONS.filter((o) => o.group === g).map((o) => (
            <button
              key={o.v}
              className={`cut px-3 py-2.5 text-left ${value.type === o.v ? 'bg-ink text-white' : 'bg-sheet text-ink shadow-paper'}`}
              aria-pressed={value.type === o.v}
              onClick={() => set({ type: o.v })}
            >
              <span className="block font-display text-[16px] leading-tight">{o.label}</span>
              <span className={`block text-[12px] leading-snug ${value.type === o.v ? 'text-white/75' : 'text-soft'}`}>{o.desc}</span>
            </button>
          ))}
        </div>
        </div>
        ))}
      </div>
      <Slider id={idPrefix + '-int'} label="움직임 강도" value={value.intensity} min={0.3} max={2} onChange={(v) => set({ intensity: v })} format={pct} />
      <Slider id={idPrefix + '-spd'} label="움직임 속도" value={value.speed} min={0.5} max={2} onChange={(v) => set({ speed: v })} format={pct} />
      <Slider
        id={idPrefix + '-sens'}
        label="목소리 반응 민감도"
        value={value.sensitivity}
        min={0}
        max={1}
        onChange={(v) => set({ sensitivity: v })}
        format={(v) => (v < 0.34 ? '둔하게 (시끄러운 곳)' : v < 0.67 ? '보통' : '예민하게 (작은 목소리)')}
      />
      <div className="divide-y divide-line">
        {hasMouth && (
          <Toggle
            id={idPrefix + '-mouth'}
            label="입 움직이기"
            hint="목소리 크기에 맞춰 그림 속 입이 열려요. 끄면 미소로 고정돼요."
            checked={value.mouth !== false}
            onChange={(v) => set({ mouth: v })}
          />
        )}
        <Toggle id={idPrefix + '-fx'} label="효과선" hint="바람선·물결·소리 파동" checked={value.effects} onChange={(v) => set({ effects: v })} />
        <Toggle id={idPrefix + '-sp'} label="반짝임" hint="별·하트·물방울" checked={value.sparkles} onChange={(v) => set({ sparkles: v })} />
      </div>
    </div>
  );
}
