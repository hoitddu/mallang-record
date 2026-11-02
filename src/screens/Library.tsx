import { useMemo, useRef, useState } from 'react';
import { CATEGORY_OPTIONS, IMAGE_ACCEPT, newPicture, PictureEditor } from '../components/PictureEditor';
import { Thumb } from '../components/Thumb';
import { Chips, Sheet, Toggle, TopBar } from '../components/ui';
import { defaultAnim, putPicture } from '../lib/db';
import { guessAnim } from '../lib/builtins';
import { normalizeUpload } from '../lib/images';
import type { Category, Picture } from '../lib/types';
import { useApp } from '../store';

type Tab = 'all' | 'basic' | 'mine';

export function PictureGrid({
  onPick,
  onEdit,
  showEditButtons,
  initialTab = 'all',
}: {
  onPick: (p: Picture) => void;
  onEdit?: (p: Picture) => void;
  showEditButtons?: boolean;
  initialTab?: Tab;
}) {
  const { pictures } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [cat, setCat] = useState<Category | 'all'>('all');
  const list = useMemo(
    () =>
      pictures.filter((p) => {
        if (p.hidden) return false;
        const mine = !!p.image || !p.builtinKey;
        if (tab === 'basic' && mine) return false;
        if (tab === 'mine' && !mine) return false;
        if (cat !== 'all' && p.category !== cat) return false;
        return true;
      }),
    [pictures, tab, cat]
  );
  return (
    <div className="space-y-3">
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { v: 'all', label: '전체' },
          { v: 'basic', label: '기본 그림' },
          { v: 'mine', label: '내 그림' },
        ]}
      />
      <Chips value={cat} onChange={setCat} wrap={false} options={[{ v: 'all' as const, label: '모든 분류' }, ...CATEGORY_OPTIONS]} />
      {list.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="font-display text-[17px]">{tab === 'mine' ? '아직 올린 그림이 없어요' : '그림이 없어요'}</p>
          <p className="hint mt-1">위의 "새 단어" 버튼으로 원하는 그림체의 그림을 올려 보세요.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {list.map((p, i) => (
            <li key={p.id} className="relative">
              <button
                className="card block w-full p-1.5 text-center transition-transform active:scale-[0.97]"
                style={{ transform: `rotate(${((i * 37) % 5) - 2}deg)` }}
                onClick={() => onPick(p)}
              >
                <Thumb src={p} className="cut bg-paper" />
                <span className="mt-1 block truncate px-1 pb-1 font-display text-[16px]">{p.name}</span>
                {(p.image || !p.builtinKey) && (
                  <span className="absolute left-1 top-1 cut bg-butter px-1.5 py-0.5 font-display text-[11px] text-ink">내 그림</span>
                )}
              </button>
              {showEditButtons && onEdit && (
                <button
                  className="absolute -right-1 -top-1 grid h-8 w-8 place-items-center rounded-full bg-ink text-white shadow-paper"
                  aria-label={`${p.name} 편집`}
                  onClick={() => onEdit(p)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Library({ mode }: { mode: 'pick' | 'manage' }) {
  const { back, go, pictures, reloadPictures, toast } = useApp();
  const [editing, setEditing] = useState<Picture | null | 'new'>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [replaceSame, setReplaceSame] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  async function onBulk(files: FileList | null) {
    if (!files?.length) return;
    let added = 0, replaced = 0, failed = 0;
    const arr = Array.from(files);
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      setBusy(`${i + 1} / ${arr.length} 올리는 중…`);
      try {
        const blob = await normalizeUpload(f);
        const name = f.name.replace(/\.[^.]+$/, '').trim().slice(0, 20) || `그림 ${i + 1}`;
        const same = replaceSame ? pictures.find((p) => p.builtinKey && p.name === name) : undefined;
        if (same) {
          await putPicture({ ...same, image: blob, originalImage: blob, transform: { scale: 1, x: 0, y: 0 }, hidden: false });
          replaced++;
        } else {
          const p = newPicture(name);
          p.image = blob;
          p.originalImage = blob;
          p.anim = defaultAnim(guessAnim(name));
          p.createdAt = Date.now() + i;
          await putPicture(p);
          added++;
        }
      } catch {
        failed++;
      }
    }
    await reloadPictures();
    setBusy(null);
    setBulkOpen(false);
    if (bulkRef.current) bulkRef.current.value = '';
    toast([added && `${added}개 추가`, replaced && `${replaced}개 교체`, failed && `${failed}개는 열 수 없었어요`].filter(Boolean).join(', ') || '바뀐 그림이 없어요');
  }

  return (
    <div className="page">
      <TopBar title={mode === 'pick' ? '어떤 단어를 기록할까요?' : '내 그림 라이브러리'} onBack={back} />
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-main !py-2.5 text-[15px]" onClick={() => setEditing('new')}>
          + 새 단어
        </button>
        <button className="btn-sheet !py-2.5 text-[15px]" onClick={() => setBulkOpen(true)}>
          여러 장 한꺼번에 올리기
        </button>
      </div>
      {mode === 'pick' && <p className="hint -mt-2 mb-3">그림을 누르면 바로 녹음 화면으로 가요. 연필을 누르면 그림을 바꾸거나 움직임을 고를 수 있어요.</p>}
      <PictureGrid
        initialTab={mode === 'manage' ? 'all' : 'all'}
        showEditButtons={mode === 'pick'}
        onEdit={(p) => setEditing(p)}
        onPick={(p) => (mode === 'pick' ? go({ name: 'record', pictureId: p.id }) : setEditing(p))}
      />

      {editing && <PictureEditor picture={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <Sheet open={bulkOpen} onClose={() => !busy && setBulkOpen(false)} title="여러 장 한꺼번에 올리기">
        <div className="space-y-4 pb-4">
          <p className="text-[15px] leading-relaxed">
            파일 이름이 단어 이름이 돼요. 예를 들어 <b className="font-display">사과.png</b>, <b className="font-display">비행기.webp</b>를 올리면 "사과", "비행기"로 저장돼요. 이름은 나중에 바꿀 수 있어요.
          </p>
          <Toggle id="bulk-replace" label="이름이 같은 기본 그림은 내 그림으로 바꾸기" hint="기본 그림은 언제든 되돌릴 수 있어요" checked={replaceSame} onChange={setReplaceSame} />
          <input ref={bulkRef} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => onBulk(e.target.files)} />
          <button className="btn-main w-full" disabled={!!busy} onClick={() => bulkRef.current?.click()}>
            {busy ?? '그림 고르기'}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
