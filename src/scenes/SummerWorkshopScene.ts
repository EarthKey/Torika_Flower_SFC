import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast, showRecipePicker } from '../ui/hud'
import { tryCompound, RECIPES, type Recipe, type SeedKind } from '../state/gameState'
import { WARP_ARRIVAL, WORKSHOP_WALK_MASK } from './WorkshopScene'

// 夏の工房内部（ステージ2）。koubou_summer.webpをそのまま床に敷く一枚絵背景モード。
// 部屋の構造は春の工房と共通（下中央出入口・中央調合台・四隅にワープ転送陣）。
// 転送陣は「各季節の工房の中」同士を結ぶネットワーク（§9-8）で、
// 四隅の配置は 左上=春（ピンク）/右上=夏（青）/左下=秋（黄）/右下=冬（緑）（2026-07-19本人確認）。
//
// 当たり判定は春の工房のマスク（WORKSHOP_WALK_MASK）を共用（2026-07-20本人判断:
// 部屋構造が同じため専用トレースはしない）。転送陣の座標も春と同じ四隅。
// 調合台・レシピ本・メダル器は夏レシピ実装時に追加する。NPCアウンは本人確定の
// 「工房の中」配置で、春のシャオランと同じ位置(16,6)に配置（2026-07-20）

const COLS = 30
const ROWS = 22

// 調合台の作業マス（春の工房と同じ位置。2026-07-20本人指示で調合マークも同じ場所に配置。
// 調合機能そのものは夏レシピ実装時にWorkshopScene方式で有効化する）
const ACTION_CELLS = [
  { row: 5, col: 14 },
  { row: 5, col: 15 },
]

// レシピ数式パネルの位置合わせに使う基準点（2026-07-20本人指示でメダルの器の演出は廃止。
// 理由は春のWorkshopSceneと同じ＝処方が増えるほど固定3種の器だけでは矛盾が生じるため。
// 「何が作れるか」は調合台を調べたときのレシピ選択ウインドウで十分に伝わる）
const PANEL_ANCHOR = { row: 7, colLeft: 13, colRight: 17 }

// 机の上に描かれている開いた本（クリックでレシピを開閉する。春の工房と同じ配置）
const BOOK_POS = { row: 8, col: 18 }

// 完成薬を演出で見せる位置（春の工房と同じく器のあいだ）
const SHELF = { row: 7, col: 14 }

// 四隅の転送陣（座標は春の工房koubou.jsonの値を仮流用。左上=春/右上=夏/左下=秋/右下=冬）
const WARP_PADS = [
  { season: '春', tex: 'warp_pink', row: 10, col: 11, exit: { targetScene: 'WorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '夏', tex: 'warp_blue', row: 10, col: 18, exit: null }, // ここが夏の工房（現在地）
  { season: '秋', tex: 'warp_yellow', row: 13, col: 11, exit: null }, // 秋の工房（未実装）
  { season: '冬', tex: 'warp_green', row: 13, col: 18, exit: null }, // 冬の工房（未実装）
] as const

export class SummerWorkshopScene extends GridScene {
  private recipeGroup!: Phaser.GameObjects.Container
  private recipeOpen = false

  constructor() {
    super(
      'SummerWorkshopScene',
      { type: 'image', textureKey: 'bg_summer_workshop', cols: COLS, rows: ROWS, walkMask: WORKSHOP_WALK_MASK },
      15,
      19,
    )
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {
      // 下端: 夏の里へ戻る（里側は工房入口(11,21)のすぐ下の縦通路(12,21)に出現）
      '20,14': { exit: { targetScene: 'SummerHomeScene', spawnCol: 21, spawnRow: 12 } },
      '20,15': { exit: { targetScene: 'SummerHomeScene', spawnCol: 21, spawnRow: 12 } },
    }
    for (const pad of WARP_PADS) {
      specs[`${pad.row},${pad.col}`] = pad.exit
        ? { exit: pad.exit }
        : pad.season === '夏'
          ? { data: { message: 'ここは夏の工房の転送陣。今いる場所だ' } }
          : { data: { message: `${pad.season}の転送陣はまだ固く封印されている……` } }
    }
    // 調合台の作業マス（春のWorkshopSceneと同じくレシピ選択ウインドウを開く）
    for (const cell of ACTION_CELLS) {
      specs[`${cell.row},${cell.col}`] = { data: { kind: 'workshopTable' } }
    }
    return specs
  }

  protected onEnter(spec: CellSpec) {
    const data = spec.data as { message?: string } | undefined
    if (data?.message) showMessage(data.message)
  }

  protected onReady() {
    // 工房BGMは全季節共通トラック。playBgmは同じ曲なら流しっぱなしにするため、
    // 転送陣で工房間をワープしても途切れない（2026-07-18仕様）
    playBgm(this, 'bgm_koubou')

    // 四隅の転送陣（春=開通アニメ、夏=現在地として明るく静止、秋冬=封印の薄暗表示）
    const animatedPads: { img: Phaser.GameObjects.Image; tex: string }[] = []
    for (const pad of WARP_PADS) {
      const img = this.add.image(pad.col * 32 + 16, pad.row * 32 + 16, `${pad.tex}_1`)
      this.fitImage(img, 46)
      img.setDepth(3)
      if (pad.exit) animatedPads.push({ img, tex: pad.tex })
      else if (pad.season !== '夏') img.setAlpha(0.35)
    }
    // 調合マーク（浮かぶ光るすり鉢・16コマ）。春の工房と同じく作業マス2つの中央上空に表示
    const markX = ((ACTION_CELLS[0].col + ACTION_CELLS[1].col) / 2) * 32 + 16
    const mark = this.add.image(markX, ACTION_CELLS[0].row * 32 - 6, 'mark_compound_1')
    this.fitImage(mark, 42)
    mark.setDepth(8)

    let effectFrame = 1
    this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        effectFrame = (effectFrame % 16) + 1
        for (const pad of animatedPads) pad.img.setTexture(`${pad.tex}_${effectFrame}`)
        mark.setTexture(`mark_compound_${effectFrame}`)
      },
    })

    // アウンは工房内配置（本人確定）。春のシャオランと同じ立ち位置(16,6)
    this.addNpc('aum', 16, 6)

    // レシピの数式パネル（初期状態は閉じている。本をクリックすると開閉）
    this.buildRecipePanel()

    // 机の上の本をクリックで開閉できるようにする
    const bookZone = this.add
      .rectangle(BOOK_POS.col * 32 + 16, BOOK_POS.row * 32 + 16, 44, 40, 0xffffff, 0)
      .setDepth(6)
      .setInteractive({ useHandCursor: true })
    bookZone.on('pointerdown', () => {
      this.suppressClickMove = true
      this.toggleRecipe()
    })

    updateHud()
    showMessage('矢印キー/WASD/クリックで移動。机の本をクリックでレシピ表示、机の奥に回り込んでSpaceキーを押して調合')
  }

  // レシピ本: 覚えている全処方の数式を縦に並べる（春夏問わずRECIPES全体を表示。
  // 処方追加はRECIPESに足すだけで両方の工房に反映される）
  private buildRecipePanel() {
    const rowH = 40
    const panelWidth = 320
    const panelHeight = rowH * RECIPES.length + 8
    const y = PANEL_ANCHOR.row * 32 - 26 - (panelHeight - 40) / 2
    const centerX = ((PANEL_ANCHOR.colLeft + PANEL_ANCHOR.colRight) / 2) * 32 + 16
    const textStyle = { fontFamily: 'monospace', fontSize: '13px', color: '#f2e6c8' }

    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x141210, 0.82).setStrokeStyle(1, 0x8a6a3a)
    const items: Phaser.GameObjects.GameObject[] = [bg]

    RECIPES.forEach((recipe, row) => {
      const rowY = -panelHeight / 2 + rowH / 2 + 4 + row * rowH
      let x = -panelWidth / 2 + 14
      const cost = Object.entries(recipe.cost) as [SeedKind, number][]
      cost.forEach(([kind, n], i) => {
        const img = this.add.image(x + 14, rowY, `medal_${kind}`)
        this.fitImage(img, 26)
        items.push(img)
        x += 30
        items.push(this.add.text(x, rowY, `×${n}`, textStyle).setOrigin(0, 0.5))
        x += 26
        if (i < cost.length - 1) {
          items.push(this.add.text(x, rowY, '＋', textStyle).setOrigin(0, 0.5))
          x += 20
        }
      })
      items.push(this.add.text(x, rowY, '＝', textStyle).setOrigin(0, 0.5))
      x += 22
      const kusuriIcon = this.add.image(x + 12, rowY, `kusuri_${recipe.id}`)
      this.fitImage(kusuriIcon, 26)
      items.push(kusuriIcon)
    })

    this.recipeGroup = this.add.container(centerX, y, items)
    this.recipeGroup.setDepth(15)
    this.recipeGroup.setVisible(false)
  }

  private toggleRecipe() {
    this.recipeOpen = !this.recipeOpen
    this.recipeGroup.setVisible(this.recipeOpen)
  }

  // 調合台: レシピ選択ウインドウを開き、選んだ処方の調合を試みる（春のWorkshopSceneと同じ方式）
  protected onAction(spec: CellSpec | undefined) {
    const data = spec?.data as { kind?: string } | undefined
    if (data?.kind !== 'workshopTable') return
    showRecipePicker((recipe) => this.compound(recipe))
  }

  private compound(recipe: Recipe) {
    const ok = tryCompound(recipe)
    if (ok) {
      this.playCompoundMovie(() => {
        showToast(`${recipe.name}（${recipe.ruby}） ×1`, recipe.icon)
        showMessage(`${recipe.name}（${recipe.ruby}）が完成した！`)
        this.playCompleteEffect()
      })
    } else {
      showMessage('メダルが足りない')
    }
    updateHud()
  }

  // 調合成功のカットインムービー（春のWorkshopSceneと同じ演出・同じ動画素材を再利用）
  private playCompoundMovie(onEnd: () => void) {
    const cx = (30 * 32) / 2
    const cy = (22 * 32) / 2
    const backdrop = this.add
      .rectangle(cx, cy, 30 * 32, 22 * 32, 0x000000, 0.65)
      .setDepth(29)
      .setInteractive()
    const vw = 304
    const vh = 232
    const frame = this.add.rectangle(cx, cy, vw + 8, vh + 8).setStrokeStyle(4, 0xc9a24a).setDepth(30)
    const vid = this.add.video(cx, cy, 'compound_movie').setDepth(30)
    vid.setDisplaySize(vw, vh)
    vid.play(false)

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      vid.destroy()
      frame.destroy()
      backdrop.destroy()
      onEnd()
    }
    vid.on(Phaser.GameObjects.Events.VIDEO_COMPLETE, finish)
    backdrop.on('pointerdown', finish)
    vid.setInteractive()
    vid.on('pointerdown', finish)
  }

  // 調合成功: 発光スティックが完成薬置き場に現れ、ふわっと浮かんで消える（所持品へ入る）
  private playCompleteEffect() {
    const glow = this.addCellImage(SHELF.row, SHELF.col, 'kusuri_glow', 90)
    glow.setDepth(20)
    this.tweens.add({
      targets: glow,
      y: glow.y - 40,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      delay: 500,
      onComplete: () => glow.destroy(),
    })
  }
}
