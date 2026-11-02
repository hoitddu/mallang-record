import { useEffect, useRef, useState, type ReactNode } from 'react';

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-20 -mx-4 mb-3 flex items-center gap-2 bg-paper/95 px-4 py-2 backdrop-blur">
      {onBack ? (
        <button className="btn-ghost -ml-2 text-ink" onClick={onBack} aria-label="뒤로">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="min-w-0 flex-1 truncate font-display text-[21px]">{title}</h1>
      {right}
    </div>
  );
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  format,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label htmlFor={id} className="block">
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="text-[13px] tabular-nums text-soft">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Toggle({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="label block">{label}</span>
        {hint && <span className="hint block">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-8 w-14 rounded-full bg-line transition-colors peer-checked:bg-leaf peer-focus-visible:ring-2 peer-focus-visible:ring-sky" />
        <span className="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-6" />
      </span>
    </label>
  );
}

export function Chips<T extends string>({ value, options, onChange, wrap = true }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; wrap?: boolean }) {
  return (
    <div className={`flex gap-2 ${wrap ? 'flex-wrap' : 'overflow-x-auto pb-1'}`}>
      {options.map((o) => (
        <button key={o.v} className="chip" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 아래에서 올라오는 종이 시트 */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`pop-in max-h-[92dvh] w-full ${wide ? 'max-w-[640px]' : 'max-w-[560px]'} overflow-y-auto rounded-t-[28px] bg-paper shadow-lift`}
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between bg-paper/95 py-3 backdrop-blur"
          style={{ paddingLeft: 'max(18px, env(safe-area-inset-left, 0px))', paddingRight: 'max(18px, env(safe-area-inset-right, 0px))' }}
        >
          <h2 className="font-display text-[20px]">{title}</h2>
          <button className="btn-ghost -mr-2" onClick={onClose} aria-label="닫기">
            닫기
          </button>
        </div>
        <div style={{ paddingLeft: 'max(18px, env(safe-area-inset-left, 0px))', paddingRight: 'max(18px, env(safe-area-inset-right, 0px))' }}>{children}</div>
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'error'; title: string; children?: ReactNode; action?: ReactNode }) {
  const bar = tone === 'error' ? 'bg-berry' : tone === 'warn' ? 'bg-butter' : 'bg-sky';
  return (
    <div className="card relative overflow-hidden p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${bar}`} />
      <p className="font-display text-[16px]">{title}</p>
      {children && <div className="mt-1 text-[14px] leading-relaxed text-soft">{children}</div>}
      {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** 브라우저 confirm 대신 쓰는 두 번 누르기 확인 버튼 */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn-ghost text-berry' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  const t = useRef<number>();
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      className={className + (armed ? ' !bg-berry !text-white' : '')}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          t.current = window.setTimeout(() => setArmed(false), 3500);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center" style={{ bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="pop-in cut bg-ink px-5 py-3 font-display text-[15px] text-white shadow-lift">{text}</div>
    </div>
  );
}

export function useToast() {
  const [text, setText] = useState<string | null>(null);
  const t = useRef<number>();
  const show = (s: string) => {
    setText(s);
    clearTimeout(t.current);
    t.current = window.setTimeout(() => setText(null), 2600);
  };
  return { text, show };
}
