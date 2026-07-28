import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast, showRecipePicker, showCompoundMovie } from '../ui/hud'
import { tryCompound, RECIPES, stageUnlocks, recipeVisibleInUi, type Recipe, type SeedKind, type Season } from '../state/gameState'
import { WARP_ARRIVAL } from './WorkshopScene'

// 秋の工房内部（ステージ3）。Koubou_autum.webpをそのまま床に敷く一枚絵背景モード。
//
// 2026-07-25: 本人がstage-mapperでトレースした Koubou_autum.json（D:\...\V2）を全面採用。
// 秋の工房は装飾強化のため再生成した結果、春・夏とは部屋の形が変わっていたので、
// これまで流用していた春のマスク（WORKSHOP_WALK_MASK）をやめて専用マスクを持つ。
// トレースの紫マス: (5,13)(5,14)=調合台、四隅の(10,11)(10,16)(13,11)(13,16)=転送陣。
// ※転送陣は2026-07-26に本人指示で左右へ1マスずつ広げ、(10,10)(10,17)(13,10)(13,17)へ移動済み。
// 緑マス(20,12)〜(20,15)=里への出口。

const COLS = 30
const ROWS = 22

// Koubou_autum.json（2026-07-25・本人トレース）のmaskをそのまま採用
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############################', // r2
  '##############################', // r3
  '##############################', // r4
  '########.........#############', // r5 調合台の作業マス(c13-14)
  '########..####################', // r6
  '########..####################', // r7
  '########..####################', // r8
  '###.......####################', // r9
  '#######...........############', // r10 転送陣 春(c11)/夏(c16)
  '#######...........############', // r11
  '#######...........############', // r12
  '#######..............#########', // r13 転送陣 秋(c11)/冬(c16)
  '#######..............#########', // r14
  '####.................#########', // r15
  '####.................#########', // r16 柴の立ち位置(16,6)
  '####.................#########', // r17
  '############....##############', // r18
  '############....##############', // r19
  '############....##############', // r20 下端=秋の里への出口
  '##############################', // r21
]

const ACTION_CELLS = [
  { row: 5, col: 13 },
  { row: 5, col: 14 },
]
const PANEL_ANCHOR = { row: 7, colLeft: 13, colRight: 17 }
// レシピ本は背景画像から実測した机の上の開いた本の位置（2026-07-25。春の(8,18)から移動）
const BOOK_POS = { row: 8, col: 16 }
const SHELF = { row: 7, col: 14 }

// 四隅の転送陣（トレースの紫マス）。秋=現在地として明るく静止、冬はstageUnlocks.winterで動的に接続。
// 2026-07-26本人指示で左右へ1マスずつ広げた（春・秋 c11→c10 ／ 夏・冬 c16→c17）。
// 移動先8マスがWALK_MASK上で通行可能（'.'）であることは確認済み
const WARP_PADS = [
  { season: '春', tex: 'warp_pink', row: 10, col: 10, exit: { targetScene: 'WorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '夏', tex: 'warp_blue', row: 10, col: 17, exit: { targetScene: 'SummerWorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '秋', tex: 'warp_yellow', row: 13, col: 10, exit: null }, // ここが秋の工房（現在地）
  { season: '冬', tex: 'warp_green', row: 13, col: 17, exit: null }, // stageUnlocks.winterで動的に接続（下のseasonExit参照）
] as const

// 冬の工房は季節の門の解放（stageUnlocks.winter）と連動して開通する（SummerWorkshopScene.seasonExitと同じ方式・2026-07-25）
function seasonExit(season: string): { targetScene: string; spawnCol: number; spawnRow: number } | null {
  if (season === '冬' && stageUnlocks.winter)
    return { targetScene: 'WinterWorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row }
  return null
}

export class AutumnWorkshopScene extends GridScene {
  protected sceneSeason: Season = 'autumn'
  private recipeGroup!: Phaser.GameObjects.Container
  private recipeOpen = false

  constructor() {
    super(
      'AutumnWorkshopScene',
      { type: 'image', textureKey: 'bg_autumn_workshop', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      14,
      19,
    )
  }

  protected specials(): Record<string, CellSpec> {
    // 里側の工房入口が(11,23)のため、戻り先は同じ縦通路(23)の1マス下。出口はトレースどおり4マス
    const specs: Record<string, CellSpec> = {}
    for (const col of [12, 13, 14, 15]) {
      specs[`20,${col}`] = { exit: { targetScene: 'AutumnHomeScene', spawnCol: 23, spawnRow: 12 } }
    }
    for (const pad of WARP_PADS) {
      const exit = pad.exit ?? seasonExit(pad.season)
      specs[`${pad.row},${pad.col}`] = exit
        ? { exit }
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
      if (pad.exit ?? seasonExit(pad.season)) animatedPads.push({ img, tex: pad.tex })
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
    const visibleRecipes = RECIPES.filter(recipeVisibleInUi) // 未到達の季節の処方は載せない（2026-07-27）
    const panelHeight = rowH * visibleRecipes.length + 8
    const y = PANEL_ANCHOR.row * 32 - 26 - (panelHeight - 40) / 2
    const centerX = ((PANEL_ANCHOR.colLeft + PANEL_ANCHOR.colRight) / 2) * 32 + 16
    const textStyle = { fontFamily: 'monospace', fontSize: '13px', color: '#f2e6c8' }

    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x141210, 0.82).setStrokeStyle(1, 0x8a6a3a)
    const items: Phaser.GameObjects.GameObject[] = [bg]

    visibleRecipes.forEach((recipe, row) => {
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
    if (this.recipeOpen) {
      // 開くたびに作り直す。滞在中に門の解放や初調合で載せられる処方が変わるため（2026-07-27）
      this.recipeGroup.destroy()
      this.buildRecipePanel()
    }
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
