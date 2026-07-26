import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast, showRecipePicker, showCompoundMovie } from '../ui/hud'
import { tryCompound, RECIPES, type Recipe, type SeedKind, type Season } from '../state/gameState'
import { WARP_ARRIVAL } from './WorkshopScene'

// 冬の工房内部（ステージ4）。Koubou_winter.webpをそのまま床に敷く一枚絵背景モード。
//
// 2026-07-25: 本人がstage-mapperでトレースした Koubou_winter.json（D:\...\V2）を全面採用。
// 冬の工房も装飾強化のため再生成しており、秋とも部屋の形が微妙に違う（全体が約1マス右にずれている）。
// トレースの紫マス: (5,13)(5,14)=調合台、四隅の(10,12)(10,17)(13,12)(13,17)=転送陣。
// ※転送陣は2026-07-26に本人指示で左右へ1マスずつ広げ、(10,11)(10,18)(13,11)(13,18)へ移動済み。
// 緑マス(20,13)〜(20,16)=里への出口。
// 四隅の転送陣は「今いる場所=冬」として自陣扱いにし、春夏秋の3陣へ接続する。

const COLS = 30
const ROWS = 22

// Koubou_winter.json（2026-07-25・本人トレース）のmaskをそのまま採用
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############################', // r2
  '##############################', // r3
  '##############################', // r4
  '#########.........############', // r5 調合台の作業マス(c13-14)
  '#########.####################', // r6
  '#######...####################', // r7
  '#######...####################', // r8
  '#######...####################', // r9
  '###................###########', // r10 転送陣 春(c12)/夏(c17)
  '########...........###########', // r11
  '########...........###########', // r12
  '########..............########', // r13 転送陣 秋(c12)/冬(c17)
  '########..............########', // r14
  '####..................########', // r15
  '####..................########', // r16 ハヤテの立ち位置(16,6)
  '####..................########', // r17
  '#############....#############', // r18
  '#############....#############', // r19
  '#############....#############', // r20 下端=冬の里への出口
  '##############################', // r21
]

const ACTION_CELLS = [
  { row: 5, col: 13 },
  { row: 5, col: 14 },
]
const PANEL_ANCHOR = { row: 7, colLeft: 13, colRight: 17 }
// レシピ本は背景画像から実測した机の上の開いた本の位置（2026-07-25。秋より1マス右）
const BOOK_POS = { row: 8, col: 17 }
const SHELF = { row: 7, col: 14 }

// 四隅の転送陣（トレースの紫マス）。冬=現在地として明るく静止、春夏秋は開通済み
// （冬に来られている＝3ステージ踏破済みのため）。
// 2026-07-26本人指示で左右へ1マスずつ広げた（春・秋 c12→c11 ／ 夏・冬 c17→c18）。
// 移動先8マスがWALK_MASK上で通行可能（'.'）であることは確認済み
const WARP_PADS = [
  { season: '春', tex: 'warp_pink', row: 10, col: 11, exit: { targetScene: 'WorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '夏', tex: 'warp_blue', row: 10, col: 18, exit: { targetScene: 'SummerWorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '秋', tex: 'warp_yellow', row: 13, col: 11, exit: { targetScene: 'AutumnWorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '冬', tex: 'warp_green', row: 13, col: 18, exit: null }, // ここが冬の工房（現在地）
] as const

export class WinterWorkshopScene extends GridScene {
  protected sceneSeason: Season = 'winter'
  private recipeGroup!: Phaser.GameObjects.Container
  private recipeOpen = false

  constructor() {
    super(
      'WinterWorkshopScene',
      { type: 'image', textureKey: 'bg_winter_workshop', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      14,
      19,
    )
  }

  protected specials(): Record<string, CellSpec> {
    // 里側の工房入口が(10,20)のため、戻り先はその1マス下の縦通路。出口はトレースどおり4マス
    const specs: Record<string, CellSpec> = {}
    for (const col of [13, 14, 15, 16]) {
      specs[`20,${col}`] = { exit: { targetScene: 'WinterHomeScene', spawnCol: 20, spawnRow: 11 } }
    }
    for (const pad of WARP_PADS) {
      specs[`${pad.row},${pad.col}`] = pad.exit
        ? { exit: pad.exit }
        : { data: { message: 'ここは冬の工房の転送陣。今いる場所だ' } }
    }
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
    playBgm(this, 'bgm_koubou')

    const animatedPads: { img: Phaser.GameObjects.Image; tex: string }[] = []
    for (const pad of WARP_PADS) {
      const img = this.add.image(pad.col * 32 + 16, pad.row * 32 + 16, `${pad.tex}_1`)
      this.fitImage(img, 46)
      img.setDepth(3)
      if (pad.exit) animatedPads.push({ img, tex: pad.tex })
    }

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

    // ハヤテは工房内配置（伊賀の師匠役。春のシャオラン・夏のアウン・秋の柴と同じ立ち位置）
    this.addNpc('hayate', 16, 6)

    this.buildRecipePanel()

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

  protected onAction(spec: CellSpec | undefined) {
    const data = spec?.data as { kind?: string } | undefined
    if (data?.kind !== 'workshopTable') return
    showRecipePicker((recipe) => this.compound(recipe))
  }

  private compound(recipe: Recipe) {
    const ok = tryCompound(recipe)
    if (ok) {
      showCompoundMovie(() => {
        showToast(`${recipe.name}（${recipe.ruby}） ×1`, recipe.icon)
        showMessage(`${recipe.name}（${recipe.ruby}）が完成した！`)
        this.playCompleteEffect()
      })
    } else {
      showMessage('メダルが足りない')
    }
    updateHud()
  }

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
