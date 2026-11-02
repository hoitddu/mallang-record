import type { AnimSettings, AnimType } from '../lib/types';
import { Slider, Toggle } from './ui';

export const ANIM_OPTIONS: { v: AnimType; label: string; desc: string }[] = [
  { v: 'squish', label: '말랑', desc: '살짝 납작해졌다 통통 복원' },
  { v: 'hop', label: '콩콩', desc: '소리마다 작게 콩 뛰기' },
  { v: 'float', label: '둥실', desc: '떠오르며 흔들흔들' },
  { v: 'fly', label: '날아가기', desc: '앞으로 쓩, 바람선과 구름' },
  { v: 'swim', label: '물결', desc: '몸이 물결처럼 헤엄' },
  { v: 'cozy', label: '포근', desc: '숨 쉬듯 부풀고 살랑' },
  { v: 'roll', label: '굴러가기', desc: '앞으로 데굴, 먼지 폴폴' },
];

export function AnimControls({ value, onChange, idPrefix, hasMouth }: { value: AnimSettings; onChange: (a: AnimSettings) => void; idPrefix: string; hasMouth?: boolean }) {
  const set = (p: Partial<AnimSettings>) => onChange({ ...value, ...p });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="space-y-4">
      <div>
        <p className="label mb-2">움직임 방식</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ANIM_OPTIONS.map((o) => (
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
