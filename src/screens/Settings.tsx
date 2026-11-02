import { useEffect, useRef, useState } from 'react';
import { ConfirmButton, TopBar } from '../components/ui';
import { makeBackup, restoreBackup } from '../lib/backup';
import { ensureSeeded, formatDate, restoreHiddenBuiltins, wipeAll } from '../lib/db';
import { downloadFile } from '../lib/save';
import { useApp } from '../store';

export function SettingsScreen() {
  const { back, settings, setSettings, reloadPictures, toast } = useApp();
  const [name, setName] = useState(settings.childName);
  const [birth, setBirth] = useState(settings.birthDate ?? '');
  const [usage, setUsage] = useState<string>('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)}MB 사용 중`)).catch(() => {});
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);

  return (
    <div className="page">
      <TopBar title="설정·백업" onBack={back} />
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-[18px]">우리 아이</h2>
        <label htmlFor="set-name" className="label block">
          이름 (영상 제목에 쓰여요)
        </label>
        <input id="set-name" className="field" value={name} maxLength={12} placeholder="예: 하준" onChange={(e) => setName(e.target.value)} />
        <label htmlFor="set-birth" className="label block">
          생일 (개월 수 자동 계산)
        </label>
        <input id="set-birth" type="date" className="field" value={birth} onChange={(e) => setBirth(e.target.value)} />
        <button
          className="btn-main"
          onClick={async () => {
            await setSettings({ childName: name.trim(), birthDate: birth || undefined });
            toast('저장했어요');
          }}
        >
          저장
        </button>
        <p className="hint">이름과 생일도 이 기기 안에만 저장돼요. 회원가입이 필요 없어요.</p>
      </section>

      <section className="card mt-4 space-y-3 p-4">
        <h2 className="font-display text-[18px]">백업</h2>
        <p className="text-[14px] leading-relaxed text-soft">
          기록은 이 기기의 브라우저 안에만 있어요. 휴대폰을 바꾸거나 브라우저 데이터를 지우기 전에 백업 파일을 받아 두세요. {usage}
          {persisted === false && ' · 브라우저가 공간이 부족할 때 지울 수 있는 상태예요. 홈 화면에 추가하면 더 안전해요.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-sky !py-2.5 text-[15px]"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const b = await makeBackup();
                await downloadFile(b, `말랑기록-백업-${formatDate(Date.now()).replace(/[. ]+/g, '')}.json`);
              } finally {
                setBusy(false);
              }
            }}
          >
            백업 파일 받기
          </button>
          <button className="btn-sheet !py-2.5 text-[15px]" disabled={busy} onClick={() => fileRef.current?.click()}>
            백업 불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                const r = await restoreBackup(f);
                await reloadPictures();
                toast(`그림 ${r.pictures}개, 기록 ${r.clips}개를 불러왔어요`);
              } catch (err: any) {
                toast(err.message || '불러오지 못했어요');
              } finally {
                setBusy(false);
                e.target.value = '';
              }
            }}
          />
        </div>
      </section>

      <section className="card mt-4 space-y-3 p-4">
        <h2 className="font-display text-[18px]">그림 목록</h2>
        <button
          className="btn-sheet !py-2.5 text-[15px]"
          onClick={async () => {
            await restoreHiddenBuiltins();
            await reloadPictures();
            toast('숨긴 기본 그림을 다시 꺼냈어요');
          }}
        >
          숨긴 기본 그림 다시 보이기
        </button>
      </section>

      <section className="card mt-4 space-y-3 p-4">
        <h2 className="font-display text-[18px]">개인정보</h2>
        <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-soft">
          <li>녹음, 올린 그림, 영상 만들기는 모두 이 기기 안에서 처리돼요.</li>
          <li>목소리·영상·그림을 서버로 보내지 않아요.</li>
          <li>영상을 고르면 소리만 꺼내 쓰고, 화면(아이 얼굴)은 저장하지 않아요.</li>
        </ul>
        <ConfirmButton
          label="이 기기의 말랑기록 데이터 모두 지우기"
          confirmLabel="정말 모두 지울까요? 한 번 더 누르기"
          className="btn-sheet !py-2.5 text-[15px] text-berry"
          onConfirm={async () => {
            await wipeAll();
            await ensureSeeded();
            await reloadPictures();
            await setSettings({ childName: '' });
            setName('');
            setBirth('');
            toast('모든 기록과 그림을 지웠어요');
          }}
        />
      </section>
    </div>
  );
}
