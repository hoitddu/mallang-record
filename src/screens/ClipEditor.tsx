import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimControls } from '../components/AnimControls';
import { ExportSheet } from '../components/ExportSheet';
import { Player } from '../components/Player';
import { Chips, ConfirmButton, Notice, Sheet, Slider, Toggle, TopBar } from '../components/ui';
import { clipItem, loadClipAudio, sceneFromClip, utteranceOf, type ClipAudio } from '../lib/clipScene';
import { deleteClip, formatDate, getClip, putClip } from '../lib/db';
import { prepareSnapshot, snapshotOf, type Prepared } from '../lib/images';
import { computeTrack } from '../lib/motion';
import { buildTimeline } from '../lib/timeline';
import type { Clip } from '../lib/types';
import { useApp } from '../store';
import { PictureGrid } from './Library';
import { downloadFile } from '../lib/save';
import { extFor } from '../lib/audio';

type Tab = 'anim' | 'caption' | 'deco' | 'trim' | 'pic';

const CAPTION_COLORS = ['#3A3350', '#E4574A', '#F2803A', '#5DA567', '#4A93C4', '#9365BE'];

export function ClipEditor({ clipId }: { clipId: string }) {
  const { back, toast } = useApp();
  const [clip, setClip] = useState<Clip | null>(null);
  const [audio, setAudio] = useState<ClipAudio | null>(null);
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('anim');
  const [picOpen, setPicOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(true);
  const saveT = useRef<number>();

  useEffect(() => {
    (async () => {
      const c = await getClip(clipId);
      if (!c) return setErr('기록을 찾을 수 없어요');
      setClip(c);
      setUrl(URL.createObjectURL(c.audio));
      try {
        setAudio(await loadClipAudio(c));
      } catch {
        setErr('이 기록의 소리를 이 브라우저에서 열 수 없어요. 녹음했던 브라우저에서 열어 주세요.');
      }
    })();
  }, [clipId]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    if (clip) prepareSnapshot(clip.pictureSnapshot, clip.id).then(setPrep).catch(() => {});
  }, [clip?.pictureSnapshot.image, clip?.pictureSnapshot.builtinKey]);

  const update = (p: Partial<Clip>) => {
    setClip((c) => {
      if (!c) return c;
      const n = { ...c, ...p };
      setSaved(false);
      clearTimeout(saveT.current);
      saveT.current = window.setTimeout(async () => {
        await putClip(n);
        setSaved(true);
      }, 400);
      return n;
    });
  };
  useEffect(() => () => clearTimeout(saveT.current), []);

  const track = useMemo(
    () => (audio && clip ? computeTrack(audio.rms, { sensitivity: clip.anim.sensitivity, speed: clip.anim.speed }, audio.floor) : null),
    [audio, clip?.anim.sensitivity, clip?.anim.speed]
  );

  const timeline = useMemo(() => {
    if (!clip || !audio || !track) return null;
    const end = Math.min(clip.trimEnd || audio.buffer.duration, audio.buffer.duration);
    return buildTimeline([{ scene: sceneFromClip(clip, prep), track, buf: audio.buffer, trimStart: clip.trimStart, trimEnd: end }], 0, 0.8, 0);
  }, [clip, audio, track, prep]);

  if (err)
    return (
      <div className="page">
        <TopBar title="기록 편집" onBack={back} />
        <Notice tone="error" title={err} />
      </div>
    );
  if (!clip) return <div className="page"><TopBar title="기록 편집" onBack={back} /></div>;

  const dur = audio?.buffer.duration ?? clip.duration;
  const cap = clip.caption;

  return (
    <div className="page">
      <TopBar
        title={`"${clip.word}" 기록`}
        onBack={back}
        right={<span className="text-[13px] text-soft">{saved ? '저장됨' : '저장 중…'}</span>}
      />
      <div className="card mb-4 p-3">
        <label htmlFor="utterance" className="label mb-1 block">
          아이가 한 말
        </label>
        <input
          id="utterance"
          className="field font-display !text-[20px]"
          value={clip.utterance ?? utteranceOf(clip)}
          maxLength={40}
          placeholder={`예: 물꼬기쩜뿌 (그림: ${clip.pictureSnapshot.name})`}
          onChange={(e) => update({ utterance: e.target.value })}
        />
        <p className="hint mt-1">들린 그대로 적어 주세요. 여러 단어 잇기 그림책에 이 말이 나와요. 그림 이름("{clip.pictureSnapshot.name}")과는 따로 저장돼요.</p>
      </div>
      <Player timeline={timeline} url={url} audioStart={clip.trimStart} audioEnd={Math.min(clip.trimEnd || dur, dur)} maxHeight="52dvh" />

      <div className="mt-4 flex gap-2">
        <button className="btn-main flex-1" onClick={() => setExportOpen(true)} disabled={!timeline}>
          영상 만들기
        </button>
      </div>

      <div className="mt-5 -mx-1 overflow-x-auto px-1 pb-1">
        <Chips
          value={tab}
          onChange={setTab}
          wrap={false}
          options={[
            { v: 'anim', label: '움직임' },
            { v: 'caption', label: '자막' },
            { v: 'deco', label: '제목·날짜' },
            { v: 'trim', label: '길이' },
            { v: 'pic', label: '그림' },
          ]}
        />
      </div>

      <div className="card mt-3 p-4">
        {tab === 'anim' && <AnimControls idPrefix="clip" value={clip.anim} onChange={(anim) => update({ anim })} hasMouth={!!clip.pictureSnapshot.builtinKey && !clip.pictureSnapshot.image} />}

        {tab === 'caption' && (
          <div className="space-y-4">
            <Toggle id="cap-show" label="자막 보이기" checked={cap.show} onChange={(v) => update({ caption: { ...cap, show: v } })} />
            <div>
              <label htmlFor="cap-text" className="label mb-1 block">
                자막 글자
              </label>
              <input id="cap-text" className="field" value={cap.text} maxLength={24} onChange={(e) => update({ caption: { ...cap, text: e.target.value } })} />
              <p className="hint mt-1">아이 발음 그대로("사꽈!")나 바른 말로 마음대로 적어 주세요.</p>
            </div>
            <div>
              <p className="label mb-2">나타나는 때</p>
              <Chips
                value={cap.mode}
                onChange={(v) => update({ caption: { ...cap, mode: v } })}
                options={[
                  { v: 'voice', label: '목소리가 나오면 짠' },
                  { v: 'always', label: '처음부터' },
                ]}
              />
            </div>
            <div>
              <p className="label mb-2">글씨체</p>
              <Chips
                value={cap.font}
                onChange={(v) => update({ caption: { ...cap, font: v } })}
                options={[
                  { v: 'hand', label: '손글씨' },
                  { v: 'gothic', label: '깔끔한 고딕' },
                ]}
              />
            </div>
            <Slider id="cap-size" label="글씨 크기" value={cap.size} min={0.6} max={1.6} onChange={(v) => update({ caption: { ...cap, size: v } })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider id="cap-pos" label="위치" value={cap.position} min={0} max={1} onChange={(v) => update({ caption: { ...cap, position: v } })} format={(v) => (v < 0.34 ? '그림 가까이' : v < 0.67 ? '가운데' : '아래쪽')} />
            <div>
              <p className="label mb-2">글씨 색</p>
              <div className="flex flex-wrap gap-3">
                {CAPTION_COLORS.map((c) => (
                  <button
                    key={c}
                    className="h-9 w-9 rounded-full shadow-paper"
                    style={{ background: c, outline: cap.color === c ? '3px solid var(--ink)' : 'none', outlineOffset: 3 }}
                    aria-label={`글씨 색 ${c}`}
                    aria-pressed={cap.color === c}
                    onClick={() => update({ caption: { ...cap, color: c } })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'deco' && (
          <div className="space-y-4">
            <Toggle id="deco-title" label="제목 보이기" checked={clip.showTitle} onChange={(v) => update({ showTitle: v })} />
            <input id="deco-title-text" className="field" value={clip.title} maxLength={24} placeholder="예: 하준이의 첫 말" onChange={(e) => update({ title: e.target.value, showTitle: true })} />
            <Toggle id="deco-date" label={`날짜 보이기 (${formatDate(clip.createdAt)})`} checked={clip.showDate} onChange={(v) => update({ showDate: v })} />
            <Toggle id="deco-months" label="개월 수 보이기" checked={clip.showMonths} onChange={(v) => update({ showMonths: v })} />
            <div className="flex items-center gap-3">
              <label htmlFor="deco-months-n" className="label">
                개월 수
              </label>
              <input
                id="deco-months-n"
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                className="field !w-24"
                value={clip.months ?? ''}
                onChange={(e) => update({ months: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0), showMonths: true })}
              />
              <span className="hint">설정에서 생일을 넣으면 자동으로 채워져요</span>
            </div>
          </div>
        )}

        {tab === 'trim' && audio && (
          <div className="space-y-3">
            <Wave rms={audio.rms} dur={dur} start={clip.trimStart} end={Math.min(clip.trimEnd || dur, dur)} />
            <Slider
              id="trim-s"
              label="시작"
              value={clip.trimStart}
              min={0}
              max={Math.max(0, dur - 0.2)}
              step={0.05}
              onChange={(v) => update({ trimStart: Math.min(v, (clip.trimEnd || dur) - 0.2) })}
              format={(v) => `${v.toFixed(2)}초`}
            />
            <Slider
              id="trim-e"
              label="끝"
              value={Math.min(clip.trimEnd || dur, dur)}
              min={0.2}
              max={dur}
              step={0.05}
              onChange={(v) => update({ trimEnd: Math.max(v, clip.trimStart + 0.2) })}
              format={(v) => `${v.toFixed(2)}초`}
            />
            <p className="hint">원본 녹음은 그대로 두고, 영상에 쓸 부분만 골라요.</p>
          </div>
        )}

        {tab === 'pic' && (
          <div className="space-y-3">
            <p className="text-[15px]">
              지금 그림: <b className="font-display">{clip.pictureSnapshot.name}</b>
            </p>
            <button className="btn-sky" onClick={() => setPicOpen(true)}>
              그림 바꾸기
            </button>
            <p className="hint">목소리는 그대로 두고 그림만 바꿔요.</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button className="btn-ghost text-ink" onClick={() => downloadFile(clip.audio, `${clip.word}-${formatDate(clip.createdAt).replace(/[. ]+/g, '')}.${extFor(clip.mime)}`)}>
          원본 목소리 파일 받기
        </button>
        <span className="flex-1" />
        <ConfirmButton
          label="기록 삭제"
          confirmLabel="한 번 더 누르면 삭제돼요"
          onConfirm={async () => {
            await deleteClip(clip.id);
            toast('기록을 지웠어요');
            back();
          }}
        />
      </div>

      <Sheet open={picOpen} onClose={() => setPicOpen(false)} title="그림 바꾸기">
        <div className="pb-6">
          <PictureGrid
            onPick={(p) => {
              const textWasWord = clip.caption.text === clip.word;
              update({
                pictureId: p.id,
                pictureSnapshot: snapshotOf(p),
                word: p.name,
                anim: { ...p.anim },
                caption: textWasWord ? { ...clip.caption, text: p.name } : clip.caption,
              });
              setPicOpen(false);
            }}
          />
        </div>
      </Sheet>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        fileBase={`말랑기록-${clip.word}-${formatDate(clip.createdAt).replace(/[. ]+/g, '')}`}
        build={async () => buildTimeline([await clipItem(clip)])}
      />
    </div>
  );
}

function Wave({ rms, dur, start, end }: { rms: Float32Array; dur: number; start: number; end: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const w = (c.width = c.clientWidth * 2);
    const h = (c.height = 120);
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const max = Math.max(1e-4, ...Array.from(rms));
    const bars = Math.min(160, rms.length);
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const t = (i / bars) * dur;
      const v = rms[Math.floor((i / bars) * rms.length)] / max;
      const bh = Math.max(3, Math.sqrt(v) * h * 0.9);
      g.fillStyle = t >= start && t <= end ? '#F2803A' : '#EADFCB';
      g.fillRect(i * bw + 1, (h - bh) / 2, bw - 2, bh);
    }
  }, [rms, dur, start, end]);
  return <canvas ref={ref} className="h-[60px] w-full" aria-label="목소리 모양" />;
}
