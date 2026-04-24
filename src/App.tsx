import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  buildMissionSet,
  buildResultMeta,
  buildRivals,
  buildSceneState,
  getPressureState,
  getTapOutcome,
  type RivalEntry,
  type SceneState,
} from './game'

type Phase = 'ready' | 'playing' | 'result'
type EventKind = 'team-call' | 'lunch' | 'payday' | 'overtime' | 'freedom'

type Burst = { id: number; x: number; y: number; text: string; hot?: boolean }

type GameEvent = {
  id: string
  kind: EventKind
  label: string
  copy: string
  boost: number
  bonus?: number
  at: number
}

const ROUND_MS = 10_000
const FEVER_MS = 2_400
const FEVER_NEED = 100
const COMBO_WINDOW = 220
const STORAGE_KEY = 'quit-power-site-v3'

function createEvents(): GameEvent[] {
  const pool: Omit<GameEvent, 'id' | 'at'>[] = [
    { kind: 'team-call', label: '팀장 호출', copy: '등 뒤에서 발소리 들린다', boost: 14 },
    { kind: 'lunch', label: '점심시간', copy: '손이 빨라지는 버프', boost: 22, bonus: 40 },
    { kind: 'payday', label: '월급날', copy: '현타가 점수로 바뀐다', boost: 16, bonus: 90 },
    { kind: 'overtime', label: '야근 지옥', copy: '오늘은 진짜 탈출한다', boost: 18 },
    { kind: 'freedom', label: '칼퇴 찬스', copy: '지금이 버튼 누를 황금 타이밍', boost: 26, bonus: 60 },
  ]

  return pool
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((event, index) => ({
      ...event,
      id: `${event.kind}-${index}`,
      at: [1600, 4200, 7600][index],
    }))
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('ready')
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND_MS)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(0)
  const [dailyRuns, setDailyRuns] = useState(0)
  const [meter, setMeter] = useState(0)
  const [fever, setFever] = useState(false)
  const [headline, setHeadline] = useState('10초 안에 퇴사력을 폭발시키세요')
  const [bursts, setBursts] = useState<Burst[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [shareCopied, setShareCopied] = useState(false)
  const [tapActive, setTapActive] = useState(false)
  const [summary, setSummary] = useState({ score: 0, taps: 0, maxCombo: 0 })
  const [resultMeta, setResultMeta] = useState(() => buildResultMeta({ score: 0, best: 0, taps: 0, maxCombo: 0 }))

  const rafRef = useRef<number | null>(null)
  const timeoutIdsRef = useRef<number[]>([])
  const startedAtRef = useRef<number | null>(null)
  const lastTapRef = useRef(0)
  const scoreRef = useRef(0)
  const tapsRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const meterRef = useRef(0)
  const timeLeftRef = useRef(ROUND_MS)
  const feverUntilRef = useRef(0)
  const processedRef = useRef(new Set<string>())
  const burstIdRef = useRef(1)
  const eventsRef = useRef<GameEvent[]>([])
  const bestRef = useRef(0)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { best?: number; dailyRuns?: number }
      setBest(saved.best ?? 0)
      setDailyRuns(saved.dailyRuns ?? 0)
      bestRef.current = saved.best ?? 0
    } catch {
      bestRef.current = 0
    }
  }, [])

  useEffect(() => {
    bestRef.current = best
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best, dailyRuns }))
  }, [best, dailyRuns])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [])

  const pressure = useMemo(() => getPressureState({ timeLeft, combo, feverActive: fever }), [combo, fever, timeLeft])
  const missions = useMemo(() => buildMissionSet(best || 940), [best])
  const leaderboard = useMemo<RivalEntry[]>(() => buildRivals(summary.score || best || 420), [best, summary.score])
  const nextRival = leaderboard[1]
  const elapsed = ROUND_MS - timeLeft
  const liveTaps = phase === 'playing' ? tapsRef.current : summary.taps
  const activeEvent = events.findLast((event) => elapsed >= event.at) ?? null

  const sceneState = useMemo(
    () =>
      buildSceneState({
        phase,
        pressureTier: pressure.tier,
        feverActive: fever,
        tapActive,
        latestEventLabel: activeEvent?.label ?? null,
      }),
    [activeEvent?.label, fever, phase, pressure.tier, tapActive],
  )

  const shareText = useMemo(() => {
    if (!summary.score) return ''
    return `퇴사력 키우기 ${summary.score}점 · ${resultMeta.badge} · 상위 ${100 - resultMeta.percentile}% · 최대 콤보 ${summary.maxCombo}`
  }, [resultMeta.badge, resultMeta.percentile, summary.maxCombo, summary.score])

  function scheduleTimeout(callback: () => void, delay: number) {
    const timeoutId = window.setTimeout(callback, delay)
    timeoutIdsRef.current.push(timeoutId)
  }

  function setQuickPulse() {
    setTapActive(true)
    scheduleTimeout(() => setTapActive(false), 110)
  }

  function vibrate(duration: number) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration)
    }
  }

  function pushBurst(text: string, hot = false) {
    const id = burstIdRef.current++
    const burst: Burst = {
      id,
      x: 50 + (Math.random() * 18 - 9),
      y: 58 + (Math.random() * 14 - 7),
      text,
      hot,
    }

    setBursts((current) => [...current, burst].slice(-14))
    scheduleTimeout(() => {
      setBursts((current) => current.filter((item) => item.id !== id))
    }, 720)
  }

  function triggerFever(now: number) {
    feverUntilRef.current = now + FEVER_MS
    meterRef.current = 0
    setMeter(0)
    setFever(true)
    setHeadline('FEVER 발동 — 지금이 기록 갱신 구간')
    pushBurst('FEVER x3', true)
    vibrate(18)
  }

  function finishGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const finalScore = scoreRef.current
    const finalBest = Math.max(bestRef.current, finalScore)
    const nextMeta = buildResultMeta({
      score: finalScore,
      best: bestRef.current,
      taps: tapsRef.current,
      maxCombo: maxComboRef.current,
    })

    setSummary({ score: finalScore, taps: tapsRef.current, maxCombo: maxComboRef.current })
    setResultMeta(nextMeta)
    setBest(finalBest)
    setDailyRuns((prev) => prev + 1)
    setHeadline(nextMeta.comment)
    setPhase('result')
    setFever(false)
    setTapActive(false)
  }

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const nextEvents = createEvents()
    eventsRef.current = nextEvents
    setEvents(nextEvents)
    processedRef.current = new Set()
    startedAtRef.current = performance.now()
    lastTapRef.current = 0
    scoreRef.current = 0
    tapsRef.current = 0
    comboRef.current = 0
    maxComboRef.current = 0
    meterRef.current = 0
    feverUntilRef.current = 0
    timeLeftRef.current = ROUND_MS

    setPhase('playing')
    setScore(0)
    setTimeLeft(ROUND_MS)
    setCombo(0)
    setMeter(0)
    setFever(false)
    setBursts([])
    setShareCopied(false)
    setHeadline('초반 3초 안에 리듬을 타면 점수가 폭증합니다')

    const tick = (now: number) => {
      const started = startedAtRef.current ?? now
      const elapsedNow = now - started
      const left = Math.max(0, ROUND_MS - elapsedNow)

      timeLeftRef.current = left
      setTimeLeft(left)

      eventsRef.current.forEach((event) => {
        if (processedRef.current.has(event.id) || elapsedNow < event.at) return

        processedRef.current.add(event.id)
        const eventBonus = event.bonus ?? 0
        scoreRef.current += eventBonus
        setScore(scoreRef.current)

        const nextMeter = Math.min(FEVER_NEED, meterRef.current + event.boost)
        meterRef.current = nextMeter
        setMeter(nextMeter)
        setHeadline(`${event.label} · ${event.copy}`)
        pushBurst(event.label, true)

        if (nextMeter >= FEVER_NEED && now >= feverUntilRef.current) {
          triggerFever(now)
        }
      })

      const feverOn = now < feverUntilRef.current
      setFever(feverOn)

      if (left <= 0) {
        finishGame()
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  function handleTap() {
    if (phase !== 'playing') return

    const now = performance.now()
    const nextCombo = now - lastTapRef.current <= COMBO_WINDOW ? comboRef.current + 1 : 1
    const feverActive = now < feverUntilRef.current
    const clutchActive = timeLeftRef.current <= 3000
    const outcome = getTapOutcome({ combo: nextCombo, feverActive, clutchActive })

    lastTapRef.current = now
    comboRef.current = nextCombo
    maxComboRef.current = Math.max(maxComboRef.current, nextCombo)
    tapsRef.current += 1
    scoreRef.current += outcome.gain

    const nextMeter = Math.min(FEVER_NEED, meterRef.current + outcome.meterGain)
    meterRef.current = nextMeter

    setScore(scoreRef.current)
    setCombo(nextCombo)
    setMeter(nextMeter)
    setHeadline(outcome.headline)
    pushBurst(`+${outcome.gain}`, outcome.hot)
    setQuickPulse()
    vibrate(outcome.hot ? 16 : 8)

    if (nextMeter >= FEVER_NEED && !feverActive) {
      triggerFever(now)
    }
  }

  async function copyShare() {
    if (!shareText) return

    try {
      await navigator.clipboard.writeText(shareText)
      setShareCopied(true)
      scheduleTimeout(() => setShareCopied(false), 1400)
    } catch {
      setShareCopied(false)
    }
  }

  return (
    <div className="page-shell">
      <header className="title-block compact">
        <span className="mini-chip">캐릭터 액션 클리커</span>
        <h1>퇴사력 키우기</h1>
        <p>웹페이지처럼 보이던 걸 버리고, 사무실 안에서 캐릭터가 진짜 버튼을 내리찍는 씬으로 바꿨다.</p>
      </header>

      <section className={`game-shell tier-${pressure.tier} ${fever ? 'is-fever' : ''}`}>
        <div className="hud-top">
          <div className="hud-score">
            <span>퇴사력</span>
            <strong>{score.toLocaleString()}</strong>
          </div>
          <div className="hud-mini">
            <HudMini label="콤보" value={`${combo}`} />
            <HudMini label="남은 시간" value={phase === 'playing' ? `${(timeLeft / 1000).toFixed(1)}초` : '준비'} />
            <HudMini label="베스트" value={`${best.toLocaleString()}점`} />
          </div>
        </div>

        <div className="scene-card">
          <div className={`pressure-banner banner-${pressure.tier}`}>
            <div>
              <strong>{pressure.label}</strong>
              <p>{pressure.subline}</p>
            </div>
            <span>{sceneState.stampText}</span>
          </div>

          <div className="meter-panel slim">
            <div className="meter-copy">
              <strong>FEVER</strong>
              <span>{fever ? 'ON FIRE' : `${Math.round((meter / FEVER_NEED) * 100)}%`}</span>
            </div>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${fever ? 100 : (meter / FEVER_NEED) * 100}%` }} />
            </div>
          </div>

          <div className={`arena scene-${sceneState.mood} aura-${sceneState.aura}`}>
            <div className={`office-backdrop desk-${sceneState.deskTheme}`}>
              <div className="window-row">
                <span />
                <span />
                <span />
              </div>
              <div className={`boss-shadow boss-${sceneState.bossMood}`}>
                <div className="boss-head" />
                <div className="boss-body" />
              </div>
              <div className="office-clock">18:01</div>
              <div className={`stamp-badge ${pressure.tier}`}>{sceneState.stampText}</div>
            </div>

            <div className="desk-layer">
              <div className="monitor">
                <div className="monitor-screen">
                  <span className="headline-tag">실시간 상황</span>
                  <strong>{phase === 'result' ? resultMeta.title : headline}</strong>
                  <p>{sceneState.bubble}</p>
                </div>
              </div>

              <div className={`tap-zone ${tapActive ? 'pressed' : ''}`}>
                {bursts.map((burst) => (
                  <span
                    key={burst.id}
                    className={`burst ${burst.hot ? 'hot' : ''}`}
                    style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
                  >
                    {burst.text}
                  </span>
                ))}

                <Character sceneState={sceneState} tapActive={tapActive} phase={phase} />

                <button
                  className={`tap-core ${tapActive ? 'tap-active' : ''}`}
                  disabled={phase !== 'playing'}
                  onClick={handleTap}
                >
                  <span>퇴사!</span>
                  <small>{phase === 'playing' ? '캐릭터가 내리찍는 중' : '시작 대기'}</small>
                </button>
              </div>
            </div>

            {phase !== 'playing' && (
              <div className="overlay-card scene-overlay">
                {phase === 'ready' ? (
                  <>
                    <strong>사무실 탈출 준비 완료</strong>
                    <h3>캐릭터가 직접 버튼을 박살낸다</h3>
                    <p>탭하면 팔이 내려가고, 상사는 당황하고, 배경도 함께 흔들리게 만들었어.</p>
                    <button className="primary-button" onClick={startGame}>출근 종료 버튼 누르기</button>
                  </>
                ) : (
                  <>
                    <strong>{resultMeta.badge}</strong>
                    <h3>{summary.score.toLocaleString()}점</h3>
                    <p>최대 {summary.maxCombo}콤보 · {summary.taps}회 연타 · 다음 목표 {resultMeta.nextTarget}점</p>
                    <div className="overlay-actions">
                      <button className="primary-button" onClick={startGame}>한 판 더</button>
                      <button className="ghost-button" onClick={copyShare}>{shareCopied ? '복사 완료' : '결과 복사'}</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="hud-bottom">
            <div className="score-strip compact-strip">
              <ScorePill label="탭 수" value={`${liveTaps}`} />
              <ScorePill label="오늘 플레이" value={`${dailyRuns}판`} />
              <ScorePill label="다음 목표" value={missions[0]?.value ?? '960점 돌파'} />
            </div>

            <div className="event-rail compact-events">
              {events.map((event) => {
                const active = elapsed >= event.at
                return (
                  <div key={event.id} className={`event-pill ${active ? 'active' : ''}`}>
                    <span>{event.label}</span>
                    <strong>{active ? '발동' : `${(event.at / 1000).toFixed(1)}초`}</strong>
                  </div>
                )
              })}
            </div>

            <div className="action-row">
              {phase === 'playing' ? (
                <button className="ghost-button wide" onClick={finishGame}>지금 점수 확정</button>
              ) : (
                <button className="ghost-button wide" onClick={copyShare} disabled={!shareText}>
                  {shareCopied ? '복사 완료' : '공유 문구 복사'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="hook-grid compact-hooks">
        <article className="hook-card mission-card">
          <div className="card-head">
            <span>재도전 유도</span>
            <strong>오늘의 미션</strong>
          </div>
          <div className="mission-list">
            {missions.map((mission) => (
              <div key={mission.label} className="mission-item">
                <span>{mission.label}</span>
                <strong>{mission.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="hook-card rival-card">
          <div className="card-head">
            <span>근접 랭킹</span>
            <strong>바로 위 한 명만 추격</strong>
          </div>
          <div className="rival-list">
            {leaderboard.map((entry) => (
              <div key={`${entry.rank}-${entry.name}`} className={`rival-item ${entry.player ? 'player' : ''}`}>
                <div>
                  <span>#{entry.rank}</span>
                  <strong>{entry.name}</strong>
                </div>
                <em>{entry.score.toLocaleString()}점</em>
              </div>
            ))}
          </div>
          {nextRival && (
            <p className="rival-hook">
              다음 목표는 <strong>#{nextRival.rank} {nextRival.name}</strong> · {Math.max(0, nextRival.score - (summary.score || score))}점 차이
            </p>
          )}
        </article>
      </section>
    </div>
  )
}

function HudMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-mini-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ScorePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="score-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Character({ sceneState, tapActive, phase }: { sceneState: SceneState; tapActive: boolean; phase: Phase }) {
  return (
      <div className={`character-wrap mood-${sceneState.mood} face-${sceneState.face} ${tapActive ? 'is-tapping' : ''}`}>
      <div className="speech-bubble">{sceneState.bubble}</div>
      <div className="character">
        <div className="character-head">
          <span className="hair" />
          <span className="eye left" />
          <span className="eye right" />
          <span className="mouth" />
          <span className="blush blush-left" />
          <span className="blush blush-right" />
        </div>
        <div className="character-body">
          <span className="arm back" />
          <span className="arm front" />
          <span className="leg left" />
          <span className="leg right" />
        </div>
        <div className="impact-line impact-1" />
        <div className="impact-line impact-2" />
        <div className="desk-shadow" />
      </div>
      <div className={`tap-hint ${phase === 'playing' ? 'live' : ''}`}>{phase === 'playing' ? '연타!!' : 'READY'}</div>
    </div>
)
}
