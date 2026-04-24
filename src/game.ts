export type PressureTier = 'calm' | 'rush' | 'fever' | 'clutch'
export type GamePhase = 'ready' | 'playing' | 'result'
export type SceneMood = 'ready' | 'rush' | 'rage' | 'result'
export type SceneFace = 'focused' | 'smile' | 'panic' | 'x-eyes' | 'star'
export type BossMood = 'idle' | 'watch' | 'shout' | 'stunned'
export type DeskTheme = 'normal' | 'rush' | 'alarm' | 'confetti'
export type SceneAura = 'soft' | 'spark' | 'explosion' | 'glow'

export type RivalEntry = {
  rank: number
  name: string
  score: number
  player?: boolean
}

export type MissionItem = {
  label: string
  value: string
}

export type SceneState = {
  mood: SceneMood
  face: SceneFace
  bubble: string
  bossMood: BossMood
  deskTheme: DeskTheme
  stampText: string
  aura: SceneAura
}

const RIVALS = ['칼퇴요정', '월급헌터', '퇴근직진', '회의실탈출러', '점심스프린터']

export function getTapOutcome({
  combo,
  feverActive,
  clutchActive,
}: {
  combo: number
  feverActive: boolean
  clutchActive: boolean
}) {
  const gain =
    1 +
    (combo >= 10 ? 1 : 0) +
    (combo >= 20 ? 1 : 0) +
    (combo >= 28 ? 1 : 0) +
    (feverActive ? 2 : 0) +
    (clutchActive ? 1 : 0)

  const meterGain = Math.min(17, 8 + Math.floor(combo / 3) + (clutchActive ? 1 : 0))

  let headline = '한 번 더 눌러요'
  if (clutchActive) headline = '퇴사각 MAX'
  else if (feverActive) headline = 'FEVER 러시'
  else if (combo >= 18) headline = '퇴사력 폭주 중'
  else if (combo >= 3) headline = '리듬 타는 중'

  return {
    gain,
    meterGain,
    headline,
    hot: feverActive || clutchActive || combo >= 18,
  }
}

export function getPressureState({
  timeLeft,
  combo,
  feverActive,
}: {
  timeLeft: number
  combo: number
  feverActive: boolean
}) {
  if (timeLeft <= 3000) {
    return {
      label: '퇴사각 ON',
      subline: '지금 3초가 최고점 구간',
      tier: 'clutch' as const,
    }
  }

  if (feverActive) {
    return {
      label: 'FEVER 러시',
      subline: '지금은 손이 빠를수록 이득',
      tier: 'fever' as const,
    }
  }

  if (combo >= 12) {
    return {
      label: '손맛 상승',
      subline: '콤보가 끊기지 않게 유지하세요',
      tier: 'rush' as const,
    }
  }

  return {
    label: '워밍업 구간',
    subline: '초반 3초 안에 템포를 올려보세요',
    tier: 'calm' as const,
  }
}

export function buildSceneState({
  phase,
  pressureTier,
  feverActive,
  tapActive,
  latestEventLabel,
}: {
  phase: GamePhase
  pressureTier: PressureTier
  feverActive: boolean
  tapActive: boolean
  latestEventLabel: string | null
}): SceneState {
  if (phase === 'ready') {
    return {
      mood: 'ready',
      face: 'focused',
      bubble: '상사 오기 전에 버튼 위치부터 외우자.',
      bossMood: 'idle',
      deskTheme: 'normal',
      stampText: '워밍업',
      aura: 'soft',
    }
  }

  if (phase === 'result') {
    return {
      mood: 'result',
      face: 'star',
      bubble: '이번 판 결과 떴다! 바로 다음 판 갈까?',
      bossMood: 'stunned',
      deskTheme: 'confetti',
      stampText: '결과 확인',
      aura: 'glow',
    }
  }

  if (feverActive || pressureTier === 'clutch') {
    return {
      mood: 'rage',
      face: tapActive ? 'x-eyes' : 'panic',
      bubble: latestEventLabel ? `${latestEventLabel} 왔다. 지금 눌러서 탈출!` : '지금이야! 버튼만 믿고 탈출!',
      bossMood: 'shout',
      deskTheme: 'alarm',
      stampText: '퇴사각 MAX',
      aura: 'explosion',
    }
  }

  if (pressureTier === 'rush' || tapActive) {
    return {
      mood: 'rush',
      face: 'smile',
      bubble: latestEventLabel ? `${latestEventLabel} 버프 왔다. 더 빨리 눌러!` : '좋아, 리듬 탔다! 계속 누르자.',
      bossMood: 'watch',
      deskTheme: 'rush',
      stampText: '손맛 상승',
      aura: 'spark',
    }
  }

  return {
    mood: 'ready',
    face: 'focused',
    bubble: latestEventLabel ? `${latestEventLabel} 전까지 페이스 유지.` : '초반엔 리듬부터 만드는 중.',
    bossMood: 'watch',
    deskTheme: 'normal',
    stampText: '집중 모드',
    aura: 'soft',
  }
}

export function buildResultMeta({
  score,
  best,
  taps,
  maxCombo,
}: {
  score: number
  best: number
  taps: number
  maxCombo: number
}) {
  const percentile = Math.min(99, Math.max(52, Math.round(49 + score / 20)))
  const newBest = score > best
  const gap = Math.max(0, best - score)

  let title = '오늘도 회사는 버텼다'
  if (score >= 1200) title = '전설의 퇴사력'
  else if (score >= 900) title = '거의 퇴사 직전'
  else if (score >= 700) title = '퇴사 준비 완료'

  let badge = '성장 중'
  let comment = `이번 판 ${score}점 · ${taps}회 탭 · 최대 ${maxCombo}콤보.`

  if (newBest) {
    badge = '신기록'
    comment = '신기록 달성! 이 텐션 그대로 공유해도 됩니다.'
  } else if (gap <= 60 && best > 0) {
    badge = '재도전 각'
    comment = `베스트보다 ${gap}점 부족해요. 지금 한 판이면 넘깁니다.`
  } else if (score >= 1000) {
    badge = '상위권'
    comment = '상위권 감각이 왔어요. 마지막 3초를 더 밀어보세요.'
  }

  const targetBase = newBest ? score : Math.max(score, best)
  const nextTarget =
    newBest && score >= 1200
      ? Math.ceil(score / 100) * 100 + 100
      : Math.ceil(targetBase / 80) * 80

  return { percentile, title, comment, nextTarget, badge }
}

export function buildRivals(score: number): RivalEntry[] {
  const playerScore = score || 420
  const rank = Math.max(7, 22 - Math.floor(playerScore / 112))

  return [-2, -1, 0, 1, 2].map((offset, index) => {
    const scoreDelta = offset === 0 ? 0 : offset < 0 ? Math.abs(offset) * 32 + 18 : -(offset * 36)
    return {
      rank: rank + offset,
      name: offset === 0 ? '나' : RIVALS[(rank + index) % RIVALS.length],
      score: playerScore + scoreDelta,
      player: offset === 0,
    }
  })
}

export function buildMissionSet(best: number): MissionItem[] {
  const target = Math.ceil(Math.max(best, 900) / 80) * 80

  return [
    { label: '오늘의 목표', value: `${target}점 돌파` },
    { label: '리듬 미션', value: '20콤보 유지' },
    { label: '클러치 미션', value: '마지막 3초에 피버 켜기' },
  ]
}
