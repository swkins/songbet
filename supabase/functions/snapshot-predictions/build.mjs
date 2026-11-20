// 엣지 함수 묶기: node supabase/functions/snapshot-predictions/build.mjs → index.ts (배포 파일)
// 화면 코드의 './supabase'(Vite 환경변수) 대신 src/db.ts(서비스 키)를 쓰게 바꾼다.
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
await build({
  entryPoints: [path.join(dir, 'src/main.ts')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  outfile: path.join(dir, 'index.ts'), external: ['npm:*'], banner: { js: '// @ts-nocheck\n// 자동 생성 (build.mjs) — 직접 고치지 말고 src/main.ts·src/lib를 고친 뒤 다시 묶는다' },
  mainFields: ['module', 'main'], logLevel: 'warning', charset: 'utf8', minify: true,
  plugins: [{ name: 'edge', setup(b) {
    b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: path.join(dir, 'src/db.ts') }))
    b.onResolve({ filter: /^dayjs$/ }, () => ({ path: 'npm:dayjs@1.11.13', external: true }))
    // 한국어 이름표는 화면용이라 함수에선 빈 표
    b.onResolve({ filter: /nbaNamesKo$/ }, () => ({ path: 'names', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const NBA_NAMES_KO = {}', loader: 'ts' }))
  } }],
})
