import { GridScene, type CellSpec } from './GridScene'
import { collectSeed, seedCooldownRemainMs, KIND_LABELS_RUBY, type SeedKind, type Season } from '../state/gameState'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { playBgm } from '../state/bgm'

// 秋の種の聖域（ステージ3）。saisyu_Autum.webpをそのまま床に敷く一枚絵背景モード。
// 2026-07-24仮組み: 当たり判定は外周のみ壁のプレースホルダー。
// 採取ロジックは春・夏のSeedFieldSceneと同じ仕組み（クリック/Space採取・60分クールダウン）。
// スポット位置は本人が実機スクリーンショットに色丸で指定した座標に準拠（2026-07-24・
// 現在のスプライト位置との局所オフセットから算出）。当たり判定自体は仮組みのまま。

const COLS = 30
const ROWS = 22

const WALK_MASK: string[] = Array.from({ length: ROWS }, (_, r) =>
  r === 0 || r === ROWS - 1 ? '#'.repeat(COLS) : '#' + '.'.repeat(COLS - 2) + '#',
)

// 採取スポット。左=麻黄・奥=杏仁（鳥居寄り）・右=葛根
const SEED_SPOTS: { cells: [number, number][]; kind: SeedKind }[] = [
  { cells: [[10, 7]], kind: 'mao' },
  { cells: [[2, 15], [2, 16]], kind: 'kyounin' },
  { cells: [[10, 23]], kind: 'kakkon' },
]

export class AutumnSeedFieldScene extends GridScene {
  protected sceneSeason: Season = 'autumn'
  private spotImages: Partial<Record<SeedKind, Phaser.GameObjects.Image>> = {}

  constructor() {
    super(
      'AutumnSeedFieldScene',
      { type: 'image', textureKey: 'bg_autumn_seedfield', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      15,
      18,
    )
  }

  protected specials(): Record<string, CellSpec> {
    return {
      '20,14': { exit: { targetScene: 'AutumnHomeScene', spawnCol: 14, spawnRow: 3 } },
      '20,15': { exit: { targetScene: 'AutumnHomeScene', spawnCol: 14, spawnRow: 3 } },
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

  private refreshSpots() {
    for (const spot of SEED_SPOTS) {
      const img = this.spotImages[spot.kind]
      if (!img) continue
      img.setAlpha(seedCooldownRemainMs(spot.kind) > 0 ? 0.35 : 1)
    }
  }
}
