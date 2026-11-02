import { useEffect, useMemo, useState } from 'react';
import { Stage } from '../components/Stage';
import { Notice } from '../components/ui';
import { clearDraft, getDraft, listClips } from '../lib/db';
import { inAppBrowser, inIframe, isIOS } from '../lib/env';
import { prepare, type Prepared } from '../lib/images';
import { computeTrack, demoRms, estimateFloor, frameAt } from '../lib/motion';
import { drawBackground, drawIllustration } from '../lib/render';
import type { Draft } from '../lib/types';
import { useApp } from '../store';

const HERO = ['apple', 'airplane', 'rabbit', 'balloon'];

export function Home() {
  const { go, pictures, settings } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [hero, setHero] = useState<{ prep: Prepared; anim: any; tf: any }[]>([]);

  useEffect(() => {
    getDraft().then((d) => setDraft(d ?? null));
    listClips().then((c) => setCount(c.length));
  }, []);

  useEffect(() => {
    const ps = HERO.map((k) => pictures.find((p) => p.builtinKey === k && !p.hidden)).filter(Boolean) as typeof pictures;
    Promise.all(ps.map(async (p) => ({ prep: await prepare(p), anim: p.anim, tf: p.transform }))).then(setHero).catch(() => {});
  }, [pictures]);

  const demo = useMemo(() => {
    const r = demoRms(4.4);
    return computeTrack(r, { sensitivity: 0.5, speed: 1 }, estimateFloor(r));
  }, []);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
    drawBackground(ctx, W, H);
    if (!hero.length) return;
    const loop = demo.duration + 0.6;
    const i = Math.floor(now / loop) % hero.length;
    const t = now % loop;
    const h = hero[i];
    const m = frameAt(demo, t);
    m.t = now;
    drawIllustration(ctx, H * 0.62, W / 2, H * 0.52, h.prep, h.tf, h.anim, m);
  };

  const standalone = (navigator as any).standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  const app = inAppBrowser();

  return (
    <div className="page">
      <header className="pt-6 text-center">
        <h1 className="font-display text-[44px] leading-none tracking-tight text-ink">
          말랑<span className="text-tangerine">기록</span>
        </h1>
        <p className="mt-2 text-[16px] text-soft">우리 아이 목소리로 움직이는 그림책</p>
      </header>

      <div className="mt-5">
        <Stage draw={draw} aspect={4 / 3} maxHeight="34dvh" />
        <p className="hint mt-2 text-center">예시 움직임이에요. 아이가 말하면 그림이 이렇게 반응해요.</p>
        <div className="mt-1 text-center">
          <button className="btn-ghost text-ink underline decoration-line decoration-2 underline-offset-4" onClick={() => go({ name: 'motions' })}>
            모든 그림 움직임 한눈에 보기 →
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <button className="btn-main w-full !py-5 text-[20px]" onClick={() => go({ name: 'pick' })}>
          새 단어 기록하기
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-sheet whitespace-nowrap !px-2 !py-4 text-[16px]" onClick={() => go({ name: 'library' })}>
            내 그림 라이브러리
          </button>
          <button className="btn-sheet whitespace-nowrap !px-2 !py-4 text-[16px]" onClick={() => go({ name: 'archive' })}>
            이전 기록 보기{count ? ` (${count})` : ''}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {draft && (
          <Notice
            tone="warn"
            title="저장하지 않은 녹음이 있어요"
            action={
              <>
                <button className="btn-main !py-2.5 text-[15px]" onClick={() => go({ name: 'record', pictureId: draft.pictureId, fromDraft: true })}>
                  이어서 보기
                </button>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    await clearDraft();
                    setDraft(null);
                  }}
                >
                  버리기
                </button>
              </>
            }
          >
            {new Date(draft.createdAt).toLocaleString('ko-KR')}에 녹음한 목소리가 남아 있어요.
          </Notice>
        )}
        {app && (
          <Notice tone="warn" title={`${app} 앱 안에서 열었어요`}>
            앱 안의 브라우저에서는 마이크와 저장이 막힐 수 있어요. 메뉴에서 "다른 브라우저로 열기"(Safari·Chrome)를 눌러 주세요.
          </Notice>
        )}
        {inIframe && (
          <Notice tone="info" title="미리보기 화면이에요">
            이 화면에서는 브라우저가 마이크를 막을 수 있어요. 음성·영상 파일 불러오기는 바로 쓸 수 있고, 직접 녹음은 앱 주소를 Safari·Chrome에서 열어 주세요.
          </Notice>
        )}
        {isIOS && !standalone && !inIframe && !app && (
          <Notice tone="info" title="홈 화면에 추가해 두세요">
            Safari 아래쪽 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 열리고, 오래 안 써도 기록이 지워질 걱정이 줄어요.
          </Notice>
        )}
      </div>

      <footer className="mt-8 flex items-center justify-between text-[13px] text-soft">
        <span>{settings.childName ? `${settings.childName}의 그림책` : '모든 기록은 이 기기에만 저장돼요'}</span>
        <button className="btn-ghost text-ink underline decoration-line decoration-2 underline-offset-4" onClick={() => go({ name: 'settings' })}>
          설정·백업
        </button>
      </footer>
    </div>
  );
}
