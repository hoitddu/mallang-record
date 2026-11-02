import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toast, useToast } from './components/ui';
import { ensureSeeded, getSettings, listPictures, saveSettings } from './lib/db';
import type { Picture, Settings } from './lib/types';
import { Ctx, type Route } from './store';
import { Archive } from './screens/Archive';
import { ClipEditor } from './screens/ClipEditor';
import { Compose } from './screens/Compose';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { Recorder } from './screens/Recorder';
import { SettingsScreen } from './screens/Settings';

export default function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [settings, setSettingsState] = useState<Settings>({ childName: '' });
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const { text, show } = useToast();

  const reloadPictures = useCallback(async () => setPictures(await listPictures()), []);

  useEffect(() => {
    (async () => {
      try {
        await ensureSeeded();
        await reloadPictures();
        setSettingsState(await getSettings());
        // 브라우저가 저장 공간을 임의로 비우지 않도록 요청
        navigator.storage?.persist?.().catch(() => {});
        setReady(true);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
    // 그림책 글꼴 미리 불러오기 (캔버스 자막용)
    (document as any).fonts?.load?.('700 40px Gaegu', '사과')?.catch?.(() => {});
    (document as any).fonts?.load?.('800 40px "Nanum Gothic"', '사과')?.catch?.(() => {});
    (document as any).fonts?.load?.('40px Jua', '사과')?.catch?.(() => {});
  }, [reloadPictures]);

  // 휴대폰 "뒤로" 버튼과 연결
  useEffect(() => {
    const onPop = () => {
      if (stackRef.current.length > 1) setStack((s) => s.slice(0, -1));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const ctx = useMemo(
    () => ({
      pictures,
      reloadPictures,
      settings,
      setSettings: async (s: Settings) => {
        setSettingsState(s);
        await saveSettings(s);
      },
      go: (r: Route) => {
        try {
          history.pushState({ d: stackRef.current.length }, '');
        } catch {}
        setStack((s) => [...s, r]);
        window.scrollTo(0, 0);
      },
      replace: (r: Route) => {
        setStack((s) => [...s.slice(0, -1), r]);
        window.scrollTo(0, 0);
      },
      back: () => {
        if (stackRef.current.length > 1) {
          try {
            history.back();
          } catch {
            setStack((s) => s.slice(0, -1));
          }
        }
      },
      toast: show,
    }),
    [pictures, reloadPictures, settings, show]
  );

  if (err)
    return (
      <div className="page">
        <h1 className="mt-10 font-display text-2xl">저장 공간을 열 수 없어요</h1>
        <p className="mt-2 text-soft">
          개인정보 보호(비공개) 모드에서는 기록을 저장할 수 없어요. 일반 창에서 열어 주세요. ({err})
        </p>
      </div>
    );
  if (!ready)
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <p className="font-display text-xl text-soft">그림책을 펼치는 중…</p>
      </div>
    );

  const r = stack[stack.length - 1];
  return (
    <Ctx.Provider value={ctx}>
      {r.name === 'home' && <Home />}
      {r.name === 'pick' && <Library mode="pick" />}
      {r.name === 'library' && <Library mode="manage" />}
      {r.name === 'record' && <Recorder key={r.pictureId + (r.fromDraft ? 'd' : '')} pictureId={r.pictureId} fromDraft={r.fromDraft} />}
      {r.name === 'clip' && <ClipEditor key={r.clipId} clipId={r.clipId} />}
      {r.name === 'archive' && <Archive />}
      {r.name === 'compose' && <Compose clipIds={r.clipIds} />}
      {r.name === 'settings' && <SettingsScreen />}
      <Toast text={text} />
    </Ctx.Provider>
  );
}
