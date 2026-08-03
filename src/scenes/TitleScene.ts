import Phaser from 'phaser'
import { slotSummary, loadSlot, startNewGame, deleteSlot } from '../state/gameState'
import {
  GALLERY_ILLUSTS,
  GALLERY_MEMORIES,
  GALLERY_SOUNDS,
  ZUKAN_LIST,
  scanGalleryProgress,
  anyGalleryUnlocked,
  type GalleryItem,
  type GalleryProgress,
} from '../state/galleryData'
import { options, saveOptions, notifyVolumeChanged, type TypeSpeed } from '../state/options'
import { setHudVisible, showSeasonGateCutin, isGateCutinOpen } from '../ui/hud'
import { playBgm, stopBgm } from '../state/bgm'
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
      this.closeGalleryViewer()
      this.stopSoundTest(false)
      this.galleryEl?.remove()
      this.galleryEl = null
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
    // ギャラリー表示中は矢印キー等を裏のメニューに通さない。Escapeは手前の層から順に閉じる
    if (this.galleryEl) {
      if (e.key === 'Escape') {
        if (this.galleryViewerEl) this.closeGalleryViewer()
        else this.closeGallery()
        e.preventDefault()
      }
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
    // 1点でも解放されるまでは「？？？」のまま、以降は正体を明かして「ギャラリー」表記（設計書§1）
    const galleryLabel = anyGalleryUnlocked(scanGalleryProgress()) ? 'ギャラリー' : '？？？'
    this.addButton(galleryLabel, () => this.showGallery())
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

  // ── ギャラリー（2026-08-03設計書・タブ3枚: ムービー/おもいで/にんじゃ図鑑） ──────
  // タイトルの小パネルには収まらないため、専用の全画面オーバーレイで表示する。
  // 未解放の枠は「？？？」で、タップすると解放条件が見られる（本人指示）。
  // 解放判定は開いた瞬間に3スロットを走査（galleryData.scanGalleryProgress）

  private galleryEl: HTMLDivElement | null = null
  private galleryViewerEl: HTMLDivElement | null = null
  private galleryTab: 'movie' | 'memory' | 'sound' | 'zukan' = 'movie'
  private soundTestAudio: HTMLAudioElement | null = null // サウンドタブの試聴プレイヤー
  private soundTestKey: string | null = null

  private showGallery() {
    if (this.galleryEl) return
    const progress = scanGalleryProgress()
    // ギャラリー中は種の聖域のBGMへ切り替える（2026-08-03本人指示）。もどるとタイトル曲へ復帰
    playBgm(this, 'bgm_seed')
    if (this.root) this.root.style.display = 'none'
    const el = document.createElement('div')
    this.galleryEl = el
    el.id = 'gallery-ui'
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 30; display: flex;
      align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.72); font-family: monospace;
    `
    document.body.appendChild(el)
    this.renderGallery(progress)
  }

  private renderGallery(progress: GalleryProgress) {
    const el = this.galleryEl
    if (!el) return

    const tabBtn = (key: typeof this.galleryTab, label: string) => {
      const active = this.galleryTab === key
      return `<button data-tab="${key}" style="
        font-family: monospace; font-size: 18px; cursor: pointer;
        color: ${active ? '#2a1c0c' : '#f2e6c8'};
        background: ${active ? '#c9a24a' : 'transparent'};
        border: 2px solid ${active ? '#e8c86a' : '#8a6a3a'};
        border-radius: 8px; padding: 6px 18px;
      ">${label}</button>`
    }

    // 収録アイテムのセル。解放済み=サムネ＋タイトル／未解放=🔒？？？（タップで条件表示）
    const itemCell = (item: GalleryItem) => {
      if (!item.unlocked(progress)) {
        return `
          <div data-locked="${item.id}" style="cursor: pointer;">
            <div style="width: 100%; aspect-ratio: 3/2; border: 2px solid #5a4c34; border-radius: 8px;
              background: rgba(20,14,8,0.85); display: flex; flex-direction: column;
              align-items: center; justify-content: center; gap: 4px; color: #7a6a52;">
              <div style="font-size: 22px;">🔒</div>
              <div style="font-size: 16px; letter-spacing: 2px;">？？？</div>
            </div>
            <div style="font-size: 13px; color: #7a6a52; text-align: center; margin-top: 5px;">？？？</div>
          </div>`
      }
      return `
        <div data-item="${item.id}" style="cursor: pointer;">
          <div style="position: relative; width: 100%; aspect-ratio: 3/2; border: 2px solid #c9a24a;
            border-radius: 8px; overflow: hidden; background: #1a120a;
            display: flex; align-items: center; justify-content: center;">
            <img src="${item.thumb}" data-fallback style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;">
            ${item.kind === 'video' ? `<div style="position: absolute; right: 6px; bottom: 4px; font-size: 18px; text-shadow: 0 1px 4px #000;">▶</div>` : ''}
          </div>
          <div style="font-size: 13px; color: #f2e6c8; text-align: center; margin-top: 5px; line-height: 1.3;">${item.title}</div>
        </div>`
    }

    // 図鑑のセル。未遭遇は顔グラを黒シルエットにして名前も伏せる
    const zukanCell = (entry: (typeof ZUKAN_LIST)[number]) => {
      const unlocked = entry.unlocked(progress)
      return `
        <div data-zukan="${entry.chara}" data-zukan-unlocked="${unlocked}" style="cursor: pointer;">
          <div style="width: 100%; aspect-ratio: 1/1; border: 2px solid ${unlocked ? '#c9a24a' : '#5a4c34'};
            border-radius: 8px; overflow: hidden; background: rgba(20,14,8,0.85);
            display: flex; align-items: center; justify-content: center;">
            <img src="assets/chara/${entry.chara}_face_1.png" data-fallback style="width: 82%; height: 82%;
              object-fit: contain; image-rendering: pixelated;
              ${unlocked ? '' : 'filter: brightness(0); opacity: 0.55;'}">
          </div>
          <div style="font-size: 13px; color: ${unlocked ? '#f2e6c8' : '#7a6a52'}; text-align: center; margin-top: 5px;">
            ${unlocked ? entry.name : '？？？'}
          </div>
        </div>`
    }

    // サウンドタブの行。解放済みは「▶ 再生 / ⏸ 停止」、未解放は🔒（タップで条件表示）
    const soundRow = (s: (typeof GALLERY_SOUNDS)[number]) => {
      const unlocked = s.unlocked(progress)
      const playing = this.soundTestKey === s.key
      if (!unlocked) {
        return `
          <div data-sound-locked="${s.key}" style="
            display: flex; align-items: center; gap: 14px; cursor: pointer;
            padding: 10px 16px; border: 2px solid #5a4c34; border-radius: 8px;
            background: rgba(20,14,8,0.85); color: #7a6a52;">
            <div style="font-size: 20px;">🔒</div>
            <div style="font-size: 18px; letter-spacing: 2px;">？？？</div>
          </div>`
      }
      return `
        <div data-sound="${s.key}" style="
          display: flex; align-items: center; gap: 14px; cursor: pointer;
          padding: 10px 16px; border: 2px solid ${playing ? '#e8c86a' : '#c9a24a'}; border-radius: 8px;
          background: ${playing ? 'rgba(201,162,74,0.18)' : 'rgba(40,30,18,0.6)'};">
          <div style="font-size: 20px; width: 24px; text-align: center;">${playing ? '⏸' : '▶'}</div>
          <div style="flex: 1;">
            <div style="font-size: 18px; color: #f2e6c8;">${s.title}</div>
            <div style="font-size: 13px; color: #c8b088; margin-top: 2px;">${s.note}</div>
          </div>
          ${playing ? '<div style="font-size: 13px; color: #ffe9a8;">さいせい中</div>' : ''}
        </div>`
    }

    const isSound = this.galleryTab === 'sound'
    let gridHtml = ''
    if (this.galleryTab === 'movie') gridHtml = GALLERY_ILLUSTS.map(itemCell).join('')
    else if (this.galleryTab === 'memory') gridHtml = GALLERY_MEMORIES.map(itemCell).join('')
    else if (isSound) gridHtml = GALLERY_SOUNDS.map(soundRow).join('')
    else gridHtml = ZUKAN_LIST.map(zukanCell).join('')

    // サウンドだけは1列のリスト表示、他はサムネイルのグリッド
    const listStyle = isSound
      ? 'display: flex; flex-direction: column; gap: 10px;'
      : 'display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px;'
    const hint = isSound
      ? '曲をえらぶと ながれます。もういちどえらぶと とまります'
      : '？？？をえらぶと、ひらくための条件が見られます'

    el.innerHTML = `
      <div style="${PANEL_STYLE} width: min(880px, 94vw); max-height: 86vh; gap: 12px;">
        <div style="font-size: 22px; color: #c9a24a; text-align: center; letter-spacing: 6px;">ギャラリー</div>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          ${tabBtn('movie', 'イラスト')}${tabBtn('memory', 'おもいで')}${tabBtn('sound', 'サウンド')}${tabBtn('zukan', 'にんじゃ図鑑')}
        </div>
        <div style="${listStyle} overflow-y: auto; padding: 4px 2px; flex: 1;">
          ${gridHtml}
        </div>
        <div style="font-size: 13px; color: #c8b088; text-align: center;">${hint}</div>
        <button data-close style="${BUTTON_STYLE} border: 2px solid #8a6a3a;">もどる</button>
      </div>
    `

    // サムネ読み込み失敗（素材が未生成）は「準備中」表示に差し替える
    el.querySelectorAll<HTMLImageElement>('img[data-fallback]').forEach((img) => {
      img.addEventListener('error', () => {
        const ph = document.createElement('div')
        ph.textContent = '準備中'
        ph.style.cssText = 'color: #c8b088; font-size: 14px;'
        img.replaceWith(ph)
      })
    })

    el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.tab as typeof this.galleryTab
        if (next !== 'sound') this.stopSoundTest() // サウンドタブを離れたら試聴を止めてBGMへ戻す
        this.galleryTab = next
        this.renderGallery(progress)
      })
    })

    el.querySelectorAll<HTMLElement>('[data-sound]').forEach((row) => {
      row.addEventListener('click', () => this.toggleSoundTest(row.dataset.sound!, progress))
    })
    el.querySelectorAll<HTMLElement>('[data-sound-locked]').forEach((row) => {
      row.addEventListener('click', () => {
        const s = GALLERY_SOUNDS.find((x) => x.key === row.dataset.soundLocked)
        if (s) this.showGalleryCondition(s.condition)
      })
    })
    el.querySelector('[data-close]')?.addEventListener('click', () => this.closeGallery())

    const allItems = [...GALLERY_ILLUSTS, ...GALLERY_MEMORIES]
    el.querySelectorAll<HTMLElement>('[data-item]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const item = allItems.find((i) => i.id === cell.dataset.item)
        if (item) this.openGalleryViewer(item)
      })
    })
    el.querySelectorAll<HTMLElement>('[data-locked]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const item = allItems.find((i) => i.id === cell.dataset.locked)
        if (item) this.showGalleryCondition(item.condition)
      })
    })
    el.querySelectorAll<HTMLElement>('[data-zukan]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const entry = ZUKAN_LIST.find((z) => z.chara === cell.dataset.zukan)
        if (!entry) return
        if (cell.dataset.zukanUnlocked !== 'true') {
          this.showGalleryCondition('里で出会って、話しかける')
          return
        }
        this.openZukanViewer(entry.chara, entry.name)
      })
    })
  }

  // サウンドタブの試聴（2026-08-03新設「聴く要素」）。
  // 試聴中はギャラリーBGM（bgm_seed）を止めて曲だけを鳴らし、止めたらBGMへ戻す。
  // 音量はオプションのBGM音量×メイン音量に合わせる（HTMLAudioなのでPhaser側の音量が乗らないため）
  private toggleSoundTest(key: string, progress: GalleryProgress) {
    if (this.soundTestKey === key) {
      this.stopSoundTest()
      this.renderGallery(progress)
      return
    }
    this.stopSoundTest(false)
    stopBgm() // 裏のギャラリーBGMを止める（曲が重ならないように）
    const audio = new Audio()
    audio.src = audio.canPlayType('audio/ogg') ? `assets/bgm/${key}.ogg` : `assets/bgm/${key}.m4a`
    audio.loop = true
    audio.volume = Math.min(1, options.bgmVolume * options.masterVolume)
    audio.play().catch(() => {}) // 自動再生が弾かれても操作は続けられるようにする
    this.soundTestAudio = audio
    this.soundTestKey = key
    this.renderGallery(progress)
  }

  private stopSoundTest(restoreBgm = true) {
    if (this.soundTestAudio) {
      this.soundTestAudio.pause()
      this.soundTestAudio.src = ''
      this.soundTestAudio = null
    }
    const wasPlaying = this.soundTestKey !== null
    this.soundTestKey = null
    if (restoreBgm && wasPlaying && this.galleryEl) playBgm(this, 'bgm_seed')
  }

  // にんじゃ図鑑の詳細ビューア（2026-08-03改修・本人指示）。
  // 顔グラ（ドット・9表情のうち1番）と三面図（原画）を横並びで同時に見せる。
  // 三面図は `public/assets/gallery/sheet_<chara>.webp`。未配置なら顔グラだけを大きく出す
  private openZukanViewer(chara: string, name: string) {
    if (this.galleryViewerEl) return
    const v = document.createElement('div')
    this.galleryViewerEl = v
    v.style.cssText = `
      position: fixed; inset: 0; z-index: 35; display: flex; flex-direction: column;
      gap: 12px; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.9); cursor: pointer; font-family: monospace;
    `
    v.innerHTML = `
      <div style="display: flex; gap: 20px; align-items: center; justify-content: center; flex-wrap: wrap;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
          <img src="assets/chara/${chara}_face_1.png" style="width: min(30vh, 260px); height: min(30vh, 260px);
            object-fit: contain; image-rendering: pixelated;
            border: 4px solid #c9a24a; border-radius: 6px; background: rgba(20,14,8,0.9);">
          <div style="font-size: 14px; color: #c8b088;">顔グラフィック</div>
        </div>
        <div data-sheet style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
          <img data-sheet-img src="assets/gallery/sheet_${chara}.webp" style="max-height: min(72vh, 720px);
            max-width: min(58vw, 780px); object-fit: contain;
            border: 4px solid #c9a24a; border-radius: 6px; background: rgba(20,14,8,0.9);">
          <div style="font-size: 14px; color: #c8b088;">三面図</div>
        </div>
      </div>
      <div style="font-size: 20px; color: #ffe9a8;">${name}</div>
      <div style="font-size: 14px; color: #c8b088;">画面のよはくをクリックで もどる</div>
    `
    // 三面図が未配置なら、その枠ごと消して顔グラだけの表示にする
    v.querySelector<HTMLImageElement>('[data-sheet-img]')?.addEventListener('error', () => {
      v.querySelector('[data-sheet]')?.remove()
    })
    v.addEventListener('click', (e) => {
      if (e.target === v) this.closeGalleryViewer()
    })
    document.body.appendChild(v)
  }

  // 解放済みアイテムの全画面ビューア（画像はそのまま・動画はコントロール付きで再生）
  private openGalleryViewer(item: GalleryItem) {
    if (this.galleryViewerEl) return
    const v = document.createElement('div')
    this.galleryViewerEl = v
    v.style.cssText = `
      position: fixed; inset: 0; z-index: 35; display: flex; flex-direction: column;
      gap: 12px; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.9); cursor: pointer; font-family: monospace;
    `
    const pixelated = item.id.startsWith('zukan_') ? 'image-rendering: pixelated;' : ''
    const media =
      item.kind === 'video'
        ? `<video src="${item.asset}" controls autoplay playsinline style="max-width: 92vw; max-height: 76vh;
            border: 4px solid #c9a24a; border-radius: 6px; background: #000;"></video>`
        : `<img src="${item.asset}" style="max-width: 92vw; max-height: 76vh; object-fit: contain; ${pixelated}
            border: 4px solid #c9a24a; border-radius: 6px; background: #000;">`
    v.innerHTML = `
      ${media}
      <div style="font-size: 20px; color: #ffe9a8;">${item.title}</div>
      <div style="font-size: 14px; color: #c8b088;">画面のよはくをクリックで もどる</div>
    `
    // 本体素材が未生成（読み込み失敗）のときは「準備中」に差し替える
    v.querySelector('video, img')?.addEventListener('error', function (this: Element) {
      const ph = document.createElement('div')
      ph.textContent = '―― この作品は ただいま準備中です ――'
      ph.style.cssText = `font-family: monospace; font-size: 20px; color: #f2e6c8;
        padding: 60px 30px; border: 4px solid #8a6a3a; border-radius: 6px;`
      this.replaceWith(ph)
    })
    v.addEventListener('click', (e) => {
      if (e.target === v) this.closeGalleryViewer()
    })
    document.body.appendChild(v)
  }

  private closeGalleryViewer() {
    this.galleryViewerEl?.remove()
    this.galleryViewerEl = null
  }

  // 未解放枠をタップしたときの解放条件ポップアップ（どこをクリックしても閉じる）
  private showGalleryCondition(condition: string) {
    if (this.galleryViewerEl) return
    const v = document.createElement('div')
    this.galleryViewerEl = v
    v.style.cssText = `
      position: fixed; inset: 0; z-index: 35; display: flex;
      align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.7); cursor: pointer; font-family: monospace;
    `
    v.innerHTML = `
      <div style="${PANEL_STYLE} max-width: min(520px, 88vw); text-align: center; gap: 12px;">
        <div style="font-size: 18px; color: #c9a24a;">🔒 ひらくための条件</div>
        <div style="font-size: 19px; color: #f2e6c8; line-height: 1.6;">${condition}</div>
        <div style="font-size: 13px; color: #c8b088;">クリックで とじる</div>
      </div>
    `
    v.addEventListener('click', () => this.closeGalleryViewer())
    document.body.appendChild(v)
  }

  private closeGallery() {
    this.closeGalleryViewer()
    this.stopSoundTest(false) // 試聴中でも止めてからタイトル曲へ
    this.galleryEl?.remove()
    this.galleryEl = null
    playBgm(this, 'bgm_title') // ギャラリーを出たらタイトル曲へ戻す
    if (this.root) this.root.style.display = 'flex'
    this.showMainMenu() // 表記（？？？⇔ギャラリー）を最新の解放状況で引き直す
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
