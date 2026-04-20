# ⚡ BET TRACKER

베팅 기록 관리 앱 — React + Vite + Supabase

## 설정 방법

### 1. Supabase 테이블 생성
Supabase 대시보드 → SQL Editor에서 `supabase/schema.sql` 실행

### 2. 환경변수 설정

**로컬 개발:**
`.env.example`을 `.env`로 복사 후 실제 키 입력:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ODDS_API_KEY=your_key
```

**Vercel 배포:**
Vercel 대시보드 → Settings → Environment Variables에 동일하게 입력

### 3. 로컬 실행
```bash
npm install
npm run dev
```

### 4. 배포
GitHub에 push하면 Vercel이 자동으로 빌드/배포
