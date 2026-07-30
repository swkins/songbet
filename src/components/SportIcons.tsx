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
      <defs>
        <radialGradient id="soccerBallShade" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#F2F3F5" />
          <stop offset="100%" stopColor="#D7DAE0" />
        </radialGradient>
        <clipPath id="soccerBallClip">
          <circle cx="12" cy="12" r="10" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#soccerBallShade)" stroke="#1C1F26" strokeWidth="1" />
      <g clipPath="url(#soccerBallClip)">
        {/* 중앙 오각형 (전형적인 축구공 무늬의 핵심 조각) */}
        <polygon points="12,5.6 15.2,7.9 13.9,11.7 10.1,11.7 8.8,7.9" fill="#1C1F26" />
        {/* 중앙 오각형 각 꼭짓점에서 바깥으로 뻗는 이음선 */}
        <path
          d="M12,5.6 L12,1.4 M15.2,7.9 L18.6,4 M13.9,11.7 L22.6,10.6 M10.1,11.7 L1.4,10.6 M8.8,7.9 L5.4,4"
          stroke="#1C1F26" strokeWidth="1" fill="none" strokeLinecap="round"
        />
        {/* 가장자리에 걸쳐 살짝 잘려 보이는 어두운 조각들 */}
        <ellipse cx="12" cy="1.6" rx="2.1" ry="1.7" fill="#1C1F26" />
        <ellipse cx="19.2" cy="3.6" rx="2" ry="1.7" fill="#1C1F26" transform="rotate(35 19.2 3.6)" />
        <ellipse cx="23.1" cy="10.6" rx="2" ry="1.7" fill="#1C1F26" transform="rotate(95 23.1 10.6)" />
        <ellipse cx="0.9" cy="10.6" rx="2" ry="1.7" fill="#1C1F26" transform="rotate(-95 0.9 10.6)" />
        <ellipse cx="4.8" cy="3.6" rx="2" ry="1.7" fill="#1C1F26" transform="rotate(-35 4.8 3.6)" />
        {/* 아래쪽 이음선 + 조각 (공 전체에 무늬가 둘러진 느낌) */}
        <path d="M9.2,15.6 L6.5,20 M14.8,15.6 L17.5,20 M9.2,15.6 L14.8,15.6" stroke="#1C1F26" strokeWidth="1" fill="none" strokeLinecap="round" />
        <ellipse cx="6.1" cy="21.3" rx="2" ry="1.7" fill="#1C1F26" transform="rotate(-60 6.1 21.3)" />
        <ellipse cx="17.9" cy="21.3" rx="2" ry="1.7" fill="#1C1F26" transform="rotate(60 17.9 21.3)" />
      </g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#1C1F26" strokeWidth="1" />
      {/* 곡면 하이라이트 */}
      <path d="M5.6,5.2 A10,10 0 0 1 11.6,1.1" stroke="#FFFFFF" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.6" />
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
