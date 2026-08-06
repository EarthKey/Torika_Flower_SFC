import { GridScene, type CellSpec } from './GridScene'
import { collectSeed, seedCooldownRemainMs, KIND_LABELS_RUBY, type SeedKind, type Season } from '../state/gameState'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { playBgm } from '../state/bgm'

// 冬の種の聖域（ステージ4）。saisyu_winter.webpをそのまま床に敷く一枚絵背景モード。
// 採取ロジックは春・夏・秋のSeedFieldSceneと同じ仕組み（クリック/Space採取・6時間クールダウン）。
//
// 2026-07-25: 本人がstage-mapperでトレースした saisyu_winter.json（D:\...\V2）を全面採用。
// 当たり判定・採取スポット・戻り口をすべて実測値に置き換えた。秋の聖域と道の骨格は同じだが、
// 左右のスポットが2マス（r10・r11）に広がっている点が異なる。
// スポット構成（assets_prompts/stages/ステージ_冬の種の聖域.md準拠）:
// A=人参（赤い実の房）/ B=乾姜（夏の生姜スポットと同じ見た目で流用）/ C=白朮（白〜藤色の花）

const COLS = 30
const ROWS = 22

// saisyu_winter.json（2026-07-25・本人トレース）のmaskをそのまま採用
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############################', // r2
  '##############################', // r3
  '##############..##############', // r4 奥=乾姜のスポット
  '##############..##############', // r5
  '##############..##############', // r6
  '##############..##############', // r7
  '##############..##############', // r8
  '############......############', // r9 中央広場の上辺
  '######.......####.......######', // r10 左=人参(c6)・右=白朮(c23)。中央c13-16は祠
  '######.......####.......######', // r11
  '############.####.############', // r12 祠の左右を回り込む通路
  '############......############', // r13 中央広場の下辺
  '##############..##############', // r14
  '##############..##############', // r15
  '##############..##############', // r16
  '##############..##############', // r17
  '##############..##############', // r18
  '##############..##############', // r19
  '##############..##############', // r20
  '##############..##############', // r21 下端=里への戻り口
]

// 採取スポット（トレースの紫マス）。左=人参・奥=乾姜（鳥居寄り）・右=白朮
const SEED_SPOTS: { cells: [number, number][]; kind: SeedKind }[] = [
  { cells: [[10, 6], [11, 6]], kind: 'ninjin' },
  { cells: [[4, 14], [4, 15]], kind: 'kankyou' },
  { cells: [[10, 23], [11, 23]], kind: 'byakujutsu' },
]

export class WinterSeedFieldScene extends GridScene {
  protected sceneSeason: Season = 'winter'
  private spotImages: Partial<Record<SeedKind, Phaser.GameObjects.Image>> = {}

  constructor() {
    super(
      'WinterSeedFieldScene',
      { type: 'image', textureKey: 'bg_winter_seedfield', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      14,
      19,
    )
  }

  protected specials(): Record<string, CellSpec> {
    return {
      '21,14': { exit: { targetScene: 'WinterHomeScene', spawnCol: 14, spawnRow: 3 } },
      '21,15': { exit: { targetScene: 'WinterHomeScene', spawnCol: 14, spawnRow: 3 } },
    }
  }

  protected onReady() {
    playBgm(this, 'bgm_seed')

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

  protected onAction() {
    const spot = SEED_SPOTS.find((s) =>
      s.cells.some(([r, c]) => Math.abs(r - this.playerRow) + Math.abs(c - this.playerCol) === 1),
    )
    if (spot) this.tryCollect(spot)
  }

  private tryCollect(spot: { cells: [number, number][]; kind: SeedKind }) {
    // 離れた場所からタップされたら、隣接マスまで自動で歩いてから採取する（2026-08-06スマホ対応）。
    // 以前は「もっと近くまで行って採取しよう」で突き放しており、1マス単位の位置合わせが
    // 難しいタッチ操作では採取そのものが難所になっていた（実機評）
    if (!this.isAdjacentToAny(spot.cells)) {
      const r = this.approachThen(spot.cells, () => this.tryCollect(spot))
      if (r === 'unreachable') showMessage('そこへは行けないみたい……')
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

  private refreshSpots() {
    for (const spot of SEED_SPOTS) {
      const img = this.spotImages[spot.kind]
      if (!img) continue
      img.setAlpha(seedCooldownRemainMs(spot.kind) > 0 ? 0.35 : 1)
    }
  }
}
