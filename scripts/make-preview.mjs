// 미리보기용 한 장짜리 HTML 만들기 (dist-single/index.html → dist-single/mallang-preview.html)
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist-single/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keepHead = head
  .split('\n')
  .filter((l) => !/rel="(manifest|apple-touch-icon|icon)"|<meta charset|name="viewport"/.test(l))
  .join('\n');
const titleIdx = keepHead.indexOf('<title>');
writeFileSync('dist-single/mallang-preview.html', keepHead.slice(titleIdx) + '\n' + body);
console.log('ok', (keepHead.length + body.length) / 1024 | 0, 'KB');
