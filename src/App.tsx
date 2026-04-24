import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  buildMissionSet,
  buildResultMeta,
  buildRivals,
  getPressureState,
  STORAGE_KEY,
  type GamePhase,
} from './game'

type LiveState = {
  phase: GamePhase
  score: number
  combo: number
  timeLeft: number
  meter: number
  fever: boolean
  headline: string
  latestEventLabel: string | null
  taps: number
  maxCombo: number
}

const READY_STATE: LiveState = {
  phase: 'ready',
  score: 0,
  combo: 0,
  timeLeft: 10_000,
  meter: 0,
  fever: false,
  headline: '퇴사 도장을 연타해서 사무실을 탈출하세요',
  latestEventLabel: null,
  taps: 0,
  maxCombo: 0,
}

export default function App() {
  const phaserRootRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<{ destroy: (removeCanvas: boolean, noReturn?: boolean) => void; scene: { keys: Record<string, unknown> } } | null>(null)
  const [live, setLive] = useState<LiveState>(READY_STATE)
  const [best, setBest] = useState(0)
  const [dailyRuns, setDailyRuns] = useState(0)
  const [shareCopied, setShareCopied] = useState(false)
  const [result, setResult] = useState(() => buildResultMeta({ score: 0, best: 0, taps: 0, maxCombo: 0 }))

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { best?: number; dailyRuns?: number }
      setBest(saved.best ?? 0)
      setDailyRuns(saved.dailyRuns ?? 0)
    } catch {
      setBest(0)
      setDailyRuns(0)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best, dailyRuns }))
  }, [best, dailyRuns])

  useEffect(() => {
    if (!phaserRootRef.current) return

    let disposed = false

    void import('./phaserGame').then(({ createQuitPowerGame }) => {
      if (disposed || !phaserRootRef.current) return

      gameRef.current = createQuitPowerGame(phaserRootRef.current, {
        onUpdate: setLive,
        onFinish: (snapshot) => {
          const next = buildResultMeta({
            score: snapshot.score,
            best,
            taps: snapshot.taps,
            maxCombo: snapshot.maxCombo,
          })
          setResult(next)
          setBest((current) => Math.max(current, snapshot.score))
          setDailyRuns((current) => current + 1)
          setLive(snapshot)
        },
      })
    })

    return () => {
      disposed = true
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [best])

  const pressure = useMemo(
    () => getPressureState({ timeLeft: live.timeLeft, combo: live.combo, feverActive: live.fever }),
    [live.combo, live.fever, live.timeLeft],
  )
  const missions = useMemo(() => buildMissionSet(best || 940), [best])
  const leaderboard = useMemo(() => buildRivals((live.phase === 'result' ? live.score : best) || 420), [best, live.phase, live.score])
  const nextRival = leaderboard[1]
  const shareText = useMemo(() => {
    if (!live.score) return ''
    return `퇴사력 키우기 ${live.score}점 · ${result.badge} · 상위 ${100 - result.percentile}% · 최대 콤보 ${live.maxCombo}`
  }, [live.maxCombo, live.score, result.badge, result.percentile])

  function startGame() {
    const scene = gameRef.current?.scene.keys.QuitPowerScene as { startRound?: () => void } | undefined
    scene?.startRound?.()
    setShareCopied(false)
  }

  async function copyShare() {
    if (!shareText) return
    await navigator.clipboard.writeText(shareText)
    setShareCopied(true)
    window.setTimeout(() => setShareCopied(false), 1400)
  }

  return (
    <div className="app-shell">
      <header className="hero-strip">
        <div>
          <span className="hero-chip">Phaser 전환 완료</span>
          <h1>퇴사력 키우기</h1>
          <p>이제는 React 웹페이지가 아니라, Phaser 캔버스 위에서 캐릭터가 퇴사 도장을 직접 내리찍는 구조야.</p>
        </div>
        <div className="hero-stats">
          <StatCard label="오늘 베스트" value={`${best.toLocaleString()}점`} />
          <StatCard label="오늘 플레이" value={`${dailyRuns}판`} />
        </div>
      </header>

      <section className="game-layout">
        <div className="game-frame">
          <div className={`top-banner tier-${pressure.tier}`}>
            <strong>{pressure.label}</strong>
            <span>{live.phase === 'playing' ? `${(live.timeLeft / 1000).toFixed(1)}초` : 'READY'}</span>
          </div>

          <div ref={phaserRootRef} className="phaser-root" />

          {live.phase !== 'playing' && (
            <div className="overlay-panel">
              {live.phase === 'ready' ? (
                <>
                  <span className="overlay-chip">OFFICE COMEDY CLICKER</span>
                  <h2>퇴사 도장을 박살내서 탈출</h2>
                  <p>캐릭터 액션, 상사 반응, 화면 흔들림, 팝 텍스트를 Phaser 씬으로 옮겼어. 이제 진짜 게임 형태로 갈 수 있다.</p>
                  <button className="primary-button" onClick={startGame}>바로 시작</button>
                </>
              ) : (
                <>
                  <span className="overlay-chip hot">{result.badge}</span>
                  <h2>{live.score.toLocaleString()}점</h2>
                  <p>{result.comment}</p>
                  <div className="overlay-actions">
                    <button className="primary-button" onClick={startGame}>한 판 더</button>
                    <button className="secondary-button" onClick={copyShare}>{shareCopied ? '복사 완료' : '결과 복사'}</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="side-panel">
          <div className="hud-card big">
            <span>현재 퇴사력</span>
            <strong>{live.score.toLocaleString()}</strong>
            <p>{live.headline}</p>
          </div>

          <div className="hud-grid">
            <StatCard label="콤보" value={`${live.combo}`} />
            <StatCard label="탭 수" value={`${live.taps}`} />
            <StatCard label="FEVER" value={`${live.fever ? 'ON' : `${Math.round(live.meter)}%`}`} />
            <StatCard label="최대 콤보" value={`${live.maxCombo}`} />
          </div>

          <div className="hud-card">
            <span>오늘의 미션</span>
            <ul>
              {missions.map((mission) => (
                <li key={mission.label}><strong>{mission.label}</strong><em>{mission.value}</em></li>
              ))}
            </ul>
          </div>

          <div className="hud-card">
            <span>바로 위 한 명만 추격</span>
            <div className="leaderboard">
              {leaderboard.map((entry) => (
                <div key={`${entry.rank}-${entry.name}`} className={`leader-row ${entry.player ? 'player' : ''}`}>
                  <strong>#{entry.rank} {entry.name}</strong>
                  <em>{entry.score.toLocaleString()}점</em>
                </div>
              ))}
            </div>
            {nextRival && <p className="rival-copy">다음 목표: #{nextRival.rank} {nextRival.name}</p>}
          </div>

          {live.latestEventLabel && <div className="event-flash">최근 이벤트: {live.latestEventLabel}</div>}
        </aside>
      </section>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
