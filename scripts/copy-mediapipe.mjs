// 얼굴 인식 엔진(wasm)을 앱 안(public/mediapipe)에 복사해요. 외부 주소에서 받지 않기 위해서예요.
// npm run dev / npm run build 전에 자동으로 실행돼요. (복사본은 git에 올리지 않음)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dst = join(root, 'public/mediapipe');
if (!existsSync(src)) {
  console.error('[copy-mediapipe] node_modules/@mediapipe/tasks-vision 가 없어요. npm install 을 먼저 해 주세요.');
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  copyFileSync(join(src, f), join(dst, f));
}
console.log('[copy-mediapipe] 얼굴 인식 엔진 복사 완료');
