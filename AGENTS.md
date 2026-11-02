# AGENTS.md — 말랑기록 작업 규칙

이 파일은 이 프로젝트에서 일하는 **모든 AI 에이전트(Codex, Claude 등)의 공통 규칙**입니다.
Codex는 이 파일을 바로 읽고, Claude는 `CLAUDE.md`를 거쳐 이 파일을 읽습니다. 규칙을 바꿀 때는 **이 파일만** 고치세요.

## 0. 사용자에 대해

- 사용자는 **비개발자**이고 바이브코딩으로 작업합니다.
- 설명은 **쉬운 한국어**로, 무엇이 바뀌었고 화면에서 어떻게 확인하는지 위주로 짧게 해 주세요. 전문 용어는 꼭 필요할 때만 쓰고 풀어서 설명하세요.
- 사용자가 직접 해야 하는 일(로그인, 결제, 권한 허용 등)은 번호를 매겨 단계별로 안내하세요.

## 1. 프로젝트 한눈에

- **말랑기록**: 아이가 말한 단어를, 그림책 그림이 목소리에 맞춰 움직이는 세로 영상으로 남기는 모바일 웹앱(PWA)입니다.
- 기술: React 18 + TypeScript + Vite + Tailwind CSS, 저장은 IndexedDB(`idb`).
- 자세한 기능·구조 설명은 `README.md`를 보세요 (움직임 방식, 음성 분석 방식, 폴더 구조, 영상 형식).
- 운영 주소: **https://mallang-record.vercel.app**
- GitHub: https://github.com/hoitddu/mallang-record (`main` 브랜치)

## 2. 꼭 지켜야 하는 원칙 (앱의 약속)

- **아이 목소리·그림·기록은 기기 밖으로 보내지 않습니다.** 서버로 업로드하는 기능을 사용자 동의 없이 추가하지 마세요.
- **진짜 사람 얼굴(입·눈) 사진을 합성하지 않습니다.** 올린 그림은 다시 그리지 않고 늘이기·기울이기·이동만 합니다.
- 회원가입·로그인 없이 쓰는 앱입니다.
- API 키·비밀번호를 코드나 저장소에 넣지 마세요. 꼭 필요하면 Vercel 환경 변수를 쓰고 사용자에게 먼저 물어보세요.

## 3. 명령어

```bash
npm install        # 처음 한 번 (node_modules가 없을 때)
npm run dev        # 개발 서버 http://localhost:5173 (Windows에서는 start-dev.bat 더블클릭)
npm run build      # 타입 검사 + 배포용 빌드 → 올리기 전에 반드시 통과해야 함
```

- 휴대폰 마이크는 **https에서만** 동작합니다. 개발 서버(http://192.168...)로는 마이크 테스트가 안 되니, 마이크 관련 변경은 배포 후 운영 주소로 확인하세요.

## 4. 여러 에이전트가 함께 일하는 방법

**GitHub의 `main`이 유일한 기준입니다.** 컴퓨터 폴더(`C:\Users\samsung-user\mallang-record`)도 GitHub와 연결된 git 폴더입니다.

1. **시작 전에** `git pull`로 최신 코드를 받으세요. 그리고 `작업기록.md`의 맨 위 기록을 읽고 이어서 작업하세요.
2. **한 번에 한 에이전트만** 코드를 고칩니다. 다른 에이전트가 작업 중이면(올리지 않은 변경이 있으면) 그 파일을 덮어쓰지 말고 사용자에게 알리세요.
3. **끝나면** 아래 순서를 지키세요.
   1. `npm run build` 통과 확인
   2. `작업기록.md` **맨 위에** 기록 추가 (형식은 그 파일 안내 참고)
   3. 커밋 (메시지는 한국어로, 첫 줄에 무엇을 했는지, 다음 줄에 이유)
   4. `git push` → Vercel이 1분쯤 뒤 운영 주소에 자동 배포
4. 크거나 실험적인 변경은 새 브랜치에서 작업하면 Vercel이 **미리보기 주소**를 따로 만들어 줍니다. 사용자가 휴대폰으로 확인한 뒤 `main`에 합치세요.
5. 커밋하지 말 것: `node_modules/`, `dist/`, `dist-single/`, `*.zip`, `*.tsbuildinfo` (`.gitignore`에 있음)

## 5. 코드 작성 규칙

- **주석과 화면 문구는 한국어**로 씁니다. 화면 문구는 부모가 읽기 쉬운 부드러운 말투(~해요)로 씁니다.
- 공용 UI는 `src/components/ui.tsx`(TopBar, Chips, Sheet, Toggle, Slider, Notice 등)를 먼저 재사용하세요.
- 그림 그리기는 `src/lib/render.ts`의 `drawIllustration` / `renderScene`을 재사용하세요. **화면 미리보기와 저장되는 영상이 같은 그리기 코드를 쓰는 것**이 중요합니다.
- 움직임 신호는 `src/lib/motion.ts`(`MotionProcessor`, `computeTrack`, `frameAt`)를 쓰세요.
- 화면 이동은 `src/store.tsx`의 `Route`에 이름을 추가하고 `src/App.tsx`에서 연결합니다.
- 새 화면은 휴대폰 세로 화면(390px 폭 기준)에서 먼저 보기 좋게 만드세요.

## 6. 배포 설정

- Vercel 프로젝트: `hoitddus-projects/mallang-record` (Hobby). `main`에 push하면 자동 배포됩니다.
- `vercel.json`: 화면 이동 시 `index.html`로 연결, `/sw.js` 캐시 끔, 마이크 허용 정책.
- `public/_headers`, `public/_redirects`는 예전 Netlify용 설정입니다. 헤더를 바꿀 때는 `vercel.json`과 함께 맞춰 두세요.
- 서비스 워커(`public/sw.js`)는 화면 이동을 "인터넷 먼저"로 받아서, 배포하면 앱을 다시 열 때 새 버전이 보입니다.

## 7. 보류한 아이디어

- **AI로 같은 그림체 그림 자동 생성**: 당분간 보류. 그림은 수동 추가로 유지하고 현재 앱 고도화를 먼저 합니다.
