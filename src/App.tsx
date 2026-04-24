import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Phase = 'ready' | 'playing' | 'result'
type EventKind = 'team-call' | 'lunch' | 'payday' | 'overtime' | 'freedom'

type Burst = { id: number; bornAt: number; x: number; y: number; text: string; hot?: boolean }

type Entry = { rank: number; name: string; score: number; player?: boolean }

const ROUND_MS = 10_000
const FEVER_MS = 2_400
const FEVER_NEED = 100
const COMBO_WINDOW = 220
const STORAGE_KEY = 'quit-power-site-v1'
const RIVALS = ['칼퇴요정', '월급헌터', '퇴근직진', '회의실탈출러', '점심스프린터']

function createEvents() {
  const pool: { kind: EventKind; label: string; boost: number; bonus?: number; mult?: number }[] = [
    { kind: 'team-call', label: '팀장 호출', boost: 10, mult: 0.2 },
    { kind: 'lunch', label: '점심시간', boost: 18, mult: 1 },
    { kind: 'payday', label: '월급날', boost: 14, bonus: 80 },
    { kind: 'overtime', label: '야근 지옥', boost: 12, mult: 0.5 },
    { kind: 'freedom', label: '칼퇴 찬스', boost: 24, mult: 1.5 },
  ]
  return pool
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((event, i) => ({ ...event, id: `${event.kind}-${i}`, at: [1800, 4300, 7200][i] }))
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
  const [headline, setHeadline] = useState('10초 안에 당신의 퇴사력을 증명하세요')
  const [bursts, setBursts] = useState<Burst[]>([])
  const [events, setEvents] = useState<ReturnType<typeof createEvents>>([])
  const [shareCopied, setShareCopied] = useState(false)
  const [summary, setSummary] = useState({ score: 0, taps: 0, maxCombo: 0, percentile: 52 })

  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const lastTapRef = useRef(0)
  const scoreRef = useRef(0)
  const tapsRef = useRef(0)
  const comboRef = useRef(0)
  const maxComboRef = useRef(0)
  const meterRef = useRef(0)
  const feverUntilRef = useRef(0)
  const processedRef = useRef(new Set<string>())
  const burstIdRef = useRef(1)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      setBest(saved.best ?? 0)
      setDailyRuns(saved.dailyRuns ?? 0)
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best, dailyRuns }))
  }, [best, dailyRuns])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const leaderboard = useMemo<Entry[]>(() => {
    const playerScore = summary.score || best || 420
    const rank = Math.max(7, 22 - Math.floor(playerScore / 140))
    return [-2, -1, 0, 1, 2].map((offset, index) => {
      const rivalScore = offset === 0 ? playerScore : playerScore + (offset < 0 ? Math.abs(offset) * 40 : -offset * 38)
      return {
        rank: rank + offset,
        name: offset === 0 ? '나' : RIVALS[(rank + index) % RIVALS.length],
        score: rivalScore,
        player: offset === 0,
      }
    })
  }, [best, summary.score])

  const shareText = useMemo(() => {
    if (!summary.score) return ''
    return `퇴사력 키우기 ${summary.score}점 · 상위 ${100 - summary.percentile}% · 최대 콤보 ${summary.maxCombo}`
  }, [summary])

  function pushBurst(text: string, hot = false) {
    const burst: Burst = {
      id: burstIdRef.current++,
      bornAt: performance.now(),
      x: 44 + Math.random() * 12,
      y: 42 + Math.random() * 10,
      text,
      hot,
    }
    setBursts((current) => [...current, burst].slice(-18))
  }

  function startGame() {
    setPhase('playing')
    setScore(0)
    setCombo(0)
    setMeter(0)
    setFever(false)
    setHeadline('버튼을 연타해서 퇴사력을 폭발시키세요')
    setBursts([])
    setShareCopied(false)
    setEvents(createEvents())
    processedRef.current = new Set()
    startedAtRef.current = performance.now()
    lastTapRef.current = 0
    scoreRef.current = 0
    tapsRef.current = 0
    comboRef.current = 0
    maxComboRef.current = 0
    meterRef.current = 0
    feverUntilRef.current = 0
    setTimeLeft(ROUND_MS)

    const tick = (now: number) => {
      const started = startedAtRef.current ?? now
      const elapsed = now - started
      const left = Math.max(0, ROUND_MS - elapsed)
      setTimeLeft(left)

      events.forEach((event) => {
        if (processedRef.current.has(event.id) || elapsed < event.at) return
        processedRef.current.add(event.id)
        setHeadline(event.label)
        pushBurst(event.label, true)
        if (event.bonus) {
          scoreRef.current += event.bonus
          setScore(scoreRef.current)
        }
        const nextMeter = Math.min(FEVER_NEED, meterRef.current + event.boost)
        meterRef.current = nextMeter
        setMeter(nextMeter)
        if (nextMeter >= FEVER_NEED) triggerFever(now)
      })

      const isFever = now < feverUntilRef.current
      setFever(isFever)

      setBursts((current) => current.filter((burst) => now - burst.bornAt < 700))

      if (left <= 0) {
        endGame()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  function triggerFever(now: number) {
    feverUntilRef.current = now + FEVER_MS
    meterRef.current = 0
    setMeter(0)
    setFever(true)
    setHeadline('FEVER 발동 — 지금이 기록 갱신 타이밍')
    pushBurst('FEVER', true)
  }

  function handleTap() {
    if (phase !== 'playing') return
    const now = performance.now()
    const comboNow = now - lastTapRef.current <= COMBO_WINDOW ? comboRef.current + 1 : 1
    const feverOn = now < feverUntilRef.current
    const gain = 1 + (comboNow >= 12 ? 1 : 0) + (comboNow >= 24 ? 1 : 0) + (feverOn ? 2 : 0)

    lastTapRef.current = now
    comboRef.current = comboNow
    maxComboRef.current = Math.max(maxComboRef.current, comboNow)
    tapsRef.current += 1
    scoreRef.current += gain

    const nextMeter = Math.min(FEVER_NEED, meterRef.current + Math.min(18, 8 + Math.floor(comboNow / 3)))
    meterRef.current = nextMeter

    setScore(scoreRef.current)
    setCombo(comboNow)
    setMeter(nextMeter)
    setHeadline(comboNow >= 20 ? '퇴사력 폭주 중' : comboNow >= 10 ? '콤보 유지 중' : '더 빠르게 연타하세요')
    pushBurst(`+${gain}`, feverOn)

    if (nextMeter >= FEVER_NEED && !feverOn) triggerFever(now)
  }

  function endGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const finalScore = scoreRef.current
    const percentile = Math.min(99, Math.max(52, Math.round(48 + finalScore / 18)))
    setSummary({ score: finalScore, taps: tapsRef.current, maxCombo: maxComboRef.current, percentile })
    setBest((prev) => Math.max(prev, finalScore))
    setDailyRuns((prev) => prev + 1)
    setHeadline(finalScore > best ? '새 베스트 달성 — 지금 한 판 더' : '베스트까지 조금만 더')
    setPhase('result')
  }

  async function copyShare() {
    if (!shareText) return
    await navigator.clipboard.writeText(shareText)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 1500)
  }

  return (
    <div className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">APPS IN TOSS READY MINI GAME</span>
          <h1>퇴사력 키우기</h1>
          <p className="lead">
            직장인 공감을 유머로 풀어낸 10초 캐주얼 탭 게임. 버튼을 연타해 퇴사력을 쌓고, 피버와 근접 랭킹으로 한 판 더 하게 만드는 구조를 검증합니다.
          </p>
          <div className="hero-badges">
            <span>10초 루프</span>
            <span>근접 랭킹</span>
            <span>피버/이벤트</span>
            <span>모바일 우선</span>
          </div>
          <div className="hero-actions">
            <button className="primary" onClick={startGame}>{phase === 'playing' ? '플레이 중' : phase === 'result' ? '다시 플레이' : '바로 해보기'}</button>
            <button className="secondary" onClick={copyShare}>{shareCopied ? '복사 완료' : '공유 문구 복사'}</button>
          </div>
          <div className="hero-metrics">
            <Metric label="오늘 베스트" value={best.toLocaleString()} />
            <Metric label="오늘 플레이" value={`${dailyRuns}판`} />
            <Metric label="상위권 목표" value={leaderboard[1] ? `#${leaderboard[1].rank}` : '-'} />
          </div>
        </div>

        <div className={`phone ${fever ? 'fever' : ''}`}>
          <div className="phone-bar"><span>9:41</span><span>5G · 100%</span></div>
          <div className="phone-stage">
            <div className="hud-row">
              <Stat label="퇴사력" value={score.toLocaleString()} />
              <Stat label="콤보" value={`${combo}`} />
              <Stat label="남은 시간" value={`${(timeLeft / 1000).toFixed(1)}초`} />
            </div>

            <div className="meter-block">
              <div className="meter-head"><span>FEVER</span><span>{fever ? 'ON' : `${Math.round((meter / FEVER_NEED) * 100)}%`}</span></div>
              <div className="meter-track"><div className="meter-fill" style={{ width: `${fever ? 100 : (meter / FEVER_NEED) * 100}%` }} /></div>
            </div>

            <p className="headline">{headline}</p>

            <div className="arena">
              {bursts.map((burst) => (
                <span
                  key={burst.id}
                  className={`burst ${burst.hot ? 'hot' : ''}`}
                  style={{ left: `${burst.x}%`, top: `${burst.y}%`, transform: `translate(-50%, -${(performance.now() - burst.bornAt) / 14}px)` }}
                >
                  {burst.text}
                </span>
              ))}

              <button className="tap-core" onClick={handleTap} disabled={phase !== 'playing'}>
                <span>{phase === 'playing' ? '퇴사' : phase === 'result' ? '한 판 더' : '시작'}</span>
                <small>{phase === 'playing' ? '버튼 연타' : '10초 도전'}</small>
              </button>
            </div>

            <div className="cta-row">
              {phase !== 'playing' ? (
                <button className="primary wide" onClick={startGame}>{phase === 'result' ? '즉시 재도전' : '게임 시작'}</button>
              ) : (
                <button className="secondary wide" onClick={endGame}>지금 종료하고 점수 보기</button>
              )}
            </div>

            <div className="result-strip">
              <span>최대 콤보 {summary.maxCombo}</span>
              <span>상위 {100 - summary.percentile}%</span>
              <span>{shareText || '플레이 후 공유 문구 생성'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <Panel title="왜 이 구조가 맞나" description="토스 인앱용 게임은 짧은 루프, 즉시 피드백, 가까운 랭킹 동기가 핵심입니다.">
          <ul className="bullet-list">
            <li>첫 터치 3초 내 규칙 이해</li>
            <li>10초 라운드로 한 세션 3판 이상 유도</li>
            <li>피버/이벤트로 손맛과 변주 제공</li>
            <li>결과 화면에서 바로 위 라이벌을 보여 재도전 유도</li>
          </ul>
        </Panel>

        <Panel title="근접 랭킹 프리뷰" description="도달 가능한 바로 위 점수를 보여주는 것이 전역 1위보다 재도전률이 높습니다.">
          <div className="leaderboard">
            {leaderboard.map((entry) => (
              <div key={`${entry.rank}-${entry.name}`} className={`entry ${entry.player ? 'player' : ''}`}>
                <div>
                  <strong>#{entry.rank} {entry.name}</strong>
                  <p>{entry.player ? '당신의 현재 위치' : `${entry.score - summary.score > 0 ? '+' : ''}${entry.score - summary.score}점 차이`}</p>
                </div>
                <span>{entry.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="출시 전 체크리스트" description="게임 자체가 완성된 다음 앱인토스 제출 자산과 mTLS 연동으로 넘어가는 순서가 효율적입니다.">
          <ul className="bullet-list">
            <li>게임 루프/카피/결과 화면 polish</li>
            <li>세로 스크린샷 3장 + 가로 썸네일 1장</li>
            <li>앱 이름: 퇴사력 키우기 / 부제: 10초 만에 퇴사력 측정</li>
            <li>그 다음에만 mTLS 인증서 발급 및 SDK 연동</li>
          </ul>
        </Panel>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <article className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </article>
  )
}
