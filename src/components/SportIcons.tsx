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
        {/* 이음선(스포크) — 중앙 오각형과 5개의 가장자리 조각을 잇는 선 */}
        <path
          d="M12.2,7.1 L12.2,3.2 M16.29,10.07 L20.4,8.9 M14.73,14.88 L17.6,18.7 M9.67,14.88 L7,18.6 M8.11,10.07 L3.9,9"
          stroke="#1C1F26" strokeWidth="0.9" fill="none" strokeLinecap="round"
        />
        {/* 가장자리에 걸쳐 살짝 잘리는 5개 조각 (사진 속 축구공과 동일한 배치) */}
        <polygon points="12.27,0.1 15.17,2.31 13.96,5.75 10.32,5.67 9.27,2.18" fill="#1C1F26" />
        <polygon points="23.31,7.83 22.32,11.33 18.68,11.48 17.42,8.06 20.28,5.8" fill="#1C1F26" />
        <polygon points="19.59,21.08 15.95,21.33 14.59,17.94 17.39,15.61 20.48,17.54" fill="#1C1F26" />
        <polygon points="5.13,21.07 4.07,17.58 7.06,15.5 9.97,17.7 8.77,21.14" fill="#1C1F26" />
        <polygon points="0.99,7.92 4.03,5.9 6.88,8.16 5.62,11.58 1.98,11.43" fill="#1C1F26" />
        {/* 중앙 오각형 (가장 눈에 띄는 핵심 무늬) */}
        <polygon points="12.2,7.1 16.29,10.07 14.73,14.88 9.67,14.88 8.11,10.07" fill="#1C1F26" />
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
