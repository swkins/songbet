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
      style={{ display: 'inline-block', verticalAlign: '-0.2em', flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="soccerBallShade" cx="34%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#F0F1F3" />
          <stop offset="100%" stopColor="#C9CDD4" />
        </radialGradient>
        <clipPath id="soccerBallClip">
          <circle cx="12" cy="12" r="10" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#soccerBallShade)" stroke="#1C1F26" strokeWidth="1" />
      <g clipPath="url(#soccerBallClip)">
        {/* 살짝 기울어진 구도 — 위쪽에 걸친 오각형 하나 (테두리에 잘림) */}
        <path d="M10.4,-1 L14.6,1.2 L13.4,5.6 L9.4,5.3 L7.6,1.6 Z" fill="#1C1F26" />
        {/* 중심에서 약간 왼쪽 아래로 치우친 메인 오각형 (구를 비스듬히 본 느낌) */}
        <path d="M9.6,7.6 L13.6,8.2 L14.5,12.3 L11.2,15 L7.6,12.6 Z" fill="#1C1F26" />
        {/* 메인 오각형에서 뻗어나가는 곡선 이음선들 — 직선이 아니라 공 표면을 감싸듯 살짝 휘어지게 */}
        <path d="M9.6,7.6 C8.3,5.6 7.6,3.4 7.6,1.6 M13.6,8.2 C16.3,7.6 18.7,6.4 20.4,4.7 M14.5,12.3 C17.4,13.1 20.2,13.1 22.6,12.3 M11.2,15 C10.8,17.8 10.2,20.3 9,22.4 M7.6,12.6 C4.9,13.2 2.3,13.1 -0.2,12.2"
          stroke="#1C1F26" strokeWidth="0.9" fill="none" strokeLinecap="round" />
        {/* 오른쪽 위 — 살짝 잘려 보이는 조각 */}
        <path d="M20.4,4.7 C21.8,5.6 22.9,6.8 23.6,8.2 L22.6,12.3 L19,10.6 Z" fill="#1C1F26" />
        {/* 아래쪽 — 잘려 보이는 조각 */}
        <path d="M9,22.4 C7.3,22.1 5.7,21.4 4.3,20.4 L4.9,17 L8.4,17.6 Z" fill="#1C1F26" />
      </g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#1C1F26" strokeWidth="1" />
      {/* 곡면 하이라이트 */}
      <path d="M5.6,5.2 A10,10 0 0 1 11.6,1.1" stroke="#FFFFFF" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.65" />
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
