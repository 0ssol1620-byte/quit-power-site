import { describe, expect, it } from 'vitest'
import {
  buildMissionSet,
  buildResultMeta,
  buildRivals,
  buildSceneState,
  getPressureState,
  getTapOutcome,
} from './game'

describe('getTapOutcome', () => {
  it('rewards combo and fever-heavy clutch taps with a large gain', () => {
    expect(getTapOutcome({ combo: 28, feverActive: true, clutchActive: true })).toEqual({
      gain: 7,
      meterGain: 17,
      headline: '퇴사각 MAX',
      hot: true,
    })
  })

  it('keeps early taps readable and lower-stakes', () => {
    expect(getTapOutcome({ combo: 3, feverActive: false, clutchActive: false })).toEqual({
      gain: 1,
      meterGain: 9,
      headline: '리듬 타는 중',
      hot: false,
    })
  })
})

describe('getPressureState', () => {
  it('switches to clutch messaging in the final seconds', () => {
    expect(getPressureState({ timeLeft: 2400, combo: 15, feverActive: false })).toEqual({
      label: '퇴사각 ON',
      subline: '지금 3초가 최고점 구간',
      tier: 'clutch',
    })
  })

  it('uses fever messaging before clutch time', () => {
    expect(getPressureState({ timeLeft: 5400, combo: 10, feverActive: true })).toEqual({
      label: 'FEVER 러시',
      subline: '지금은 손이 빠를수록 이득',
      tier: 'fever',
    })
  })
})

describe('buildResultMeta', () => {
  it('creates a revenge hook when the player misses their best by a small margin', () => {
    expect(buildResultMeta({ score: 912, best: 940, taps: 163, maxCombo: 29 })).toEqual({
      percentile: 95,
      title: '거의 퇴사 직전',
      comment: '베스트보다 28점 부족해요. 지금 한 판이면 넘깁니다.',
      nextTarget: 960,
      badge: '재도전 각',
    })
  })

  it('celebrates a new best with a stronger badge and rounded target', () => {
    expect(buildResultMeta({ score: 1280, best: 1220, taps: 201, maxCombo: 34 })).toEqual({
      percentile: 99,
      title: '전설의 퇴사력',
      comment: '신기록 달성! 이 텐션 그대로 공유해도 됩니다.',
      nextTarget: 1400,
      badge: '신기록',
    })
  })
})

describe('buildRivals', () => {
  it('keeps the player centered with near-miss rivals around them', () => {
    const rivals = buildRivals(900)

    expect(rivals).toHaveLength(5)
    expect(rivals[2]).toMatchObject({ rank: 14, name: '나', score: 900, player: true })
    expect(rivals[1].score).toBeGreaterThan(rivals[2].score)
    expect(rivals[3].score).toBeLessThan(rivals[2].score)
  })
})

describe('buildMissionSet', () => {
  it('returns a mission set focused on retention hooks', () => {
    expect(buildMissionSet(940)).toEqual([
      { label: '오늘의 목표', value: '960점 돌파' },
      { label: '리듬 미션', value: '20콤보 유지' },
      { label: '클러치 미션', value: '마지막 3초에 피버 켜기' },
    ])
  })
})

describe('buildSceneState', () => {
  it('uses an energetic press scene when the player is in fever clutch', () => {
    expect(
      buildSceneState({ phase: 'playing', pressureTier: 'clutch', feverActive: true, tapActive: true, latestEventLabel: '팀장 호출' }),
    ).toEqual({
      mood: 'rage',
      face: 'x-eyes',
      bubble: '팀장 호출 왔다. 지금 눌러서 탈출!',
      bossMood: 'shout',
      deskTheme: 'alarm',
      stampText: '퇴사각 MAX',
      aura: 'explosion',
    })
  })

  it('settles into a calmer prep scene before the game starts', () => {
    expect(
      buildSceneState({ phase: 'ready', pressureTier: 'calm', feverActive: false, tapActive: false, latestEventLabel: null }),
    ).toEqual({
      mood: 'ready',
      face: 'focused',
      bubble: '상사 오기 전에 버튼 위치부터 외우자.',
      bossMood: 'idle',
      deskTheme: 'normal',
      stampText: '워밍업',
      aura: 'soft',
    })
  })
})
