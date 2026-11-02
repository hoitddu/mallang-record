import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 'single' 모드: 파일 하나짜리 미리보기(index.html 한 장)로 빌드
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  base: mode === 'single' ? './' : '/',
  define: { __SINGLE__: JSON.stringify(mode === 'single') },
  build: mode === 'single' ? { outDir: 'dist-single', assetsInlineLimit: 100000000 } : { outDir: 'dist' },
}));
