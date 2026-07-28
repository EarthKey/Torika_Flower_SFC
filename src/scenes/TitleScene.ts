import Phaser from 'phaser'
import { slotSummary, loadSlot, startNewGame, deleteSlot } from '../state/gameState'
import { options, saveOptions, notifyVolumeChanged, type TypeSpeed } from '../state/options'
import { setHudVisible, showSeasonGateCutin, isGateCutinOpen } from '../ui/hud'
import { playBgm } from '../state/bgm'
import { playSfx } from '../state/sfx'

// タイトル画面（仕様書§7起動フロー・2026-07-18実装）。
// 背景=春の里を暗めに敷き、木札ロゴ＋メニュー（はじめから/つづきから/オプション/？？？）。
// メニューはHTML/CSSオーバーレイ（§7「UIはCanvasの上にHTML/CSSで重ねる」方針）で、
// マウスクリックと矢印キー＋Enter/Spaceの両方で操作できる。

const PANEL_STYLE = `
  background: rgba(38, 24, 12, 0.88);
  border: 3px solid #c9a24a; border-radius: 12px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(20, 12, 6, 0.6);
  padding: 18px 26px; display: flex; flex-direction: column; gap: 10px;
  font-family: monospace; align-items: stretch; min-width: 340px;
`

const BUTTON_STYLE = `
  font-family: monospace; font-size: 26px; color: #f2e6c8;
  background: transparent; border: 2px solid transparent; border-radius: 8px;
  padding: 8px 26px; cursor: pointer; text-align: center; line-height: 1.4;
`

const TYPE_SPEED_LABELS: Record<TypeSpeed, string> = { slow: '遅い', normal: '普通', fast: '速い' }

// テスト用（2026-07-27本人依頼）: trueの間、タイトル画面でQキーを押すたびに
// 季節の門のカットイン（夏→秋→冬の循環）を再生できる。演出は1周のプレイで3回しか
// 見られないため、音・イラストの調整確認用。確認が終わったらfalseに戻すこと
const TEST_CUTIN_PREVIEW = false

export class TitleScene extends Phaser.Scene {
  private root: HTMLDivElement | null = null
  private panel: HTMLDivElement | null = null
  private navButtons: HTMLButtonElement[] = []
  private selected = 0
  private backAction: (() => void) | null = null
  private keyHandler = (e: KeyboardEvent) => this.onKey(e)

  constructor() {
    super('TitleScene')
  }

  create() {
    // 背景: 春の里を暗めに敷き、木札ロゴを浮かべる
    this.add.image(0, 0, 'bg_home').setOrigin(0, 0).setDisplaySize(960, 704)
    this.add.rectangle(480, 352, 960, 704, 0x000000, 0.45)
    const logo = this.add.image(480, 210, 'title_logo')
    logo.setScale(Math.min(680 / logo.width, 300 / logo.height))
    this.tweens.add({
      targets: logo,
      y: 202,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    playBgm(this, 'bgm_title')

    this.buildDom()
    this.showMainMenu()
    window.addEventListener('keydown', this.keyHandler)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.keyHandler)
      this.root?.remove()
      this.root = null
    })
  }

  // ── DOM構築 ──────────────────────────────

  private buildDom() {
    this.root = document.createElement('div')
    this.root.id = 'title-ui'
    this.root.style.cssText = `
      position: fixed; inset: 0; display: flex;
      align-items: flex-end; justify-content: center;
      padding-bottom: 7vh; pointer-events: none; z-index: 15;
    `
    this.panel = document.createElement('div')
    this.panel.style.cssText = PANEL_STYLE + 'pointer-events: auto;'
    this.root.appendChild(this.panel)
    document.body.appendChild(this.root)
  }

  private clearPanel() {
    if (!this.panel) return
    this.panel.innerHTML = ''
    this.navButtons = []
    this.selected = 0
    this.backAction = null
  }

  private addTitle(text: string) {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = 'font-size: 20px; color: #c9a24a; text-align: center; letter-spacing: 4px; margin-bottom: 4px;'
    this.panel?.appendChild(el)
  }

  private addButton(label: string, onSelect: () => void, opts?: { sub?: string; disabled?: boolean }) {
    const btn = document.createElement('button')
    btn.style.cssText = BUTTON_STYLE
    btn.innerHTML = opts?.sub
      ? `<div>${label}</div><div style="font-size:15px;color:#c8b088;margin-top:2px;">${opts.sub}</div>`
      : label
    if (opts?.disabled) {
      btn.style.color = '#7a6a52'
      btn.style.cursor = 'default'
    } else {
      const index = this.navButtons.length
      this.navButtons.push(btn)
      btn.addEventListener('mouseenter', () => this.setSelected(index))
      btn.addEventListener('click', onSelect)
    }
    this.panel?.appendChild(btn)
    return btn
  }

  private setSelected(index: number) {
    this.selected = Phaser.Math.Clamp(index, 0, this.navButtons.length - 1)
    this.navButtons.forEach((btn, i) => {
      const active = i === this.selected
      btn.style.border = active ? '2px solid #e8c86a' : '2px solid transparent'
      btn.style.background = active ? 'rgba(201,162,74,0.18)' : 'transparent'
    })
  }

  private cutinPreviewIndex = 0 // Qキーで夏→秋→冬を循環するテスト再生の現在位置

  private onKey(e: KeyboardEvent) {
    // テスト用のカットイン再生（Qキー・TEST_CUTIN_PREVIEW時のみ）。表示中の再入は抑止
    if (TEST_CUTIN_PREVIEW && (e.key === 'q' || e.key === 'Q') && !isGateCutinOpen()) {
      const seasons = ['summer', 'autumn', 'winter'] as const
      showSeasonGateCutin(seasons[this.cutinPreviewIndex % seasons.length], () => {})
      this.cutinPreviewIndex++
      e.preventDefault()
      return
    }
    if (this.navButtons.length === 0) return
    if (e.key === 'ArrowUp' || e.key === 'w') {
      this.setSelected(this.selected - 1)
      e.preventDefault()
    } else if (e.key === 'ArrowDown' || e.key === 's') {
      this.setSelected(this.selected + 1)
      e.preventDefault()
    } else if (e.key === 'Enter' || e.key === ' ') {
      this.navButtons[this.selected]?.click()
      e.preventDefault()
    } else if (e.key === 'Escape') {
      this.backAction?.()
      e.preventDefault()
    }
  }

  // ── 画面（パネル）ごとの表示 ──────────────────

  private showMainMenu() {
    this.clearPanel()
    const hasAnySave = [1, 2, 3].some((n) => slotSummary(n) !== null)

    this.addButton('はじめから', () => this.showSlotSelect('new'))
    this.addButton('つづきから', () => this.showSlotSelect('continue'), { disabled: !hasAnySave })
    this.addButton('オプション', () => this.showOptions())
    this.addButton('？？？', () => this.showGalleryNotice())
    this.setSelected(0)
  }

  private slotLabel(slot: number): string {
    const s = slotSummary(slot)
    if (!s) return '―― あたらしい旅 ――'
    const date = s.lastPlayedMs
      ? new Date(s.lastPlayedMs).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '---'
    return `薬×${s.kusuri}　メダル×${s.medalTotal}　種×${s.seedTotal}　（${date}）`
  }

  private showSlotSelect(mode: 'new' | 'continue') {
    this.clearPanel()
    this.addTitle(mode === 'new' ? 'どのスロットではじめる？' : 'どのスロットのつづきから？')
    for (const slot of [1, 2, 3]) {
      const summary = slotSummary(slot)
      const disabled = mode === 'continue' && summary === null
      this.addButton(`スロット${slot}`, () => {
        if (mode === 'continue') {
          this.startGame(() => loadSlot(slot))
        } else if (summary === null) {
          this.startGame(() => startNewGame(slot), true)
        } else {
          this.showOverwriteConfirm(slot)
        }
      }, { sub: this.slotLabel(slot), disabled })
    }
    this.addButton('もどる', () => this.showMainMenu())
    this.setSelected(0)
    this.backAction = () => this.showMainMenu()
  }

  private showOverwriteConfirm(slot: number) {
    this.clearPanel()
    this.addTitle(`スロット${slot}のデータを消して、新しくはじめますか？`)
    this.addButton('やめる', () => this.showSlotSelect('new'))
    this.addButton('データを消してはじめる', () => this.startGame(() => startNewGame(slot), true))
    this.setSelected(0) // 誤操作防止のため「やめる」を初期選択にする
    this.backAction = () => this.showSlotSelect('new')
  }

  private showOptions() {
    this.clearPanel()
    this.addTitle('オプション')
    const speedBtn = this.addButton('', () => {
      const order: TypeSpeed[] = ['slow', 'normal', 'fast']
      options.typeSpeed = order[(order.indexOf(options.typeSpeed) + 1) % order.length]
      saveOptions()
      render()
    })
    const zoomBtn = this.addButton('', () => {
      options.zoomDefault = !options.zoomDefault
      saveOptions()
      render()
    })
    // 音量（BGM/SE別・§7準拠）。クリックで0→25→50→75→100%を循環。実際の音はBGM/SE実装後に鳴る
    const cycleVolume = (v: number) => (v >= 1 ? 0 : Math.round((v + 0.25) * 100) / 100)
    const bgmBtn = this.addButton('', () => {
      options.bgmVolume = cycleVolume(options.bgmVolume)
      saveOptions()
      notifyVolumeChanged()
      render()
    })
    const seBtn = this.addButton('', () => {
      options.seVolume = cycleVolume(options.seVolume)
      saveOptions()
      notifyVolumeChanged()
      playSfx('volumeCheck') // 変更後の音量で試聴音を鳴らす（2026-07-27本人指示・7つ目のSE）
      render()
    })
    const render = () => {
      speedBtn.innerHTML = `文字送りの速さ：${TYPE_SPEED_LABELS[options.typeSpeed]}`
      zoomBtn.innerHTML = `画面表示：${options.zoomDefault ? 'ズーム（酉花を追う）' : '全体（マップ全景）'}`
      bgmBtn.innerHTML = `BGM音量：${Math.round(options.bgmVolume * 100)}%`
      seBtn.innerHTML = `SE音量：${Math.round(options.seVolume * 100)}%`
    }
    render()
    this.addButton('セーブデータを消す', () => this.showDeleteSelect())
    this.addButton('もどる', () => this.showMainMenu())
    this.setSelected(0)
    this.backAction = () => this.showMainMenu()
  }

  // オプション > セーブデータ削除: 消すスロットを選ぶ（空きは選べない）
  private showDeleteSelect() {
    this.clearPanel()
    this.addTitle('どのスロットのデータを消しますか？')
    for (const slot of [1, 2, 3]) {
      const summary = slotSummary(slot)
      this.addButton(`スロット${slot}`, () => this.showDeleteConfirm(slot), {
        sub: this.slotLabel(slot),
        disabled: summary === null,
      })
    }
    this.addButton('もどる', () => this.showOptions())
    this.setSelected(0)
    this.backAction = () => this.showOptions()
  }

  private showDeleteConfirm(slot: number) {
    this.clearPanel()
    this.addTitle(`スロット${slot}のデータを完全に消しますか？（元に戻せません）`)
    this.addButton('やめる', () => this.showDeleteSelect())
    this.addButton('データを消す', () => {
      deleteSlot(slot)
      this.showDeleteSelect()
    })
    this.setSelected(0) // 誤操作防止のため「やめる」を初期選択にする
    this.backAction = () => this.showDeleteSelect()
  }

  private showGalleryNotice() {
    this.clearPanel()
    this.addTitle('？？？')
    const note = document.createElement('div')
    note.textContent = '―― 後日追加予定 ――'
    note.style.cssText = 'font-size: 22px; color: #f2e6c8; text-align: center; padding: 8px 0 4px;'
    this.panel?.appendChild(note)
    this.addButton('もどる', () => this.showMainMenu())
    this.setSelected(0)
    this.backAction = () => this.showMainMenu()
  }

  // intro=true（はじめから）のときは、開始直後にトリカ本人のチュートリアル会話を流す
  private startGame(prepare: () => unknown, intro = false) {
    prepare()
    this.root?.remove()
    this.root = null
    this.navButtons = []
    setHudVisible(true)
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('HomeScene', { intro })
    })
  }
}
