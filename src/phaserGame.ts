import Phaser from 'phaser'
import {
  buildSceneState,
  createEventSequence,
  FEVER_MS,
  FEVER_NEED,
  getPressureState,
  getTapOutcome,
  ROUND_MS,
  type GameEvent,
  type GamePhase,
} from './game'

type SceneSnapshot = {
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

type SceneCallbacks = {
  onUpdate: (snapshot: SceneSnapshot) => void
  onFinish: (snapshot: SceneSnapshot) => void
}

const GAME_WIDTH = 390
const GAME_HEIGHT = 844

export function createQuitPowerGame(parent: HTMLDivElement, callbacks: SceneCallbacks) {
  const scene = new QuitPowerScene(callbacks)

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    transparent: true,
    backgroundColor: '#120d16',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [scene],
  })
}

class QuitPowerScene extends Phaser.Scene {
  private callbacks: SceneCallbacks
  private phase: GamePhase = 'ready'
  private score = 0
  private combo = 0
  private taps = 0
  private maxCombo = 0
  private meter = 0
  private feverUntil = 0
  private startedAt = 0
  private latestEventLabel: string | null = null
  private timeLeft = ROUND_MS
  private lastTapAt = 0
  private officeEvents: GameEvent[] = []
  private processed = new Set<string>()

  private headlineText!: Phaser.GameObjects.Text
  private bubbleText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private feverFill!: Phaser.GameObjects.Rectangle
  private stampText!: Phaser.GameObjects.Text
  private buttonDisc!: Phaser.GameObjects.Container
  private punchArm!: Phaser.GameObjects.Rectangle
  private character!: Phaser.GameObjects.Container
  private boss!: Phaser.GameObjects.Container
  private officeGlow!: Phaser.GameObjects.Arc

  constructor(callbacks: SceneCallbacks) {
    super('QuitPowerScene')
    this.callbacks = callbacks
  }

  create() {
    this.drawBackdrop()
    this.drawDesk()
    this.drawBoss()
    this.drawCharacter()
    this.drawMonitor()
    this.drawStampButton()
    this.drawHud()
    this.applySceneVisuals(false)
    this.emitSnapshot()
  }

  update(time: number) {
    if (this.phase !== 'playing') return

    const elapsed = time - this.startedAt
    this.timeLeft = Math.max(0, ROUND_MS - elapsed)

    this.officeEvents.forEach((event) => {
      if (this.processed.has(event.id) || elapsed < event.at) return
      this.processed.add(event.id)
      this.latestEventLabel = event.label
      this.score += event.bonus ?? 0
      this.meter = Math.min(FEVER_NEED, this.meter + event.boost)
      this.spawnPop(event.label, true)
      this.setHeadline(`${event.label} · ${event.copy}`)
      if (this.meter >= FEVER_NEED && time >= this.feverUntil) {
        this.triggerFever(time)
      }
    })

    if (this.timeLeft <= 0) {
      this.finishRound()
      return
    }

    this.applySceneVisuals(false)
    this.emitSnapshot()
  }

  startRound() {
    this.phase = 'playing'
    this.score = 0
    this.combo = 0
    this.taps = 0
    this.maxCombo = 0
    this.meter = 0
    this.timeLeft = ROUND_MS
    this.latestEventLabel = null
    this.feverUntil = 0
    this.startedAt = this.time.now
    this.lastTapAt = 0
    this.officeEvents = createEventSequence()
    this.processed = new Set()
    this.setHeadline('퇴사 도장을 연타해서 사무실을 탈출하세요')
    this.spawnPop('START', true)
    this.applySceneVisuals(false)
    this.emitSnapshot()
  }

  tapButton() {
    if (this.phase !== 'playing') return

    const now = this.time.now
    const nextCombo = now - this.lastTapAt <= 220 ? this.combo + 1 : 1
    const feverActive = now < this.feverUntil
    const clutchActive = this.timeLeft <= 3000
    const outcome = getTapOutcome({ combo: nextCombo, feverActive, clutchActive })

    this.lastTapAt = now
    this.combo = nextCombo
    this.taps += 1
    this.maxCombo = Math.max(this.maxCombo, nextCombo)
    this.score += outcome.gain
    this.meter = Math.min(FEVER_NEED, this.meter + outcome.meterGain)

    this.setHeadline(outcome.headline)
    this.playPunchTween(outcome.hot)
    this.spawnPop(`+${outcome.gain}`, outcome.hot)

    if (this.meter >= FEVER_NEED && !feverActive) {
      this.triggerFever(now)
    }

    this.applySceneVisuals(true)
    this.emitSnapshot()
  }

  private triggerFever(now: number) {
    this.feverUntil = now + FEVER_MS
    this.meter = 0
    this.latestEventLabel = 'FEVER'
    this.spawnPop('FEVER', true)
    this.cameras.main.shake(120, 0.004)
    this.setHeadline('FEVER 발동 — 지금이 기록 갱신 구간')
  }

  private finishRound() {
    this.phase = 'result'
    this.timeLeft = 0
    this.applySceneVisuals(false)
    this.emitSnapshot()
    this.callbacks.onFinish(this.getSnapshot())
  }

  private getSnapshot(): SceneSnapshot {
    return {
      phase: this.phase,
      score: this.score,
      combo: this.combo,
      timeLeft: this.timeLeft,
      meter: this.meter,
      fever: this.time.now < this.feverUntil,
      headline: this.headlineText.text,
      latestEventLabel: this.latestEventLabel,
      taps: this.taps,
      maxCombo: this.maxCombo,
    }
  }

  private emitSnapshot() {
    const snapshot = this.getSnapshot()
    this.scoreText.setText(snapshot.score.toLocaleString())
    this.comboText.setText(`${snapshot.combo}`)
    this.timeText.setText(snapshot.phase === 'playing' ? `${(snapshot.timeLeft / 1000).toFixed(1)}s` : 'READY')
    this.feverFill.width = 238 * (snapshot.fever ? 1 : snapshot.meter / FEVER_NEED)
    this.callbacks.onUpdate(snapshot)
  }

  private setHeadline(text: string) {
    this.headlineText.setText(text)
    this.bubbleText.setText(text)
  }

  private applySceneVisuals(tapping: boolean) {
    const pressure = getPressureState({
      timeLeft: this.timeLeft,
      combo: this.combo,
      feverActive: this.time.now < this.feverUntil,
    })
    const sceneState = buildSceneState({
      phase: this.phase,
      pressureTier: pressure.tier,
      feverActive: this.time.now < this.feverUntil,
      tapActive: tapping,
      latestEventLabel: this.latestEventLabel,
    })

    this.stampText.setText(sceneState.stampText)
    this.bubbleText.setText(sceneState.bubble)

    const glowColor = sceneState.aura === 'explosion' ? 0xff5d7f : sceneState.aura === 'spark' ? 0xffd56a : 0x6ce7ff
    this.officeGlow.setFillStyle(glowColor, sceneState.aura === 'soft' ? 0.12 : 0.22)

    this.buttonDisc.setScale(tapping ? 0.95 : 1)
    this.character.y = tapping ? 522 : 516
    this.punchArm.rotation = Phaser.Math.DegToRad(tapping ? 114 : 72)
    this.boss.rotation = Phaser.Math.DegToRad(sceneState.bossMood === 'shout' ? 10 : sceneState.bossMood === 'stunned' ? -10 : 0)
  }

  private playPunchTween(hot: boolean) {
    this.tweens.killTweensOf(this.buttonDisc)
    this.tweens.add({
      targets: this.buttonDisc,
      scaleX: 0.91,
      scaleY: 0.91,
      duration: 50,
      yoyo: true,
    })

    this.cameras.main.shake(hot ? 130 : 70, hot ? 0.006 : 0.003)
  }

  private spawnPop(label: string, hot: boolean) {
    const text = this.add.text(195 + Phaser.Math.Between(-70, 70), 570 + Phaser.Math.Between(-26, 26), label, {
      fontFamily: 'Inter, sans-serif',
      fontSize: hot ? '28px' : '22px',
      fontStyle: '800',
      color: hot ? '#fff5cf' : '#ffe7cc',
      stroke: '#4b1b28',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20)

    this.tweens.add({
      targets: text,
      y: text.y - 80,
      alpha: 0,
      duration: 420,
      onComplete: () => text.destroy(),
    })
  }

  private drawBackdrop() {
    this.add.rectangle(195, 422, 390, 844, 0x17111d)
    this.officeGlow = this.add.circle(195, 332, 200, 0x6ce7ff, 0.12)
    this.add.rectangle(195, 88, 350, 120, 0x283858, 0.45).setStrokeStyle(2, 0x8ed6ff, 0.4)
    this.add.rectangle(195, 196, 350, 120, 0x283858, 0.45).setStrokeStyle(2, 0x8ed6ff, 0.4)
    this.add.rectangle(195, 304, 350, 120, 0x283858, 0.45).setStrokeStyle(2, 0x8ed6ff, 0.4)
    this.add.rectangle(195, 392, 390, 260, 0x291e31, 0.5)
    this.add.rectangle(195, 762, 390, 164, 0x120f16)
  }

  private drawDesk() {
    this.add.rectangle(195, 702, 390, 184, 0x4e3528)
    this.add.rectangle(195, 626, 290, 56, 0x694634).setStrokeStyle(3, 0x2b1713)
    this.add.circle(92, 604, 18, 0xd7f1ff)
    this.add.rectangle(300, 612, 62, 18, 0x1a1f28, 0.9).setStrokeStyle(2, 0x343d49)
    this.add.rectangle(300, 636, 88, 10, 0x272c38)
  }

  private drawBoss() {
    const container = this.add.container(320, 322)
    container.add(this.add.circle(0, 0, 28, 0x100d14, 0.8))
    container.add(this.add.rectangle(0, 72, 86, 112, 0x0e0b11, 0.78).setOrigin(0.5))
    this.boss = container
  }

  private drawCharacter() {
    const container = this.add.container(230, 516)
    const body = this.add.rectangle(0, 52, 102, 118, 0xf8b02e).setOrigin(0.5)
    const head = this.add.circle(0, -16, 42, 0xffd6b1)
    const hair = this.add.ellipse(0, -30, 84, 44, 0x4a3140)
    const armBack = this.add.rectangle(-48, 44, 20, 76, 0xffc29f).setOrigin(0.5).setRotation(Phaser.Math.DegToRad(18))
    this.punchArm = this.add.rectangle(58, 34, 20, 92, 0xffc29f).setOrigin(0.2, 0.1).setRotation(Phaser.Math.DegToRad(72))
    const legLeft = this.add.rectangle(-18, 122, 18, 56, 0xffc29f)
    const legRight = this.add.rectangle(18, 122, 18, 56, 0xffc29f)
    const eyeLeft = this.add.circle(-12, -18, 4, 0x32181c)
    const eyeRight = this.add.circle(12, -18, 4, 0x32181c)
    const mouth = this.add.ellipse(0, 2, 18, 10, 0xbf6370)

    container.add([armBack, body, this.punchArm, legLeft, legRight, head, hair, eyeLeft, eyeRight, mouth])
    this.character = container
  }

  private drawMonitor() {
    this.add.rectangle(110, 448, 140, 108, 0x1a1d26).setStrokeStyle(3, 0x39404d)
    this.add.rectangle(110, 448, 122, 88, 0x173549)
    this.headlineText = this.add.text(52, 420, '10초 안에 퇴사력을 폭발시키세요', {
      fontFamily: 'Inter, sans-serif',
      fontSize: '20px',
      fontStyle: '800',
      color: '#f5fcff',
      wordWrap: { width: 112 },
      lineSpacing: 6,
    })
    this.bubbleText = this.add.text(54, 492, '상사 오기 전에 퇴사 도장부터 박자.', {
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
      color: '#c5edff',
      wordWrap: { width: 108 },
      lineSpacing: 4,
    })
  }

  private drawStampButton() {
    const disc = this.add.circle(195, 692, 92, 0xff8b6b).setStrokeStyle(8, 0xffefc9)
    const inner = this.add.circle(195, 692, 74, 0xffd65e)
    const label = this.add.text(195, 668, '퇴사', {
      fontFamily: 'Inter, sans-serif',
      fontSize: '44px',
      fontStyle: '900',
      color: '#611526',
      stroke: '#fff5d8',
      strokeThickness: 8,
    }).setOrigin(0.5)
    const sub = this.add.text(195, 726, 'STAMP TO ESCAPE', {
      fontFamily: 'Inter, sans-serif',
      fontSize: '13px',
      fontStyle: '800',
      color: '#7e2431',
      letterSpacing: 1,
    }).setOrigin(0.5)

    this.buttonDisc = this.add.container(0, 0, [disc, inner, label, sub]).setSize(184, 184).setInteractive(
      new Phaser.Geom.Circle(195, 692, 92),
      Phaser.Geom.Circle.Contains,
    )
    this.buttonDisc.on('pointerdown', () => this.tapButton())
  }

  private drawHud() {
    this.add.rectangle(100, 46, 152, 74, 0x1a171f, 0.9).setStrokeStyle(2, 0xff9879, 0.6)
    this.add.text(34, 24, '퇴사력', { fontFamily: 'Inter, sans-serif', fontSize: '16px', fontStyle: '700', color: '#ffcdb0' })
    this.scoreText = this.add.text(34, 44, '0', { fontFamily: 'Inter, sans-serif', fontSize: '34px', fontStyle: '900', color: '#fff8eb' })

    this.add.rectangle(280, 42, 164, 34, 0x1a171f, 0.9)
    this.add.rectangle(280, 84, 164, 34, 0x1a171f, 0.9)
    this.add.text(218, 30, '콤보', { fontFamily: 'Inter, sans-serif', fontSize: '13px', fontStyle: '700', color: '#b9d8ff' })
    this.comboText = this.add.text(272, 26, '0', { fontFamily: 'Inter, sans-serif', fontSize: '18px', fontStyle: '900', color: '#ffffff' })
    this.add.text(218, 72, '남은 시간', { fontFamily: 'Inter, sans-serif', fontSize: '13px', fontStyle: '700', color: '#ffd7a3' })
    this.timeText = this.add.text(284, 68, 'READY', { fontFamily: 'Inter, sans-serif', fontSize: '18px', fontStyle: '900', color: '#ffffff' })

    this.add.rectangle(195, 118, 266, 28, 0x1c1620, 0.9)
    this.feverFill = this.add.rectangle(72, 118, 0, 16, 0x74efff).setOrigin(0, 0.5)
    this.feverFill.setFillStyle(0x74efff)
    this.add.text(72, 107, 'FEVER', { fontFamily: 'Inter, sans-serif', fontSize: '12px', fontStyle: '800', color: '#defcff' })
    this.stampText = this.add.text(270, 107, '워밍업', { fontFamily: 'Inter, sans-serif', fontSize: '12px', fontStyle: '800', color: '#ffe5a5' })
  }
}
