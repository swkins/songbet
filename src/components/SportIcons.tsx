// 축구공 / 야구공 아이콘 — OS 이모지 폰트에 의존하지 않는 커스텀 SVG.
// Windows/PC 브라우저의 기본 이모지(⚽⚾)는 납작하고 볼 형태가 잘 안 살아서,
// 모바일(애플/구글 이모지)처럼 또렷한 공 모양이 항상 나오도록 직접 그림.
// size는 폰트 크기(em)에 맞춰 인라인으로 쓸 수 있게 기본 1em.

import type { CSSProperties } from 'react'

interface IconProps {
  size?: number | string
  style?: CSSProperties
}

export function SoccerBallIcon({ size = '1em', style }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10.5" fill="#F5F7FA" stroke="#1C1F26" strokeWidth="1" />
      {/* 중앙 오각형 */}
      <polygon points="12,7.2 15,9.4 13.9,12.9 10.1,12.9 9,9.4" fill="#1C1F26" />
      {/* 오각형과 연결되는 이음선 + 주변 조각 */}
      <path d="M12,7.2 L9.3,3.4 M12,7.2 L14.7,3.4 M15,9.4 L19.2,8.7 M15,9.4 L18.4,12.6 M13.9,12.9 L15.6,17.2 M13.9,12.9 L10.1,12.9 M10.1,12.9 L8.4,17.2 M9,9.4 L4.8,8.7 M9,9.4 L5.6,12.6"
        stroke="#1C1F26" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      {/* 바깥 곡면 느낌을 위한 하이라이트 */}
      <path d="M6.2,5.4 A10.5,10.5 0 0 1 12,1.5" stroke="#FFFFFF" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}

export function BaseballIcon({ size = '1em', style }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10.5" fill="#FFFDF8" stroke="#C7B9A6" strokeWidth="0.8" />
      {/* 좌우 대칭 솔기(seam) 곡선 */}
      <path d="M4.2,6.4 C8,9.4 8,14.6 4.2,17.6" stroke="#E0473A" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M19.8,6.4 C16,9.4 16,14.6 19.8,17.6" stroke="#E0473A" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* 솔기 위 바느질 자국 */}
      {[7.1, 8.4, 9.7, 11, 12.3, 13.6, 14.9, 16.2].map((y, i) => (
        <line key={`l-${i}`} x1={4.2 + (i % 2 === 0 ? 3.15 : 3.55)} y1={y} x2={4.2 + (i % 2 === 0 ? 4.05 : 4.45)} y2={y - 0.55}
          stroke="#E0473A" strokeWidth="0.7" strokeLinecap="round" transform={`translate(0, ${i * 0} )`} />
      ))}
      {[7.1, 8.4, 9.7, 11, 12.3, 13.6, 14.9, 16.2].map((y, i) => (
        <line key={`r-${i}`} x1={19.8 - (i % 2 === 0 ? 3.15 : 3.55)} y1={y} x2={19.8 - (i % 2 === 0 ? 4.05 : 4.45)} y2={y - 0.55}
          stroke="#E0473A" strokeWidth="0.7" strokeLinecap="round" />
      ))}
      <path d="M6,4.8 A10.5,10.5 0 0 1 11.6,1.6" stroke="#FFFFFF" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

// 종목 값으로 커스텀 아이콘을 반환, 해당 없으면 null (기존 이모지로 폴백)
export function sportGlyph(value: string, size?: number | string) {
  if (value === 'soccer') return <SoccerBallIcon size={size} />
  if (value === 'baseball') return <BaseballIcon size={size} />
  return null
}
