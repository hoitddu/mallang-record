/**
 * 자막 타이밍: 아이가 말하는 소리에 맞춰 "아이가 한 말"의 글자·단어가 나타나는 시각.
 *
 * 말의 뜻이나 발음을 알아듣지는 않아요. 소리가 커졌다 작아지는 "덩어리"(대략 한 음절)와
 * 쉬는 틈만 보고, 부모가 적은 글자를 그 박자에 맞춰 배치합니다.
 *  - "물고기점프"를 빠르게 → 덩어리가 촘촘 → 글자도 빠르게
 *  - "물고기 … 점프" → 쉬는 틈에서 단어가 나뉨 → "물고기"가 먼저, "점프"는 그 소리가 들릴 때
 * 모두 기기 안에서 계산하고, 같은 녹음이면 언제나 같은 결과가 나와요(미리보기 = 영상).
 */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 글자 하나가 톡 나타나는 데 걸리는 시간(초) */
const POP = 0.12;

/**
 * 소리 덩어리(음절 비슷한 것)가 시작되는 시각들(초).
 * rms: 초당 fps개의 소리 세기, floor: 잡음 바닥(dB), first~last: 목소리가 들린 범위
 */
export function syllableOnsets(rms: Float32Array, fps: number, floor: number, first: number, last: number): number[] {
  if (first < 0 || last < first) return [];
  const n = rms.length;
  const i0 = Math.max(0, Math.floor((first - 0.08) * fps));
  const i1 = Math.min(n - 1, Math.ceil((last + 0.08) * fps));
  if (i1 - i0 < 3) return [first];
  // dB로 바꾸고 짧게(약 50ms) 고르기
  const db = new Float32Array(n);
  for (let i = i0; i <= i1; i++) db[i] = 20 * Math.log10(Math.max(rms[i], 1e-6));
  const env = new Float32Array(n);
  for (let i = i0; i <= i1; i++) {
    let s = 0, c = 0;
    for (let k = -1; k <= 1; k++) {
      const j = i + k;
      if (j >= i0 && j <= i1) (s += db[j]), c++;
    }
    env[i] = s / c;
  }
  let peak = -200;
  for (let i = i0; i <= i1; i++) peak = Math.max(peak, env[i]);
  const thr = Math.max(floor + 6, peak - 28);
  // 봉우리 찾기 (앞뒤 약 60ms 안에서 가장 큰 곳)
  const W = Math.max(2, Math.round(0.06 * fps));
  let peaks: number[] = [];
  for (let i = i0; i <= i1; i++) {
    if (env[i] < thr) continue;
    let ok = true;
    for (let k = -W; k <= W && ok; k++) {
      const j = i + k;
      if (k !== 0 && j >= i0 && j <= i1 && (env[j] > env[i] || (env[j] === env[i] && k < 0))) ok = false;
    }
    if (ok) peaks.push(i);
  }
  // 사이 골짜기가 얕거나 너무 가까운 봉우리는 하나로 (한 음절 안의 작은 출렁임)
  const minBetween = (a: number, b: number) => {
    let m = Infinity, at = a;
    for (let j = a; j <= b; j++) if (env[j] < m) (m = env[j]), (at = j);
    return { m, at };
  };
  let merged = true;
  while (merged && peaks.length > 1) {
    merged = false;
    for (let k = 0; k < peaks.length - 1; k++) {
      const a = peaks[k], b = peaks[k + 1];
      const v = minBetween(a, b).m;
      if (Math.min(env[a], env[b]) - v < 2.5 || (b - a) / fps < 0.09) {
        peaks.splice(env[a] >= env[b] ? k + 1 : k, 1);
        merged = true;
        break;
      }
    }
  }
  if (!peaks.length) return [first];
  // 각 봉우리의 시작: 앞 골짜기에서 봉우리로 올라가는 중간쯤
  const out: number[] = [];
  for (let k = 0; k < peaks.length; k++) {
    const p = peaks[k];
    const from = k === 0 ? i0 : minBetween(peaks[k - 1], p).at;
    const valley = env[from];
    const level = valley + (env[p] - valley) * 0.35;
    let j = p;
    while (j > from && env[j - 1] >= level) j--;
    out.push(Math.max(first, j / fps));
  }
  out[0] = Math.min(out[0], Math.max(first, out[0]));
  return out;
}

/**
 * 글자마다 나타나는 시각(초). text의 글자 수만큼(띄어쓰기는 다음 글자와 같이).
 * onsets: 소리 덩어리 시작 시각, first~last: 목소리 범위. 목소리가 없으면 null
 */
export function captionTimes(text: string, onsets: number[], first: number, last: number): number[] | null {
  const chars = Array.from(text);
  if (first < 0 || !chars.length) return null;
  // 단어(띄어쓰기로 나눔)와 글자
  const words: number[][] = [];
  let cur: number[] = [];
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur.length) words.push(cur), (cur = []);
    } else cur.push(i);
  });
  if (cur.length) words.push(cur);
  const N = words.reduce((s, w) => s + w.length, 0);
  const times = new Array<number>(chars.length).fill(first);
  if (!N) return times;

  const S = onsets.length ? onsets.slice() : [first];
  const M = S.length;
  const tail = Math.max(S[M - 1] + 0.2, Math.min(last, S[M - 1] + 0.35));

  // 글자 n개를 덩어리 시각들(G, 끝 시각 end)에 고르게 얹기
  const place = (idx: number[], G: number[], end: number) => {
    const m = G.length, n = idx.length;
    const ext = [...G, Math.max(end, G[m - 1] + 0.05)];
    idx.forEach((ci, k) => {
      const f = (k * m) / n;
      const a = Math.floor(f);
      times[ci] = ext[a] + (f - a) * (ext[a + 1] - ext[a]);
    });
  };

  const Wn = words.length;
  if (Wn === 1 || M < Wn) {
    // 단어가 하나거나 소리 덩어리가 단어보다 적음: 전체 글자를 박자에 고르게
    place(words.flat(), S, tail);
  } else {
    // 단어 사이 경계 정하기: 쉬는 틈이 클수록, 글자 수 비율에 맞을수록 좋은 자리
    const gaps = S.map((s, b) => (b === 0 ? 0 : s - S[b - 1]));
    const sorted = gaps.slice(1).sort((x, y) => x - y);
    const med = Math.max(0.05, sorted[Math.floor(sorted.length / 2)] ?? 0.2);
    let acc = 0;
    const expect = words.slice(0, -1).map((w) => ((acc += w.length) / N) * M);
    // dp[j][b]: j번째 경계를 b(덩어리 b-1과 b 사이)에 둘 때 최고 점수
    const J = Wn - 1;
    const NEG = -1e9;
    const dp: number[][] = Array.from({ length: J }, () => new Array(M).fill(NEG));
    const from: number[][] = Array.from({ length: J }, () => new Array(M).fill(-1));
    const score = (j: number, b: number) => Math.min(gaps[b] / med, 6) - 0.9 * Math.abs(b - expect[j]);
    for (let b = 1; b < M; b++) dp[0][b] = score(0, b);
    for (let j = 1; j < J; j++)
      for (let b = j + 1; b < M; b++)
        for (let pb = j; pb < b; pb++)
          if (dp[j - 1][pb] > NEG && dp[j - 1][pb] + score(j, b) > dp[j][b]) (dp[j][b] = dp[j - 1][pb] + score(j, b)), (from[j][b] = pb);
    let best = -1;
    for (let b = J; b < M; b++) if (best < 0 || dp[J - 1][b] > dp[J - 1][best]) best = b;
    const cuts = new Array<number>(J);
    for (let j = J - 1, b = best; j >= 0; j--) (cuts[j] = b), (b = from[j][b]);
    const bounds = [0, ...cuts, M];
    words.forEach((w, wi) => {
      const G = S.slice(bounds[wi], bounds[wi + 1]);
      const end = wi < Wn - 1 ? Math.min(S[bounds[wi + 1]], G[G.length - 1] + 0.3) : tail;
      place(w, G, end);
    });
  }
  // 띄어쓰기는 다음 글자와 같이
  for (let i = chars.length - 2; i >= 0; i--) if (/\s/.test(chars[i])) times[i] = times[i + 1];
  // 순서가 뒤바뀌지 않게
  for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1]);
  return times;
}

/** 글자 하나가 나타난 정도 0~1 (t: 지금, ti: 그 글자가 나타나는 시각) */
export function charAlpha(t: number, ti: number): number {
  return clamp((t - ti) / POP, 0, 1);
}

/**
 * 줄을 나눠 그린 자막(띄어쓰기가 줄바꿈으로 바뀌거나 겹친 경우)의 글자마다 시각.
 * text 원문의 글자 시각을 줄 글자 순서에 맞춰 옮김 (띄어쓰기는 다음 글자 시각)
 */
export function timesForLines(text: string, times: number[], lines: string[]): number[][] {
  const src = Array.from(text);
  const nonSpace: number[] = [];
  src.forEach((ch, i) => /\s/.test(ch) || nonSpace.push(times[i]));
  let q = 0;
  return lines.map((line) => {
    const lc = Array.from(line);
    const out = lc.map((ch) => (/\s/.test(ch) ? -1 : nonSpace[Math.min(q++, nonSpace.length - 1)] ?? 0));
    for (let i = out.length - 1; i >= 0; i--) if (out[i] < 0) out[i] = i + 1 < out.length ? out[i + 1] : nonSpace[Math.min(q, nonSpace.length - 1)] ?? 0;
    return out;
  });
}

/** 시각 t에 자막이 나타난 정도 0~1 (글자마다 톡 나타나는 중간 단계 포함) */
export function captionShown(t: number, times: number[] | null): number {
  if (!times || !times.length) return 1;
  let s = 0;
  for (const ti of times) s += clamp((t - ti) / POP, 0, 1);
  return s / times.length;
}
