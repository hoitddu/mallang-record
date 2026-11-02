/** 실행 환경 확인 + 마이크 오류를 쉬운 말로 바꾸기 */

export const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
export const inIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

/** 카카오톡·인스타그램 등 앱 안의 브라우저 */
export function inAppBrowser(): string | null {
  if (/KAKAOTALK/i.test(ua)) return '카카오톡';
  if (/Instagram/i.test(ua)) return '인스타그램';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return '페이스북';
  if (/NAVER\(inapp|NAVER/i.test(ua) && /inapp/i.test(ua)) return '네이버';
  if (/\bLine\//i.test(ua)) return '라인';
  if (/DaumApps|DaumDevice/i.test(ua)) return '다음';
  if (/Band\//i.test(ua)) return '밴드';
  return null;
}

export function micSupport(): { ok: boolean; reason?: string } {
  if (!window.isSecureContext) return { ok: false, reason: 'https' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'nomedia' };
  if (typeof MediaRecorder === 'undefined') return { ok: false, reason: 'norecorder' };
  return { ok: true };
}

export interface FriendlyError {
  title: string;
  detail: string;
}

export function micErrorMessage(e: any): FriendlyError {
  const name = e?.name || '';
  const app = inAppBrowser();
  if (inIframe && name !== 'NotFoundError' && name !== 'NotReadableError')
    return {
      title: '미리보기 화면에서는 마이크가 막혀 있어요',
      detail:
        '다른 화면 안에 들어 있는 미리보기에서는 브라우저가 마이크를 허락하지 않아요. 앱 주소를 Safari(또는 Chrome)에서 직접 열어 주세요. 지금은 아래 "음성·영상 파일 불러오기"로 바로 만들 수 있어요.',
    };
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    if (inIframe)
      return {
        title: '미리보기 화면에서는 마이크가 막혀 있어요',
        detail:
          '다른 화면 안에 들어 있는 미리보기에서는 브라우저가 마이크를 허락하지 않아요. 앱 주소를 Safari(또는 Chrome)에서 직접 열어 주세요. 지금은 아래 "음성·영상 파일 불러오기"로 바로 만들 수 있어요.',
      };
    if (app)
      return {
        title: `${app} 안의 브라우저에서는 마이크를 쓸 수 없어요`,
        detail: `오른쪽 아래(또는 위) 메뉴에서 "다른 브라우저로 열기" → Safari를 눌러 주세요.`,
      };
    return {
      title: '마이크 사용이 허락되지 않았어요',
      detail: isIOS
        ? 'iPhone 설정 → 앱 → Safari → 마이크를 "허용" 또는 "묻기"로 바꾼 뒤, 주소창의 "가가/aA" 버튼 → 웹사이트 설정 → 마이크 → 허용을 눌러 주세요. 그다음 이 페이지를 새로고침해 주세요.'
        : '주소창 왼쪽의 자물쇠(사이트 정보) 버튼 → 마이크 → 허용으로 바꾼 뒤 새로고침해 주세요.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return { title: '마이크를 찾을 수 없어요', detail: '이어폰 마이크를 뺐다가 다시 꽂거나, 기기에 마이크가 있는지 확인해 주세요.' };
  if (name === 'NotReadableError' || name === 'AbortError')
    return {
      title: '다른 앱이 마이크를 쓰고 있어요',
      detail: '통화 중이거나 다른 녹음 앱이 켜져 있으면 닫은 뒤 다시 눌러 주세요.',
    };
  if (e?.reason === 'https' || name === 'TypeError')
    return {
      title: '안전한 주소(https)에서만 녹음할 수 있어요',
      detail: '주소가 https:// 로 시작하는지 확인해 주세요. 지금은 "음성·영상 파일 불러오기"를 쓸 수 있어요.',
    };
  if (e?.reason === 'norecorder')
    return {
      title: '이 브라우저는 녹음을 지원하지 않아요',
      detail: 'iPhone은 iOS 14.3 이상 Safari, Android는 최신 Chrome에서 열어 주세요. 음성 파일 불러오기는 지금도 쓸 수 있어요.',
    };
  return { title: '마이크를 켜지 못했어요', detail: `잠시 후 다시 눌러 주세요. (${name || e?.message || '알 수 없는 오류'})` };
}
