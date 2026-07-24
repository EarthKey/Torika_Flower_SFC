import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { tryCompound, stageUnlocks, RECIPES, type Recipe, type SeedKind } from '../state/gameState'
import { updateHud, showMessage, showToast, showRecipePicker, showCompoundMovie } from '../ui/hud'
import { playBgm } from '../state/bgm'

// 工房内部。既存のコンセプト画（koubou.webp）をそのまま床に敷く一枚絵背景モード。
// 中央の調合台（画像に描かれた机）の右にある本をクリックするとレシピの数式が開く（常時表示はしない）。
// 完成した薬は演出のあと所持品（HUDの個数）に入る。
// 2026-07-20本人指示: 机の上に生薬メダルの器を置く演出は廃止した。処方が増えるほど
// 必要なメダルの種類も増えるため、固定3種の器だけを置くと「これだけで作れる」ように
// 誤解される矛盾が生じるため。「何が作れるか」は調合台（乳鉢）を調べたときに開く
// レシピ選択ウインドウ（showRecipePicker・所持数に応じて明暗表示）で十分に伝わる

const COLS = 30
const ROWS = 22

// 出入口（下端中央、扉の隙間）
const DOOR_COL = 15
const DOOR_ROW = 20

// ワープで工房へ来たときの到着地点＝床の魔法陣模様の中央（2026-07-18実測修正: (12,15)→(12,14)）。
// ステージ2以降のワープ実装で spawnCol/spawnRow として使う（転送陣ネットワーク用）
export const WARP_ARRIVAL = { row: 12, col: 14 }

// 里の工房入口(11,21)から徒歩で入ったときの出現地点＝下端の扉のすぐ内側（2026-07-18修正:
// 従来はWARP_ARRIVALを流用していたが、徒歩入場は入口前に出るのが自然なため分離）
export const DOOR_ENTRY = { row: 19, col: 15 }

// 調合台（画像中央の机）に立って操作する位置。マッピングツールでのトレース結果、
// カウンターの裏側（北側）から調合する配置と判明したため、そちらを正とする
const ACTION_CELLS = [
  { row: 5, col: 14 },
  { row: 5, col: 15 },
]

// レシピ数式パネルの位置合わせに使う基準点（旧・器の位置をそのまま流用。机の上のこのあたりに
// パネルが浮かぶ、というレイアウト用の目安であり、メダル画像はもう重ねて表示しない）
const PANEL_ANCHOR = { row: 7, colLeft: 13, colRight: 17 }

// 机の上に描かれている開いた本（クリックでレシピを開閉する）
const BOOK_POS = { row: 8, col: 18 }

// 完成薬を演出で見せる位置（2026-07-19実機評で移動: 旧・右側の布敷きの台(14,25)→調合台の机の上）。
// メダルの器（r7・c13/15/17）のあいだ、調合位置のトリカ(r5)の手前に出る
const SHELF = { row: 7, col: 14 }

// ステージワープの転送陣（仕様書§9-8・2026-07-17）。マッピングツールで塗った中央の部屋の
// 四隅（koubou.json 2026-07-17版）に4色を配置。工房は春夏秋冬で4つ用意する予定で、
// 転送陣は「各季節の工房の中」同士を結ぶネットワーク（2026-07-18確定）。
// 踏むと対応する季節の工房の魔法陣中央（WARP_ARRIVAL）に出る。
// 色と季節の対応: 春=ピンク/夏=青/秋=黄/冬=緑（四隅配置は2026-07-19本人確認）
const WARP_PADS = [
  { season: '春', tex: 'warp_pink', row: 10, col: 11 },
  { season: '夏', tex: 'warp_blue', row: 10, col: 18 },
  { season: '秋', tex: 'warp_yellow', row: 13, col: 11 },
  { season: '冬', tex: 'warp_green', row: 13, col: 18 },
] as const

// 転送先。null=転送しない（春=現在地の案内、秋冬=封印メッセージ＋薄暗表示）。
// §9-8「各ステージへ到達済みになると対応する色のワープが開放される」に従い、
// 夏は季節の門の解放（stageUnlocks.summer）と連動。
// 春の自陣は2026-07-20本人指示で「今いる場所」案内に変更（夏の工房の夏陣と同じ挙動）
function padExit(season: string): { targetScene: string; spawnCol: number; spawnRow: number } | null {
  if (season === '夏' && stageUnlocks.summer)
    return { targetScene: 'SummerWorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row }
  if (season === '秋' && stageUnlocks.autumn)
    return { targetScene: 'AutumnWorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row }
  return null
}

// 当たり判定マッピングツール（tools/stage-mapper）でkoubou.webpをトレースして書き出したマスク。
// 夏の工房（SummerWorkshopScene）も同じ部屋構造のためこのマスクを共用する（2026-07-20本人判断）
export const WORKSHOP_WALK_MASK = [
  '##############################',
  '##############################',
  '##############################',
  '##############################',
  '##############################',
  '##########..........##########',
  '##########.########.##########',
  '#######....########.##########',
  '#######....########.#.....####',
  '####.......########.#.########',
  '#########.............########',
  '#########.............########',
  '#########.............########',
  '#########.............########',
  '####..................########',
  '####..................########',
  '####..................########',
  '#############....#############',
  '#############....#############',
  '#############....#############',
  '##############..##############',
  '##############################',
]

export class WorkshopScene extends GridScene {
  private recipeGroup!: Phaser.GameObjects.Container
  private recipeOpen = false

  constructor() {
    super(
      'WorkshopScene',
      { type: 'image', textureKey: 'bg_workshop', cols: COLS, rows: ROWS, walkMask: WORKSHOP_WALK_MASK },
      DOOR_COL,
      DOOR_ROW - 1,
    )
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {
      // 下端: 自宅への出口（判定を1マス左にも追加）
      [`${DOOR_ROW},${DOOR_COL}`]: { exit: { targetScene: 'HomeScene', spawnCol: 21, spawnRow: 13 } },
      [`${DOOR_ROW},${DOOR_COL - 1}`]: { exit: { targetScene: 'HomeScene', spawnCol: 21, spawnRow: 13 } },
    }
    for (const cell of ACTION_CELLS) {
      specs[`${cell.row},${cell.col}`] = { data: { kind: 'workshopTable' } }
    }
    // ステージワープ: 開放済みの色は踏むとそのステージへ。自陣（春）は現在地の案内、封印中はメッセージ
    for (const pad of WARP_PADS) {
      const exit = padExit(pad.season)
      specs[`${pad.row},${pad.col}`] = exit
        ? { exit }
        : pad.season === '春'
          ? { data: { message: 'ここは春の工房の転送陣。今いる場所だ' } }
          : { data: { message: `${pad.season}の転送陣はまだ固く封印されている……` } }
    }
    return specs
  }

  protected onEnter(spec: CellSpec) {
    const data = spec.data as { message?: string } | undefined
    if (data?.message) showMessage(data.message)
  }

  protected onReady() {
    // 工房BGM。playBgmは同じ曲なら流しっぱなしにするため、転送陣で工房間を
    // ワープ（同一シーン再入場）しても途切れない（2026-07-18仕様）
    playBgm(this, 'bgm_koubou')

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

    // 4色の転送陣（16コマの魔法陣イラスト・2026-07-17差し替え）。
    // 開放済みはアニメ再生、自陣（春）は明るく静止、封印中は1コマ目を薄暗く静止表示
    const animatedPads: { img: Phaser.GameObjects.Image; tex: string }[] = []
    for (const pad of WARP_PADS) {
      const img = this.add.image(pad.col * 32 + 16, pad.row * 32 + 16, `${pad.tex}_1`)
      this.fitImage(img, 46)
      img.setDepth(3)
      if (padExit(pad.season)) {
        animatedPads.push({ img, tex: pad.tex })
      } else if (pad.season !== '春') {
        img.setAlpha(0.35)
      }
    }

    // 調合マーク（浮かぶ光るすり鉢・16コマ）。調合の作業マス2つの中央上空に表示
    const markX = ((ACTION_CELLS[0].col + ACTION_CELLS[1].col) / 2) * 32 + 16
    const mark = this.add.image(markX, ACTION_CELLS[0].row * 32 - 6, 'mark_compound_1')
    this.fitImage(mark, 42)
    mark.setDepth(8)

    // 魔法陣と調合マークの共通アニメループ（16コマ×90ms=約1.4秒）
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

    // シャオランは工房の左側の下側に配置（2026-07-17本人指定）
    this.addNpc('xiaolan', 16, 6)

    updateHud()
    showMessage('矢印キー/WASD/クリックで移動。机の本をクリックでレシピ表示、机の奥に回り込んでSpaceキーを押して調合')
  }

  // レシピ本: 覚えている全処方の数式を縦に並べる（処方追加はRECIPESに足すだけで反映）
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

  // 調合台: レシピ選択ウインドウを開き、選んだ処方の調合を試みる（2026-07-19・複数処方対応）
  protected onAction(spec: CellSpec | undefined) {
    const data = spec?.data as { kind: string } | undefined
    if (data?.kind !== 'workshopTable') return
    showRecipePicker((recipe) => this.compound(recipe))
  }

  private compound(recipe: Recipe) {
    const ok = tryCompound(recipe)
    if (ok) {
      // タイムライン: ムービー（スキップ可）→ 完成表示（トースト＋メッセージ＋発光演出）の順（2026-07-19実機評）
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
