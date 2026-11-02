import { useEffect, useRef, useState } from 'react';
import { detectVideoFormat, exportVideo, type ExportResult } from '../lib/exporter';
import { isIOS } from '../lib/env';
import { canShareFile, downloadFile, shareFile } from '../lib/save';
import type { Timeline } from '../lib/timeline';
import { useApp } from '../store';
import { Chips, Notice, Sheet } from './ui';

export function ExportSheet({ open, onClose, build, fileBase }: { open: boolean; onClose: () => void; build: () => Promise<Timeline>; fileBase: string }) {
  const { toast } = useApp();
  const [res, setRes] = useState<'1080' | '720'>('1080');
  const [state, setState] = useState<'ready' | 'working' | 'done' | 'error'>('ready');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const cancel = useRef({ cancelled: false });
  const fmt = detectVideoFormat();

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    if (!open) {
      cancel.current.cancelled = true;
      setState('ready');
      setResult(null);
      setProgress(0);
    }
  }, [open]);

  async function make() {
    setErr('');
    setState('working');
    setProgress(0);
    cancel.current = { cancelled: false };
    try {
      await (document as any).fonts?.ready;
      const tl = await build();
      const [W, H] = res === '1080' ? [1080, 1920] : [720, 1280];
      const r = await exportVideo({ timeline: tl, width: W, height: H, onProgress: setProgress, signal: cancel.current });
      setResult(r);
      setUrl(URL.createObjectURL(r.blob));
      setState('done');
    } catch (e: any) {
      if (e?.message === 'cancelled') {
        setState('ready');
        return;
      }
      setErr(e?.message || String(e));
      setState('error');
    }
  }

  const name = result ? `${fileBase}.${result.format.ext}` : '';
  const shareable = result ? canShareFile(result.blob, name) : false;

  return (
    <Sheet open={open} onClose={() => { cancel.current.cancelled = true; onClose(); }} title="영상 만들기">
      <div className="space-y-4 pb-4">
        {!fmt ? (
          <Notice tone="error" title="이 브라우저에서는 영상을 만들 수 없어요">
            iPhone은 iOS 14.5 이상 Safari, Android는 최신 Chrome에서 열어 주세요. 녹음과 기록 저장은 지금도 쓸 수 있어요.
          </Notice>
        ) : fmt.ext === 'mp4' ? (
          <p className="cut bg-leaf/10 px-4 py-3 text-[14px] text-ink">
            이 기기에서는 <b className="font-display">MP4</b>로 저장돼요. {isIOS ? '공유 → "동영상 저장"을 누르면 사진 앱에 들어가요.' : '대부분의 앱에서 바로 열려요.'}
          </p>
        ) : (
          <Notice tone="warn" title="이 브라우저는 WebM 형식으로만 저장할 수 있어요">
            WebM은 Android·PC에서는 잘 열리지만 iPhone 사진 앱에는 바로 들어가지 않을 수 있어요. iPhone에 저장하려면 iPhone Safari에서 만들어 주세요.
          </Notice>
        )}

        {fmt && state !== 'done' && (
          <>
            <div>
              <p className="label mb-2">화질</p>
              <Chips
                value={res}
                onChange={setRes}
                options={[
                  { v: '1080', label: '선명하게 1080×1920' },
                  { v: '720', label: '가볍게 720×1280' },
                ]}
              />
              <p className="hint mt-2">세로 9:16 영상이에요. 오래된 휴대폰에서 끊기면 "가볍게"를 골라 주세요.</p>
            </div>
            {state === 'working' ? (
              <div className="space-y-2">
                <div className="h-3 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-tangerine transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="hint text-center">소리와 함께 실시간으로 만들고 있어요 ({Math.round(progress * 100)}%). 화면을 켜 둔 채로 기다려 주세요.</p>
                <button className="btn-ghost mx-auto block" onClick={() => (cancel.current.cancelled = true)}>
                  그만 만들기
                </button>
              </div>
            ) : (
              <button className="btn-main w-full" onClick={make}>
                영상 만들기
              </button>
            )}
          </>
        )}

        {state === 'error' && (
          <Notice tone="error" title="영상을 만들지 못했어요">
            {err}
          </Notice>
        )}

        {state === 'done' && result && (
          <div className="space-y-3">
            <video src={url} controls playsInline className="mx-auto block max-h-[50dvh] cut-b bg-paper shadow-paper" />
            <p className="hint text-center">
              {result.format.label} · {(result.blob.size / 1024 / 1024).toFixed(1)}MB
            </p>
            <div className="flex flex-col gap-2">
              {shareable && (
                <button
                  className="btn-main"
                  onClick={async () => {
                    try {
                      const r = await shareFile(result.blob, name);
                      if (r === 'shared') toast('공유했어요');
                    } catch {
                      toast('공유하지 못했어요. "파일로 받기"를 눌러 주세요');
                    }
                  }}
                >
                  {isIOS ? '사진 앱에 저장 · 공유' : '공유하기'}
                </button>
              )}
              <button
                className={shareable ? 'btn-sheet' : 'btn-main'}
                onClick={async () => {
                  const r = await downloadFile(result.blob, name);
                  if (r === 'downloaded') toast('파일로 받았어요');
                }}
              >
                파일로 받기
              </button>
              <button className="btn-ghost" onClick={() => setState('ready')}>
                다시 만들기
              </button>
            </div>
          </div>
        )}
        <p className="hint">영상은 이 기기 안에서만 만들어져요. 목소리와 그림을 서버로 보내지 않아요.</p>
      </div>
    </Sheet>
  );
}
