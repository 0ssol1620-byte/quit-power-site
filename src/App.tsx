import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  buildMissionSet,
  buildResultMeta,
  buildRivals,
  getPressureState,
  getTapOutcome,
  type RivalEntry,
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
const STORAGE_KEY = 'quit-power-site-v2'

function createEvents(): GameEvent[] {
  const pool: Omit<GameEvent, 'id' | 'at'>[] = [
    { kind: 'team-call', label: '팀장 호출', copy: '분노 에너지로 바꿔서 밀어!', boost: 14 },
    { kind: 'lunch', label: '점심시간', copy: '손이 빨라지는 버프', boost: 22, bonus: 40 },
    { kind: 'payday', label: '월급날', copy: '현타가 점수로 변환됨', boost: 16, bonus: 90 },
    { kind: 'overtime', label: '야근 지옥', copy: '이번엔 꼭 탈출한다', boost: 18 },
    { kind: 'freedom', label: '칼퇴 찬스', copy: '클러치 직전 폭발 구간', boost: 26, bonus: 60 },
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

  const pressure = useMemo(
    () => getPressureState({ timeLeft, combo, feverActive: fever }),
    [combo, fever, timeLeft],
  )

  const missions = useMemo(() => buildMissionSet(best || 940), [best])

  const leaderboard = useMemo<RivalEntry[]>(() => buildRivals(summary.score || best || 420), [best, summary.score])

  const nextRival = leaderboard[1]

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
      const elapsed = now - started
      const left = Math.max(0, ROUND_MS - elapsed)

      timeLeftRef.current = left
      setTimeLeft(left)

      eventsRef.current.forEach((event) => {
        if (processedRef.current.has(event.id) || elapsed < event.at) return

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

  const elapsed = ROUND_MS - timeLeft

  return (
    <div className="page-shell">
      <header className="title-block">
        <span className="mini-chip">10초 중독성 미니게임</span>
        <h1>퇴사력 키우기</h1>
        <p>
          이해는 1초, 플레이는 10초, 재도전은 즉시. 마지막 3초의 퇴사각과 FEVER를 중심으로 한 판 더 누르게 만드는 구조로 재설계했어.
        </p>
      </header>

      <section className={`game-shell tier-${pressure.tier} ${fever ? 'is-fever' : ''}`}>
        <div className="status-row">
          <StatusCard label="오늘 베스트" value={`${best.toLocaleString()}점`} accent />
          <StatusCard label="플레이" value={`${dailyRuns}판`} />
          <StatusCard label="다음 목표" value={`${missions[0]?.value ?? '960점 돌파'}`} />
        </div>

        <div className={`pressure-banner banner-${pressure.tier}`}>
          <div>
            <strong>{pressure.label}</strong>
            <p>{pressure.subline}</p>
          </div>
          <span>{phase === 'playing' ? `${(timeLeft / 1000).toFixed(1)}초` : '준비 완료'}</span>
        </div>

        <div className="meter-panel">
          <div className="meter-copy">
            <strong>FEVER 게이지</strong>
            <span>{fever ? 'ON FIRE' : `${Math.round((meter / FEVER_NEED) * 100)}%`}</span>
          </div>
          <div className="meter-track">
            <div
              className="meter-fill"
              style={{ width: `${fever ? 100 : (meter / FEVER_NEED) * 100}%` }}
            />
          </div>
        </div>

        <div className="arena-panel">
          <div className="arena-copy">
            <span className="headline-tag">{phase === 'playing' ? '실시간 상태' : phase === 'result' ? resultMeta.badge : '플레이 전'}</span>
            <h2>{phase === 'result' ? resultMeta.title : headline}</h2>
            <p>
              {phase === 'playing'
                ? '버튼을 연타해 콤보를 끊기지 않게 유지해. 마지막 3초엔 점수가 더 크게 뛴다.'
                : phase === 'result'
                  ? resultMeta.comment
                  : '초반엔 리듬, 중반엔 FEVER, 마지막엔 퇴사각. 이 3단계를 타게 만들면 재도전률이 올라간다.'}
            </p>
          </div>

          <div className="score-strip">
            <ScorePill label="퇴사력" value={score.toLocaleString()} />
            <ScorePill label="콤보" value={`${combo}`} />
            <ScorePill label="탭 수" value={`${phase === 'playing' ? tapsRef.current : summary.taps}`} />
          </div>

          <div className="arena">
            <div className="ring ring-1" />
            <div className="ring ring-2" />
            <div className="ring ring-3" />

            {bursts.map((burst) => (
              <span
                key={burst.id}
                className={`burst ${burst.hot ? 'hot' : ''}`}
                style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
              >
                {burst.text}
              </span>
            ))}

            <button
              className={`tap-core ${tapActive ? 'tap-active' : ''}`}
              disabled={phase !== 'playing'}
              onClick={handleTap}
            >
              <span>퇴사!</span>
              <small>{phase === 'playing' ? '연타해서 탈출' : '준비 버튼'}</small>
            </button>

            {phase !== 'playing' && (
              <div className="overlay-card">
                {phase === 'ready' ? (
                  <>
                    <strong>손맛 설계 완료</strong>
                    <h3>초반 리듬 + FEVER + 마지막 3초 클러치</h3>
                    <p>버튼 하나만 누르지만, 체감은 계속 올라가게 만들었다. 바로 시작해서 손맛부터 보자.</p>
                    <button className="primary-button" onClick={startGame}>지금 바로 시작</button>
                  </>
                ) : (
                  <>
                    <strong>{resultMeta.badge}</strong>
                    <h3>{summary.score.toLocaleString()}점</h3>
                    <p>최대 {summary.maxCombo}콤보 · 상위 {100 - resultMeta.percentile}% · 다음 목표 {resultMeta.nextTarget}점</p>
                    <div className="overlay-actions">
                      <button className="primary-button" onClick={startGame}>한 판 더</button>
                      <button className="ghost-button" onClick={copyShare}>{shareCopied ? '복사 완료' : '결과 복사'}</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="event-rail">
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
      </section>

      <section className="hook-grid">
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
            <strong>바로 위만 보이게</strong>
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

function StatusCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`status-card ${accent ? 'accent' : ''}`}>
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
