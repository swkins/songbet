// ─── "세부 수치 입력" 베팅옵션 — 템플릿 라벨(예: "포인트 오버")에 들어있는 "포인트"를
// 실제 입력값으로 치환한다("185.5 오버"). Dashboard(베팅추가/수정)와 Stats(통계) 양쪽에서 쓴다.
// "포인트"가 없는 템플릿은 값을 앞에 붙인다("{값} {템플릿}").
export function numericTemplateParts(template: string): [string, string] | null {
  const idx = template.indexOf('포인트')
  if (idx === -1) return null
  return [template.slice(0, idx), template.slice(idx + '포인트'.length)]
}

export function applyNumericTemplate(template: string, value: string): string {
  const parts = numericTemplateParts(template)
  if (!parts) return `${value} ${template}`.trim()
  return `${parts[0]}${value}${parts[1]}`
}

// 완성된 라벨(예: "185.5 오버")이 이 템플릿에서 나온 값이면 숫자 부분만 뽑아 반환, 아니면 null.
export function extractNumericTemplateValue(template: string, label: string): string | null {
  const parts = numericTemplateParts(template)
  if (parts) {
    const [pre, post] = parts
    if (!label.startsWith(pre) || !label.endsWith(post) || label.length < pre.length + post.length) return null
    const mid = label.slice(pre.length, label.length - post.length)
    return /^[+-]?\d+(\.\d+)?$/.test(mid) ? mid : null
  }
  const suffix = ` ${template}`
  if (!label.endsWith(suffix)) return null
  const val = label.slice(0, label.length - suffix.length)
  return /^[+-]?\d+(\.\d+)?$/.test(val) ? val : null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 베팅 문구(match/pick) 끝부분에서 이 템플릿으로 만들어졌을 법한 구간을 찾아 숫자값을 뽑아낸다.
// 문구 전체가 아니라 끝부분만 보는 건 "팀이름 홈 185.5 오버"처럼 앞에 팀 이름 등이 붙어있기 때문.
export function extractNumericTemplateValueFromText(template: string, text: string): string | null {
  const parts = numericTemplateParts(template)
  const raw = (text ?? '').trim()
  if (parts) {
    const [pre, post] = parts
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(pre)}([+-]?\\d+(?:\\.\\d+)?)${escapeRegExp(post)}$`)
    const m = raw.match(re)
    return m ? m[1] : null
  }
  const re = new RegExp(`(?:^|\\s)([+-]?\\d+(?:\\.\\d+)?)\\s${escapeRegExp(template)}$`)
  const m = raw.match(re)
  return m ? m[1] : null
}
