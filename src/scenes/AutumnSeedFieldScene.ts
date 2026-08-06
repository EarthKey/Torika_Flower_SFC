import { GridScene, type CellSpec } from './GridScene'
import { collectSeed, seedCooldownRemainMs, KIND_LABELS_RUBY, type SeedKind, type Season } from '../state/gameState'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { playBgm } from '../state/bgm'

// 秋の種の聖域（ステージ3）。saisyu_Autum.webpをそのまま床に敷く一枚絵背景モード。
// 採取ロジックは春・夏のSeedFieldSceneと同じ仕組み（クリック/Space採取・6時間クールダウン）。
//
// 2026-07-25: 本人がstage-mapperでトレースした saisyu_Autum.json（D:\...\V2）を全面採用。
// 当たり判定・採取スポット・戻り口をすべて実測値に置き換えた（旧: 外周のみ壁の仮マスク）。
// トレースの紫マス=採取スポット、緑マス(21,14)(21,15)=里への戻り口。

const COLS = 30
const ROWS = 22

// saisyu_Autum.json（2026-07-25・本人トレース）のmaskをそのまま採用
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############################', // r2
  '##############################', // r3
  '##############..##############', // r4 奥=杏仁のスポット
  '##############..##############', // r5
  '##############..##############', // r6
  '##############..##############', // r7
  '##############..##############', // r8
  '#############....#############', // r9
  '#######.......##.......#######', // r10 左=麻黄(c7)・右=葛根(c22)
  '#############.##.#############', // r11
  '#############....#############', // r12
  '##############..##############', // r13
  '##############..##############', // r14
  '##############..##############', // r15
  '##############..##############', // r16
  '##############..##############', // r17
  '##############..##############', // r18
  '##############..##############', // r19
  '##############..##############', // r20
  '##############..##############', // r21 下端=里への戻り口
]

// 採取スポット（トレースの紫マス）。左=麻黄・奥=杏仁（鳥居寄り）・右=葛根
const SEED_SPOTS: { cells: [number, number][]; kind: SeedKind }[] = [
  { cells: [[10, 7]], kind: 'mao' },
  { cells: [[4, 14], [4, 15]], kind: 'kyounin' },
  { cells: [[10, 22]], kind: 'kakkon' },
]

export class AutumnSeedFieldScene extends GridScene {
  protected sceneSeason: Season = 'autumn'
  private spotImages: Partial<Record<SeedKind, Phaser.GameObjects.Image>> = {}

  constructor() {
    super(
      'AutumnSeedFieldScene',
      { type: 'image', textureKey: 'bg_autumn_seedfield', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      14,
      19,
    )
  }

  protected specials(): Record<string, CellSpec> {
    return {
      '21,14': { exit: { targetScene: 'AutumnHomeScene', spawnCol: 14, spawnRow: 3 } },
      '21,15': { exit: { targetScene: 'AutumnHomeScene', spawnCol: 14, spawnRow: 3 } },
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
