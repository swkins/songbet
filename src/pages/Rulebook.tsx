export default function Rulebook() {
  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 12,
  }
  const secTitle: React.CSSProperties = {
    fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10,
  }
  const subTitle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, marginTop: 14,
  }
  const desc: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6,
  }
  const divider: React.CSSProperties = {
    height: 1, background: 'var(--border)', margin: '14px 0',
  }

  function TierRow({ tier, label, range, note, color, bg, border }: {
    tier: string; label: string; range: string; note: string
    color: string; bg: string; border: string
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, background: bg, border: `1px solid ${border}`,
          color, borderRadius: 4, padding: '2px 7px', width: 48, textAlign: 'center', flexShrink: 0,
        }}>{tier} {label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{range}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{note}</span>
      </div>
    )
  }

  function PassRow({ text }: { text: string }) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3, display: 'flex', gap: 5 }}>
        <span style={{ color: '#f87171', fontWeight: 700, flexShrink: 0 }}>✕</span>
        <span>{text}</span>
      </div>
    )
  }

  const S = { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' }
  const A = { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' }
  const B = { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' }

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>

      {/* 헤더 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          전략 룰북 v2.0
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          MLB · NPB · KBO · EPL · 라리가 · 분데스 · 세리에 · 리그앙 · UCL · NBA · 유로리그 · KBL · B리그 · CBA
        </div>
      </div>

      {/* ─── 야구 ─── */}
      <div style={card}>
        <div style={secTitle}>⚾ 야구</div>

        {/* 역배 */}
        <div style={subTitle}>역배 전략</div>
        <div style={desc}>배당만 본다 — 선발·날씨·라인업 무시. 배당 숫자가 유일한 진입 기준.</div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['리그', '1순위 (황금)', '2순위 (테스트)', '패스'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { league: 'MLB', s: '2.10 ~ 2.49', a: '2.50 ~ 2.79', pass: '2.09↓ / 2.80↑' },
                { league: 'NPB', s: '2.10 ~ 2.49', a: '2.50 ~ 2.59', pass: '2.09↓ / 2.60↑' },
                { league: 'KBO', s: '2.10 ~ 2.49', a: '2.50↑ 무제한', pass: '2.09↓' },
              ].map(r => (
                <tr key={r.league} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.league}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: S.bg, border: `1px solid ${S.border}`, color: S.color, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{r.s}</span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: A.bg, border: `1px solid ${A.border}`, color: A.color, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{r.a}</span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#f87171', fontSize: 11 }}>{r.pass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ ...desc, marginTop: 8 }}>
          NPB: 불펜 안정 → 2.60↑ 정배팀 리드 유지율 높음. 투고타저 접전 多, 요미우리 상대 역배 주목.<br />
          KBO: 불펜 불안 → 어느 구간이든 역전 빈도 높음. 구간별 분리 기록 필수.
        </div>

        <div style={divider} />

        {/* 언더 */}
        <div style={subTitle}>언더 전략 (MLB · NPB · KBO 동일)</div>
        <div style={desc}>언더 배당 1.90 이상 진입 / 1.89↓ 무조건 패스. 퍼블릭 오버 쏠림 역이용.</div>

        <TierRow tier="S" label="1순위" range="1.90 ~ 2.09" note="메인 베팅" {...S} />
        <TierRow tier="A" label="2순위" range="2.10 ~ 2.29" note="롤링 여유 있을 때" {...A} />
        <TierRow tier="B" label="3순위" range="2.30 ~ 2.49" note="소액 테스트만" {...B} />

        <div style={{ marginTop: 10, background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>손익분기 적중률</div>
          {[
            { range: '1.90 ~ 1.99', rate: '52.6 ~ 53.3%', tier: 'S', ...S },
            { range: '2.00 ~ 2.09', rate: '50.0 ~ 51.2%', tier: 'S', ...S },
            { range: '2.10 ~ 2.19', rate: '47.8 ~ 49.0%', tier: 'A', ...A },
            { range: '2.20 ~ 2.29', rate: '45.9 ~ 47.3%', tier: 'A', ...A },
            { range: '2.30 ~ 2.39', rate: '44.2 ~ 45.6%', tier: 'B', ...B },
            { range: '2.40 ~ 2.49', rate: '42.7 ~ 44.1%', tier: 'B', ...B },
          ].map(r => (
            <div key={r.range} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: r.bg, border: `1px solid ${r.border}`, color: r.color, borderRadius: 4, padding: '1px 5px', width: 14, textAlign: 'center', flexShrink: 0 }}>{r.tier}</span>
              <span style={{ fontSize: 11, color: 'var(--text-primary)', width: 100, flexShrink: 0 }}>{r.range}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>이상 적중 시 수익 → {r.rate}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 축구 ─── */}
      <div style={card}>
        <div style={secTitle}>⚽ 축구 — 2.5 언더</div>
        <div style={desc}>
          EPL · 라리가 · 분데스리가 · 세리에A · 리그앙 · UCL (마진 5~7% 빅리그만)<br />
          강팀은 방심 금지로 안전하게 닫음 → 약팀은 수비적으로 버팀 → 3골 이상 날 이유 없음. 홈/원정 무관.
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>진입 조건 (2가지 동시 충족)</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>강팀 배당 (홈/원정 무관) </span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>1.40 ~ 1.79</span>
            </div>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>2.5 언더 배당 </span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>1.80 이상</span>
            </div>
          </div>
        </div>

        <TierRow tier="S" label="1순위" range="1.80 ~ 2.09" note="메인 베팅" {...S} />
        <TierRow tier="A" label="2순위" range="2.10 ~ 2.29" note="테스트" {...A} />

        <div style={{ marginTop: 10 }}>
          <PassRow text="강팀 배당 1.39↓ — 압도적 강팀 → 대량득점 가능" />
          <PassRow text="강팀 배당 1.80↑ — 전력 차이 줄어듦 → 약팀 득점 가능" />
          <PassRow text="언더 배당 1.79↓ — 마진만 남는 구간" />
        </div>
      </div>

      {/* ─── 농구 ─── */}
      <div style={card}>
        <div style={secTitle}>🏀 농구</div>

        {/* 플핸 */}
        <div style={subTitle}>플핸(+스프레드) 전략</div>
        <div style={desc}>
          NBA · 유로리그 · KBL · B리그 · CBA<br />
          퍼블릭이 강팀 마핸(-)에 쏠림 → 플핸(+) 배당 부풀림 → 플핸이 구조적 엣지.<br />
          <strong style={{ color: 'var(--text-primary)' }}>공통 조건: 플핸 배당 1.90 이상 (1.89↓ 패스)</strong>
        </div>

        <TierRow tier="S" label="1순위" range="+6.5 ~ +9.5" note="메인 베팅" {...S} />
        <TierRow tier="A" label="2순위" range="+10.5 ~ +12.5" note="2순위" {...A} />
        <TierRow tier="B" label="3순위" range="+5.5 / +13.5 ~ +14.5" note="소액 테스트" {...B} />

        <div style={divider} />

        {/* 언더 */}
        <div style={subTitle}>언더 전략</div>
        <div style={desc}>
          NBA · 유로리그 · KBL · B리그 · CBA (마진 7% 이하만)<br />
          강팀이 리드 후 페이스 낮춤 → 저득점 패턴 → 퍼블릭 오버 쏠림 역이용. 홈/원정 무관.
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>진입 조건</div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>정배 배당 </span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>1.20 ~ 1.59</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}> (범위 밖 패스)</span>
          </div>
        </div>

        <TierRow tier="1순위" label="" range="언더 2.00 이상" note="" {...S} />
        <TierRow tier="2순위" label="" range="언더 1.90 ~ 1.99" note="" {...A} />

        <div style={{ marginTop: 6 }}>
          <PassRow text="정배 1.19↓ — 압도적 강팀 → 대량득점" />
          <PassRow text="정배 1.60↑ — 전력 차이 줄어듦" />
          <PassRow text="언더 배당 1.89↓ — 패스" />
        </div>
      </div>

      {/* ─── 공통 원칙 ─── */}
      <div style={card}>
        <div style={secTitle}>💡 공통 원칙</div>
        {[
          { n: 1, t: '배당만 본다', d: '선발·날씨·라인업 없음. 배당 숫자가 유일한 진입 기준.' },
          { n: 2, t: '퍼블릭 반대 방향', d: '쏠림 역이용이 구조적 엣지. 구간 이탈 시 무조건 패스.' },
          { n: 3, t: '구간별 분리 기록', d: '0.1 단위 구간별 수익 분리 트래킹. 합산 절대 금지.' },
          { n: 4, t: '장기 운영', d: '최소 100건 이상 쌓인 후 구간 판단. 단기 결과에 흔들리지 않음.' },
        ].map(({ n, t, d }) => (
          <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', flexShrink: 0, width: 20 }}>{n}.</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{t}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
