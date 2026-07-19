import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { gameState, tryCompound, RECIPES, KIND_LABELS_RUBY, type Recipe, type SeedKind } from '../state/gameState'
import { updateHud, showMessage, showToast, showRecipePicker } from '../ui/hud'
import { playBgm } from '../state/bgm'

// 工房内部。既存のコンセプト画（koubou.webp）をそのまま床に敷く一枚絵背景モード。
// 中央の調合台（画像に描かれた机）の上に生薬メダルの3つの器を重ねて表示し、
// 器の右にある本をクリックするとレシピの数式が開く（常時表示はしない）。
// 完成した薬は演出のあと所持品（HUDの個数）に入る。

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

// 机の上にすでに描かれている3つの器の位置（甘草=緑, 小麦=黄土, 大棗=桃色の器）
const BOWL_POS: Record<SeedKind, { row: number; col: number }> = {
  kanzou: { row: 7, col: 13 },
  syoubaku: { row: 7, col: 15 },
  taisou: { row: 7, col: 17 },
}

// 机の上に描かれている開いた本（クリックでレシピを開閉する）
const BOOK_POS = { row: 8, col: 18 }

// 完成薬を演出で見せる位置（2026-07-19実機評で移動: 旧・右側の布敷きの台(14,25)→調合台の机の上）。
// メダルの器（r7・c13/15/17）のあいだ、調合位置のトリカ(r5)の手前に出る
const SHELF = { row: 7, col: 14 }

// ステージワープの転送陣（仕様書§9-8・2026-07-17）。マッピングツールで塗った中央の部屋の
// 四隅（koubou.json 2026-07-17版）に4色を配置。工房は春夏秋冬で4つ用意する予定で、
// 転送陣は「各季節の工房の中」同士を結ぶネットワーク（2026-07-18確定）。
// 踏むと対応する季節の工房の魔法陣中央（WARP_ARRIVAL）に出る。
// 色と季節の対応: 春=ピンク/夏=青/秋=黄/冬=緑。現状は春の工房のみ存在するためピンクだけ稼働
const WARP_PADS = [
  { season: '春', tex: 'warp_pink', row: 10, col: 11, exit: { targetScene: 'WorkshopScene', spawnCol: WARP_ARRIVAL.col, spawnRow: WARP_ARRIVAL.row } },
  { season: '夏', tex: 'warp_blue', row: 10, col: 18, exit: null }, // 夏の工房（未実装）
  { season: '秋', tex: 'warp_yellow', row: 13, col: 11, exit: null }, // 秋の工房（未実装）
  { season: '冬', tex: 'warp_green', row: 13, col: 18, exit: null }, // 冬の工房（未実装）
] as const

// 当たり判定マッピングツール（tools/stage-mapper）でkoubou.webpをトレースして書き出したマスク
const WALK_MASK = [
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

const SLOT_KINDS: SeedKind[] = ['kanzou', 'syoubaku', 'taisou']

export class WorkshopScene extends GridScene {
  private slotImages: Partial<Record<SeedKind, Phaser.GameObjects.Image>> = {}
  private recipeGroup!: Phaser.GameObjects.Container
  private recipeOpen = false

  constructor() {
    super(
      'WorkshopScene',
      { type: 'image', textureKey: 'bg_workshop', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
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
    // ステージワープ: 開放済みの色は踏むとそのステージへ。封印中はメッセージだけ出す
    for (const pad of WARP_PADS) {
      specs[`${pad.row},${pad.col}`] = pad.exit
        ? { exit: pad.exit }
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

    // 机の上、既存の器の絵にメダルアイコンを重ねる
    SLOT_KINDS.forEach((kind) => {
      const pos = BOWL_POS[kind]
      const img = this.addCellImage(pos.row, pos.col, `medal_${kind}`, 34)
      this.slotImages[kind] = img
    })
    this.refreshSlots()

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
    // 開放済み（春）はアニメ再生、封印中は1コマ目を薄暗く静止表示
    const animatedPads: { img: Phaser.GameObjects.Image; tex: string }[] = []
    for (const pad of WARP_PADS) {
      const img = this.add.image(pad.col * 32 + 16, pad.row * 32 + 16, `${pad.tex}_1`)
      this.fitImage(img, 46)
      img.setDepth(3)
      if (pad.exit) {
        animatedPads.push({ img, tex: pad.tex })
      } else {
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

    this.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => this.refreshSlots(),
    })
  }

  // レシピ本: 覚えている全処方の数式を縦に並べる（処方追加はRECIPESに足すだけで反映）
  private buildRecipePanel() {
    const rowH = 40
    const panelWidth = 320
    const panelHeight = rowH * RECIPES.length + 8
    const y = BOWL_POS.kanzou.row * 32 - 26 - (panelHeight - 40) / 2
    const centerX = ((BOWL_POS.kanzou.col + BOWL_POS.taisou.col) / 2) * 32 + 16
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
      this.playCompoundMovie(() => {
        showToast(`${recipe.name}（${recipe.ruby}） ×1`, recipe.icon)
        showMessage(`${recipe.name}（${recipe.ruby}）が完成した！`)
        this.playCompleteEffect()
      })
    } else {
      const need = (Object.entries(recipe.cost) as [SeedKind, number][])
        .map(([k, n]) => `${KIND_LABELS_RUBY[k]}×${n}`)
        .join('・')
      showMessage(`メダルが足りない。必要: ${need}`)
    }
    this.refreshSlots()
    updateHud()
  }

  // 所持しているメダルは明るく、未所持は薄暗く表示（処方ごとの充足はレシピ選択ウインドウ側で示す）
  private refreshSlots() {
    for (const kind of SLOT_KINDS) {
      const img = this.slotImages[kind]
      if (!img) continue
      img.setAlpha(gameState.medals[kind] > 0 ? 1 : 0.3)
    }
  }

  // 調合成功のカットインムービー（PV素材再利用の試験導入・2026-07-19）。
  // 暗幕＋中央にムービーを1回再生。クリックでスキップ可。終了後にonEnd（発光演出）へつなぐ
  private playCompoundMovie(onEnd: () => void) {
    const cx = (30 * 32) / 2
    const cy = (22 * 32) / 2
    const backdrop = this.add
      .rectangle(cx, cy, 30 * 32, 22 * 32, 0x000000, 0.65)
      .setDepth(29)
      .setInteractive() // 暗幕がクリックを受け、背後のマスへの移動予約を防ぐ
    // 表示は実寸の50%（2026-07-19実機評: 大きすぎて画質の粗さが目立つため縮小）
    const vw = 304
    const vh = 232
    const frame = this.add.rectangle(cx, cy, vw + 8, vh + 8).setStrokeStyle(4, 0xc9a24a).setDepth(30)
    const vid = this.add.video(cx, cy, 'compound_movie').setDepth(30)
    vid.setDisplaySize(vw, vh)
    vid.play(false)

    let finished = false // スキップ直後にVIDEO_COMPLETEが重複発火しても二重実行しない
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
