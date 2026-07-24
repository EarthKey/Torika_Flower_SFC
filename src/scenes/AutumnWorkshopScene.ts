import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast, showRecipePicker, showCompoundMovie } from '../ui/hud'
import { tryCompound, RECIPES, type Recipe, type SeedKind, type Season } from '../state/gameState'
import { WARP_ARRIVAL, WORKSHOP_WALK_MASK } from './WorkshopScene'

// 秋の工房内部（ステージ3）。Koubou_autum.webpをそのまま床に敷く一枚絵背景モード。
// 2026-07-24仮組み: 部屋の構造は春・夏と共通という前提で、当たり判定は春の工房のマスクを
// そのまま仮流用する（Day17で夏の工房が春のマスクを共用したのと同じ判断）。
// 調合台・レシピ本は春・夏と同じ位置に配置。四隅の転送陣は「今いる場所=秋」として自陣扱いにする。

const COLS = 30
const ROWS = 22

// 2026-07-24本人指示: 調合台・転送陣を実機評で1マス左へ移動（判定も追従）
const ACTION_CELLS = [
  { row: 5, col: 13 },
  { row: 5, col: 14 },
]
const PANEL_ANCHOR = { row: 7, colLeft: 13, colRight: 17 }
const BOOK_POS = { row: 8, col: 18 }
const SHELF = { row: 7, col: 14 }

// 四隅の転送陣（座標は春の工房と同じ仮流用から1マス左へ調整）。秋=現在地として明るく静止、冬=未実装で封印表示
const WARP_PADS = [
  { season: '春', tex: 'warp_pink', row: 10, col: 10, exit: { targetScene: 'WorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '夏', tex: 'warp_blue', row: 10, col: 17, exit: { targetScene: 'SummerWorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '秋', tex: 'warp_yellow', row: 13, col: 10, exit: null }, // ここが秋の工房（現在地）
  { season: '冬', tex: 'warp_green', row: 13, col: 17, exit: null }, // 冬の工房（未実装）
] as const

export class AutumnWorkshopScene extends GridScene {
  protected sceneSeason: Season = 'autumn'
  private recipeGroup!: Phaser.GameObjects.Container
  private recipeOpen = false

  constructor() {
    super(
      'AutumnWorkshopScene',
      { type: 'image', textureKey: 'bg_autumn_workshop', cols: COLS, rows: ROWS, walkMask: WORKSHOP_WALK_MASK },
      15,
      19,
    )
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {
      // 里側の工房入口が(11,23)のため、戻り先も同じ縦通路(23)の1マス下に更新（2026-07-24）
      '20,14': { exit: { targetScene: 'AutumnHomeScene', spawnCol: 23, spawnRow: 12 } },
      '20,15': { exit: { targetScene: 'AutumnHomeScene', spawnCol: 23, spawnRow: 12 } },
    }
    for (const pad of WARP_PADS) {
      specs[`${pad.row},${pad.col}`] = pad.exit
        ? { exit: pad.exit }
        : pad.season === '秋'
          ? { data: { message: 'ここは秋の工房の転送陣。今いる場所だ' } }
          : { data: { message: `${pad.season}の転送陣はまだ固く封印されている……` } }
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
      else if (pad.season !== '秋') img.setAlpha(0.35)
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

    // 柴は工房内配置（本人指定・2026-07-24）。春のシャオラン・夏のアウンと同じ立ち位置(16,6)
    this.addNpc('shiba', 16, 6)

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
