# 🔒 BET TRACKER · 데이터 저장 골든 룰

> 이 문서는 앞으로 이 앱을 고치는 모든 Claude / 개발자가 따라야 하는 규칙입니다.
> 2026-04-24 전면 Supabase 이관 이후 확립된 원칙.

## 🟢 핵심 원칙: 사용자 데이터는 무조건 Supabase

### 왜?
한 사용자가 여러 PC·모바일을 오가기 때문에, localStorage는 PC마다 따로 돌아 데이터가 분산된다. 라이브스코어 경기가 1번 PC에서만 보이던 과거 버그의 원인.

### 저장 위치 규칙

| 데이터 성격 | 저장소 |
|---|---|
| 사용자가 입력/수정하는 모든 것 | **Supabase** (`lib/db.ts` 경유) |
| 외부 API의 짧은 캐시 (예: api-sports 15분) | localStorage 허용 |
| 그 외 | Supabase가 기본값 |

### 금지 목록

```ts
// ❌ 절대 금지
localStorage.setItem("bt_아무거나", JSON.stringify(userData))
sessionStorage.setItem(...)

// ❌ 금지: useState 초기값으로 localStorage 읽기
const [x, setX] = useState(() => JSON.parse(localStorage.getItem("bt_x") || "[]"))

// ✅ 올바름
const [x, setX] = useState<T[]>([])  // 빈 값으로 시작
useEffect(() => {
  db.loadX().then(setX)              // Supabase에서 로드
}, [])
```

### 허용되는 localStorage 키 (화이트리스트)

이 키들만 localStorage 사용이 정당하다. 그 외에 localStorage가 보이면 버그다.

```
bt_apisports_{sport}_{YYYY-MM-DD}   // api-sports 15분 캐시
```

---

## 새 상태를 추가할 때

### 1. 단순 키-값이면 `app_settings` 테이블 사용

배열, 문자열, 단순 객체 하나 저장하는 정도라면 새 테이블 만들지 말고 `app_settings`에 키 얹기.

```ts
// 저장
await db.saveAppSetting('my_new_key', myValue)

// 로드
const v = await db.loadAppSetting('my_new_key', defaultValue)
```

필요하면 `AppSettingsBundle` 인터페이스에 타입을 추가하라.

### 2. 구조화된 데이터면 전용 테이블 생성

- Supabase SQL Editor에서 `CREATE TABLE` 실행
- `db.ts`에 `load / upsert / delete` 함수 세트 추가 (기존 패턴 그대로)
  - 모든 함수는 `try/catch`로 감싸고 실패 시 `logLoadError` / `logSaveError`
  - load 실패 시 빈 값 반환 (throw 금지)
- `App.tsx` 에 3곳 수정:
  1. `useState` 빈 값으로 선언
  2. 초기 로딩 `useEffect`에서 `Promise.all`에 추가
  3. `save*` 함수에서 setState와 동시에 `db.upsert*` 호출

### 3. save 패턴 예시

```ts
const savePointSites = (sites: PointSite[]) => {
  setPointSites(sites)                          // UI 즉시 갱신
  // 어떤 게 바뀌었는지 모르니 전체를 diff해서 upsert
  // (또는 바뀐 항목만 upsert하도록 세분화)
  for (const p of sites) db.upsertPointSite(p)
}
```

대량 일괄 저장이 잦다면 단건 upsert 대신 변경 대상만 추리는 방식을 선호할 것.

---

## 에러 처리 패턴

### 로드 실패
- `db.ts` 내부에서 `try/catch` 처리, 빈 값 반환
- `console.error`로 개발자용 로그만 남김
- App.tsx에서 필요시 `dataLoadErrors` 배너로 사용자에게 안내

### 저장 실패
- `db.ts` 내부에서 `try/catch`, `console.error`만
- 사용자에게 즉각 에러 alert은 띄우지 않는다 (UX 훼손). 필요하면 상단 배너.

---

## 테이블 추가 체크리스트

새 테이블 만들 때:

- [ ] SQL `CREATE TABLE` 작성 (`schema.sql` 업데이트)
- [ ] RLS 정책 복붙 (기존 테이블과 동일)
- [ ] `db.ts` 에 interface + load + upsert + delete 함수 추가
- [ ] 모든 함수 `try/catch` 처리
- [ ] `App.tsx` useState 빈 값 선언
- [ ] `App.tsx` useEffect 초기 로딩에 추가
- [ ] `App.tsx` save 함수에서 `db.upsert*` 호출
- [ ] 기존 localStorage 키 흔적이 없는지 `grep -n "localStorage" src/App.tsx` 로 확인

---

## 현재 Supabase 테이블 목록 (2026-04-24 기준)

### 기존
- `bets` — 베팅 기록
- `deposits` — 입금
- `withdrawals` — 출금
- `site_states` — 사이트별 상태
- `custom_leagues` — 커스텀 리그
- `esports_records` — E스포츠 기록
- `profit_extras` — 추가 수익

### 라이브스코어 관련 (기존)
- `manual_games` — 수동 추가 경기
- `m_meta` — 수동 종목/국가/리그 메타

### 이번에 추가
- `point_sites` — 포인트 교환 사이트
- `daily_quests` — 일일 퀘스트 + 출석
- `code_memos` — 코드 수정 메모
- `team_names` — 팀명 번역 매핑
- `app_settings` — key-value 통합 설정
  - 키: `krw_sites`, `usd_sites`, `pext_sites`, `pext_cats`, `pext_subcats`, `code_memo_draft`
