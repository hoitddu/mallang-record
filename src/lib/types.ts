export type Category = 'fruit' | 'animal' | 'thing' | 'custom';

/** 기본 움직임 7종 + 캐릭터 움직임 (그림의 성격에 맞춘 움직임) */
export type AnimType =
  | 'squish' | 'hop' | 'float' | 'fly' | 'swim' | 'cozy' | 'roll'
  | 'bounce' | 'jelly' | 'heavy' | 'sway' | 'wobbly' | 'sprout' | 'popcorn' | 'heartbeat' | 'tumble'
  | 'bunny' | 'waddle' | 'stretch' | 'wag' | 'nod' | 'scurry' | 'leap' | 'rock' | 'hang';

export interface AnimSettings {
  type: AnimType;
  /** 움직임 강도 0.3 ~ 2 (기본 1) */
  intensity: number;
  /** 움직임 속도 0.5 ~ 2 (기본 1) */
  speed: number;
  /** 목소리 반응 민감도 0 ~ 1 (기본 0.5) */
  sensitivity: number;
  /** 효과선(바람선·물결·소리 파동) */
  effects: boolean;
  /** 반짝임(별·하트·물방울) */
  sparkles: boolean;
  /** 기본 그림의 입이 목소리에 맞춰 열리기 (false면 미소로 고정). 없으면 켜짐 */
  mouth?: boolean;
}

export interface ImgTransform {
  /** 1 = 그림 상자에 꼭 맞게 */
  scale: number;
  /** 그림 상자 한 변 대비 이동 비율 (-0.5 ~ 0.5) */
  x: number;
  y: number;
}

export interface Picture {
  id: string;
  name: string;
  category: Category;
  /** 기본 그림이면 원본 그림 키 */
  builtinKey?: string;
  /** 사용자가 올린 그림 (배경 제거 결과가 있으면 그 결과) */
  image?: Blob;
  /** 사용자가 올린 원본 (배경 제거 전) */
  originalImage?: Blob;
  anim: AnimSettings;
  transform: ImgTransform;
  hidden?: boolean;
  /** 기본 움직임 기준표 버전 (캐릭터 움직임 도입 시 2) */
  animRev?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CaptionSettings {
  show: boolean;
  text: string;
  /** voice: 목소리가 나오면 나타남 / always: 처음부터 */
  mode: 'voice' | 'always';
  /** 0.6 ~ 1.6 */
  size: number;
  /** 0(위쪽) ~ 1(아래쪽) */
  position: number;
  color: string;
  font: 'hand' | 'gothic';
}

export interface PictureSnapshot {
  name: string;
  builtinKey?: string;
  image?: Blob;
  transform: ImgTransform;
}

export interface Clip {
  id: string;
  pictureId: string;
  pictureSnapshot: PictureSnapshot;
  word: string;
  createdAt: number;
  audio: Blob;
  mime: string;
  duration: number;
  source: 'mic' | 'audio' | 'video';
  anim: AnimSettings;
  caption: CaptionSettings;
  title: string;
  showTitle: boolean;
  showDate: boolean;
  showMonths: boolean;
  months?: number;
  trimStart: number;
  trimEnd: number;
  /**
   * 아이가 실제로 한 말 (예: 그림은 '돌고래', 아이 말은 '물꼬기쩜뿌').
   * 그림책 잇기 영상의 자막으로 쓰여요. 옛 기록에는 없을 수 있어요(→ utteranceOf 참고).
   */
  utterance?: string;
  /**
   * 아이 눈·입 조각 (녹화할 때 카메라로 인식해 그림체로 바꾼 것). 원본 얼굴 영상은 저장하지 않아요.
   * 없으면(옛 기록·파일로 만든 기록) 그린 눈·입.
   */
  face?: FaceRecord;
}

/** 녹화 중 오려 둔 눈·입 조각 모음: 조각 그림판(sheets) 여러 장 + 장면마다 시각 */
export interface FaceRecord {
  v: 1;
  /** 실사 정도 0(그림에 가깝게) ~ 1 */
  level: number;
  /** 한 장면 칸 크기와 그림판 한 장의 칸 수 */
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  /** 장면마다 녹음 기준 시각(초) */
  times: number[];
  /** 장면마다 칸 번호 (얼굴을 못 찾은 장면은 -1) */
  cells: number[];
  /** 조각 그림판 (WebP 또는 PNG) */
  sheets: Blob[];
}

export interface Settings {
  childName: string;
  birthDate?: string;
  /** 여러 단어 잇기 그림책의 책 모양 (마지막에 고른 것) */
  bookLayout?: 'page' | 'spread' | 'vertical';
  /** 녹음할 때 카메라로 아이 눈·입도 함께 담기 (없으면 켜짐) */
  faceCam?: boolean;
}

export interface Draft {
  id: 'last';
  pictureId: string;
  audio: Blob;
  mime: string;
  source: Clip['source'];
  createdAt: number;
}
