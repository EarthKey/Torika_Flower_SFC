import { GridScene, type CellSpec } from './GridScene'
import { collectSeed, seedCooldownRemainMs, KIND_LABELS_RUBY, type SeedKind } from '../state/gameState'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { playBgm } from '../state/bgm'

// 夏の種の聖域（ステージ2・種採取フィールド）。saisyu_Summer.webpをそのまま床に敷く一枚絵背景モード。
// 中央十字から三方向（左=芍薬の花園、右=桂皮の大木、奥=生姜の土の広場）に道が伸び、
// それぞれの突き当たりが採取スポット。下端の道から夏の里へ戻る。
// 通行マスクとスポット位置は本人がマッピングツールで塗った saisyu_Summer.json（2026-07-19版）を採用。
// 採取ロジックは春のSeedFieldSceneと完全に同じ仕組み（クリック/Space採取・60分クールダウン）。

const COLS = 30
const ROWS = 22

// saisyu_Summer.json（2026-07-19・本人トレース）のmaskをそのまま採用。
// 中央の花壇はr10-r12のc14-16を通行不可にしてリング状に修正（2026-07-20本人実機評）
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############################', // r2
  '##############################', // r3
  '##############..##############', // r4 奥の採取スポット（生姜）
  '##############..##############', // r5
  '##############..##############', // r6
  '##############..##############', // r7
  '##############..##############', // r8
  '############.......###########', // r9 円環の上アーチ（外周リングのみ歩行可）
  '############..###..###########', // r10 円環の上段。中央の花壇(c14-16)は歩行不可
  '########......###.....########', // r11 左右の道（左端c8=芍薬・右端c17-21=桂皮）。中央の花壇(c14-16)は歩行不可
  '############..###..###########', // r12 円環の下段。中央の花壇(c14-16)は歩行不可
  '############.......###########', // r13 円環の下アーチ（外周リングのみ歩行可）
  '##############..##############', // r14
  '##############..##############', // r15
  '##############..##############', // r16
  '##############..##############', // r17
  '##############..##############', // r18
  '##############..##############', // r19
  '##############..##############', // r20 下端=夏の里への出口
  '##############################', // r21
]

// 採取スポット（saisyu_Summer.jsonの紫マス）。左=芍薬(1マス)・奥=生姜(2マス)・右=桂皮(1マス)
const SEED_SPOTS: { cells: [number, number][]; kind: SeedKind }[] = [
  { cells: [[11, 8]], kind: 'syakuyaku' }, // 左: 花園の突き当たり
  { cells: [[4, 14], [4, 15]], kind: 'syoukyou' }, // 奥: 土の広場
  { cells: [[11, 21]], kind: 'keihi' }, // 右: 大木の下
]

export class SummerSeedFieldScene extends GridScene {
  protected sceneSeason: 'spring' | 'summer' = 'summer'
  private spotImages: Partial<Record<SeedKind, Phaser.GameObjects.Image>> = {}

  constructor() {
    super(
      'SummerSeedFieldScene',
      { type: 'image', textureKey: 'bg_summer_seedfield', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      15,
      18,
    )
  }

  protected specials(): Record<string, CellSpec> {
    return {
      // 下端の道: 夏の里へ戻る（saisyu_Summer.jsonの緑マス。里側は青竹の関所(2,14)の1マス下に出現。
      // 2026-07-20入れ替え: 里の上=聖域・下=春の里）
      '20,14': { exit: { targetScene: 'SummerHomeScene', spawnCol: 14, spawnRow: 3 } },
      '20,15': { exit: { targetScene: 'SummerHomeScene', spawnCol: 14, spawnRow: 3 } },
    }
  }

  protected onReady() {
    playBgm(this, 'bgm_seed')

    // 採取物の実画像を各スポットの全マス中央（ピクセル座標）に1つずつ重ねる。
    // スポットのマスは通行不可にし、隣のマスからのクリックで採取する（春と同じ方式）
    for (const spot of SEED_SPOTS) {
      for (const [r, c] of spot.cells) this.blockCell(r, c)
      const x = (spot.cells.reduce((s, [, c]) => s + c, 0) / spot.cells.length) * 32 + 16
      const y = (spot.cells.reduce((s, [r]) => s + r, 0) / spot.cells.length) * 32 + 16
      const img = this.add.image(x, y, `seed_field_${spot.kind}`)
      this.fitImage(img, 60)
      img.setDepth(5)
      img.setInteractive({ useHandCursor: true })
      img.on('pointerdown', () => {
        this.suppressClickMove = true
        this.tryCollect(spot)
      })
      this.spotImages[spot.kind] = img
    }
    this.refreshSpots()
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshSpots() })

    updateHud()
    showMessage('矢印キー/WASD/クリックで移動。三方向の道の奥で、種の近くまで行ってクリックで採取。下の道から里へ戻る')
  }

  // Spaceキーでも採取できるようにする（隣接しているスポットを探して採取）
  protected onAction() {
    const spot = SEED_SPOTS.find((s) =>
      s.cells.some(([r, c]) => Math.abs(r - this.playerRow) + Math.abs(c - this.playerCol) === 1),
    )
    if (spot) this.tryCollect(spot)
  }

  // 種スポットの採取（クリック/Spaceキー共通）。隣のマス（上下左右）にいるときだけ採れる
  private tryCollect(spot: { cells: [number, number][]; kind: SeedKind }) {
    const adjacent = spot.cells.some(
      ([r, c]) => Math.abs(r - this.playerRow) + Math.abs(c - this.playerCol) === 1,
    )
    if (!adjacent) {
      showMessage('もっと近くまで行って採取しよう')
      return
    }
    const result = collectSeed(spot.kind)
    if (result.ok) {
      updateHud()
      showToast(`${KIND_LABELS_RUBY[spot.kind]}の種 ×1`, `assets/items/seed_bag_${spot.kind}.png`)
    } else {
      const remainMin = Math.ceil(result.remainMs / 60000)
      showMessage(`ここの種はまだ育っていない……（次の種まで あと約${remainMin}分）`)
    }
    this.refreshSpots()
  }

  // クールダウン中のスポットは薄暗く表示する
  private refreshSpots() {
    for (const spot of SEED_SPOTS) {
      const img = this.spotImages[spot.kind]
      if (!img) continue
      img.setAlpha(seedCooldownRemainMs(spot.kind) > 0 ? 0.35 : 1)
    }
  }
}
