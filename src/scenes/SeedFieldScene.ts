import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { collectSeed, seedCooldownRemainMs, KIND_LABELS_RUBY, type SeedKind } from '../state/gameState'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { playBgm } from '../state/bgm'

// 春の種の聖域。V3コンセプト画（saisyu_Spring.webp・2026-07-19差し替え）をそのまま床に敷く
// 一枚絵背景モード。中央十字から三方向（左=甘草の草むら、右=大棗の木、奥=小麦の草地）に
// 道が伸び、それぞれの突き当たりが採取スポット。下端の道から自宅（春の里）へ戻る。
// 通行マスクとスポット位置は本人がマッピングツールで塗った saisyu_Spring.json（2026-07-19版）を採用。

const COLS = 30
const ROWS = 22

// saisyu_Spring.json（2026-07-19・本人トレース）のmaskをそのまま採用
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############################', // r2
  '##############################', // r3
  '##############..##############', // r4 奥の採取スポット（小麦）
  '##############..##############', // r5
  '##############..##############', // r6
  '##############..##############', // r7
  '##############..##############', // r8
  '##############..##############', // r9
  '############......############', // r10 中央十字の上段
  '#######.......##......########', // r11 左右の道（左端c7=甘草・右端c21=大棗）
  '############..##..############', // r12
  '#############....#############', // r13
  '##############..##############', // r14
  '##############..##############', // r15
  '##############..##############', // r16
  '##############..##############', // r17
  '##############..##############', // r18
  '##############..##############', // r19
  '##############..##############', // r20 下端=自宅への出口
  '##############################', // r21
]

// 採取スポット（saisyu_Spring.jsonの紫マス）。左=甘草・奥=小麦（2マス）・右=大棗
const SEED_SPOTS: { cells: [number, number][]; kind: SeedKind }[] = [
  { cells: [[11, 7]], kind: 'kanzou' }, // 左: 草むらの突き当たり
  { cells: [[4, 14], [4, 15]], kind: 'syoubaku' }, // 奥: 麦の草地
  { cells: [[11, 21]], kind: 'taisou' }, // 右: 大棗の木の下
]

// 自宅への出口（下端の道、saisyu_Spring.jsonの緑マス2つ）
const EXIT_CELLS: [number, number][] = [
  [20, 14],
  [20, 15],
]

export class SeedFieldScene extends GridScene {
  private spotImages: Partial<Record<SeedKind, Phaser.GameObjects.Image>> = {}

  constructor() {
    super(
      'SeedFieldScene',
      { type: 'image', textureKey: 'bg_seedfield', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      15,
      18,
    )
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {}
    for (const [row, col] of EXIT_CELLS) {
      // 自宅側は鳥居(3,14)が入口なので、その1マス下(4,14)に出現させる
      specs[`${row},${col}`] = { exit: { targetScene: 'HomeScene', spawnCol: 14, spawnRow: 4 } }
    }
    // 種スポットは踏んで採取ではなくクリック採取（2026-07-17変更）のためspecsには入れない
    return specs
  }

  protected onReady() {
    playBgm(this, 'bgm_seed')

    // 採取物の実画像を各スポットの全マス中央（ピクセル座標）に1つずつ重ねる。
    // スポットのマスは通行不可にし、隣のマスからのクリックで採取する（2026-07-17変更）
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
    // クールダウン明けの表示復帰用（採取済み=薄暗く、採取可能=明るく）
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
