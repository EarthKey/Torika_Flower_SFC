import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { plots, plantOn, harvestFrom, growthStageOf, KIND_LABELS, KIND_LABELS_RUBY, type PlotState, type Season } from '../state/gameState'

// 秋の里（ステージ3・雑賀エリア）。Stage_Autumn.webpをそのまま床に敷く一枚絵背景モード。
// 2026-07-24仮組み（Day17の夏ステージ初回と同じ方式）: 当たり判定は外周のみ壁・内側は全歩行可の
// プレースホルダー。本人がstage-mapperで実際に歩いてJSONを作ったら本番マスクへ差し替える。
//
// NPC配置は本人が実機スクリーンショットに色丸で指定した座標に準拠（2026-07-24・色検出で座標算出）:
// 青丸=イズナ(6,8)、緑丸=弁天(16,23)。柴は工房内へ移動（AutumnWorkshopScene参照）、猫又は変更なし(16,6)。
// 工房入口（黄丸）は(11,23)、冬への門（赤丸）は(3,24)-(3,25)に更新。いずれも当たり判定そのものは仮組みのまま。
// 畑3区画（麻黄・杏仁・葛根）の位置・art座標は夏の里のPLOT_LAYOUTをそのまま流用した
// 仮値（背景画像上の実際の畑位置とは未照合）。実機評で座標を調整すること。

const COLS = 30
const ROWS = 22

// 仮当たり判定（外周のみ壁）
const WALK_MASK: string[] = Array.from({ length: ROWS }, (_, r) =>
  r === 0 || r === ROWS - 1 ? '#'.repeat(COLS) : '#' + '.'.repeat(COLS - 2) + '#',
)

const NPC_LAYOUT = [
  { chara: 'izuna', row: 5, col: 7 },
  { chara: 'nekomata', row: 16, col: 6 },
  { chara: 'benten', row: 16, col: 23 },
]

const PLOT_ART_SIZE = 71 * 1.1
const PLOT_LAYOUT: Record<string, { actRow: number; actCol: number; artX: number; artY: number }> = {
  plot_mao: { actRow: 12, actCol: 3, artX: 3 * 32 + 16 + 4, artY: 12 * 32 - 73 + 16 },
  plot_kyounin: { actRow: 12, actCol: 7, artX: 7 * 32 + 16 - 4, artY: 12 * 32 - 73 + 16 },
  plot_kakkon: { actRow: 12, actCol: 10, artX: 10 * 32 + 16 + 16, artY: 12 * 32 - 73 + 16 },
}

export class AutumnHomeScene extends GridScene {
  protected sceneSeason: Season = 'autumn'
  private plotImages: Record<string, Phaser.GameObjects.Image> = {}

  constructor() {
    super(
      'AutumnHomeScene',
      { type: 'image', textureKey: 'bg_autumn_home', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      14,
      19, // 夏の里からの到着点（下端）
    )
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {
      // 上中央: 秋の種の聖域へ
      '2,14': { exit: { targetScene: 'AutumnSeedFieldScene', spawnCol: 15, spawnRow: 18 } },
      // 右の工房入口（黄丸座標に合わせて更新・2026-07-24）
      '11,23': { exit: { targetScene: 'AutumnWorkshopScene', spawnCol: 15, spawnRow: 19 } },
      // 下端: 夏の里へ戻る
      '20,14': { exit: { targetScene: 'SummerHomeScene', spawnCol: 25, spawnRow: 4 } },
      // 右上: 施錠された冬への門（赤丸座標に合わせて更新・2026-07-24。ステージ4実装時に解放条件を接続する）
      '3,24': { data: { message: '冬への門は固く閉ざされている……。この里のみんなを癒やせば、道が開けるのだろうか' } },
      '3,25': { data: { message: '冬への門は固く閉ざされている……。この里のみんなを癒やせば、道が開けるのだろうか' } },
    }
    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      specs[`${pos.actRow},${pos.actCol}`] = { data: plots[plotId] }
    }
    return specs
  }

  protected onReady() {
    playBgm(this, 'bgm_stage3')

    for (const npc of NPC_LAYOUT) this.addNpc(npc.chara, npc.row, npc.col)

    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      const img = this.add.image(pos.artX, pos.artY, `${plots[plotId].crop}_stage1`)
      this.fitImage(img, PLOT_ART_SIZE)
      img.setDepth(5)
      img.setVisible(false)
      this.plotImages[plotId] = img
    }
    this.refreshPlots()
    this.time.addEvent({ delay: 200, loop: true, callback: () => this.refreshPlots() })

    updateHud()
    showMessage('秋の里（雑賀の拠点）。上=種の聖域、右=工房、下=夏の里へ。畑の手前でSpaceキーを押して種植え/収穫。当たり判定は仮組みです')
  }

  protected onEnter(spec: CellSpec) {
    const data = spec.data as ({ message?: string } & Partial<PlotState>) | undefined
    if (data?.crop) {
      showMessage(`ここは${KIND_LABELS_RUBY[data.crop]}を植える場所`)
      return
    }
    if (data?.message) showMessage(data.message)
  }

  protected onAction(spec: CellSpec | undefined) {
    const plot = spec?.data as PlotState | undefined
    if (!plot || !('crop' in plot)) return

    const stage = growthStageOf(plot)
    if (stage === 4) {
      const gained = harvestFrom(plot)
      showToast(`${KIND_LABELS_RUBY[plot.crop]}メダル ×${gained}`, `assets/items/medal_${plot.crop}.png`)
      if (gained >= 2) showMessage(`よく育っていた！${KIND_LABELS[plot.crop]}メダルを${gained}個収穫した`)
      this.refreshPlots()
      updateHud()
      return
    }
    if (stage === 0) {
      if (!plantOn(plot)) {
        showMessage(`このマスは${KIND_LABELS_RUBY[plot.crop]}専用の畑。${KIND_LABELS[plot.crop]}の種を持っていない`)
        return
      }
      this.refreshPlots()
      updateHud()
      showMessage(`${KIND_LABELS_RUBY[plot.crop]}の種を植えた`)
      return
    }
    showMessage('まだ育っている途中')
  }

  private refreshPlots() {
    for (const [plotId, img] of Object.entries(this.plotImages)) {
      const plot = plots[plotId]
      const stage = growthStageOf(plot)
      if (stage === 0) {
        img.setVisible(false)
        continue
      }
      const key = `${plot.crop}_stage${stage}`
      if (img.texture.key !== key) {
        img.setTexture(key)
        this.fitImage(img, PLOT_ART_SIZE)
      }
      img.setVisible(true)
    }
  }
}
