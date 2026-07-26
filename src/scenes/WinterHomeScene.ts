import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { openDialogue } from '../ui/dialogue'
import { fortuneLines } from '../state/fortuneData'
import { plots, plantOn, harvestFrom, growthStageOf, KIND_LABELS, KIND_LABELS_RUBY, type PlotState, type Season } from '../state/gameState'

// 冬の里（ステージ4・伊賀エリア）。Stage_Winter.webpをそのまま床に敷く一枚絵背景モード。
//
// 2026-07-25: 本人がstage-mapperで実際に歩いてトレースした Stage_Winter.json（D:\...\V2）を全面採用。
// 当たり判定・NPCの立ち位置・畑の作業マス・花占い・出口はすべてトレースの実測値。
//
// トレースの紫マス（アクション）の割り当て:
//   (4,6)=イズナ / (16,5)=餡音 / (10,26)=結 … NPCの立ち位置（本人指示: 紫マスにキャラを配置）
//   (11,3) / (11,6) / (11,9) … 畑3区画の作業マス（冬は1区画1マス）
//   (3,23)(3,24) … 花占いの調べマス（本人指示: 冬はマップ右上のいちばん奥）
// トレースの緑マス（ワープ）: (2,14)=種の聖域へ、(10,20)=工房へ
//
// ハヤテは工房内配置（春のシャオラン・夏のアウン・秋の柴と同じ立ち位置。WinterWorkshopScene参照）。
// 最終ステージのため「次の季節への門」は存在しない（assets_prompts/stages/ステージ_冬の里.md準拠）。

const COLS = 30
const ROWS = 22

// Stage_Winter.json（2026-07-25・本人トレース）のmaskをそのまま採用。
// 同日14:46にJSONが更新され、r12（畑の下の道）が c16〜c24 まで開通したぶんを反映済み
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############.###############', // r2 種の聖域への関所(c14)
  '##############.########..#####', // r3 花占いの調べマス(c23-24・右上の最奥)
  '####.....#####.########..#####', // r4 左上の平地（イズナ(4,6)）
  '####...........########..#####', // r5
  '####...........########..#####', // r6
  '##############.########..#####', // r7
  '##############.########..#####', // r8
  '##############.########..#####', // r9
  '##############.#####.##....###', // r10 工房入口(c20)・結(10,26)
  '###.##.##.####.#####.##....###', // r11 畑の作業マス(c3/c6/c9)
  '#..............#.........#####', // r12 畑の下の道（2026-07-25 14:46版トレースでc16〜c24まで開通）
  '####.....................#####', // r13
  '#####..#####.....#############', // r14
  '#####...####.....####....#####', // r15
  '#####.....................####', // r16 餡音(16,5)
  '#####.....................####', // r17
  '#####...######.######....#####', // r18
  '##############.###############', // r19
  '##############.###############', // r20 下端=秋の里への道
  '##############################', // r21
]

// NPCの立ち位置（Stage_Winter.jsonの紫マス・2026-07-25本人トレース）。
// イズナは全ステージ共通で左上の平地、餡音=左下、結=右（秋の猫又・弁天と同じ役割配置）
const NPC_LAYOUT = [
  { chara: 'izuna', row: 4, col: 6 },
  { chara: 'anne', row: 16, col: 5 },
  { chara: 'yui', row: 10, col: 26 },
]

// 花占いのポスト（§9-11）。調べマス(3,23)(3,24)の1マス上＝通路の突き当たり（元から通行不可の柵際）に立てる
const URANAI_POST = { row: 2, cols: [23, 24] }

// 畑3区画の作業マスと成長スプライトの位置。冬は1区画1マス（トレースどおり）。
// artYは背景画像から実測した雪の畑の中心（y≒310px）に合わせた値。
// 背景の土の内側は実測で約53×78px。スプライトは**下端を土に固定**して描く（origin 0.5,1）ので、
// sizeを大きくしても足元が動かず、上へ伸びるだけ＝通路側へはみ出さない（2026-07-26）
const PLOT_ART_SIZE = 71 * 1.1
// 種類ごとの表示サイズ。人参・白朮は元絵が縦長で、fitImage（長辺基準）だと横幅が痩せて
// 畑に対して小さく見えるため大きめにする（2026-07-26本人指示「畑にうまるように」）。
// 見た目の調整はこの数値ひとつで済む
const PLOT_ART_SIZE_BY_CROP: Record<string, number> = {
  ninjin: 96,
  byakujutsu: 94,
}
const plotArtSize = (crop: string) => PLOT_ART_SIZE_BY_CROP[crop] ?? PLOT_ART_SIZE
// 足元の基準線（従来の中心配置 artY + PLOT_ART_SIZE/2 と同じ位置。ここを動かさないので
// サイズを上げても既存の見え方の足元はそのまま）
const PLOT_ART_BASELINE = PLOT_ART_SIZE / 2
const PLOT_LAYOUT: Record<string, { actRow: number; actCols: number[]; artX: number; artY: number }> = {
  plot_kankyou: { actRow: 11, actCols: [3], artX: 130, artY: 310 },
  plot_ninjin: { actRow: 11, actCols: [6], artX: 222, artY: 310 },
  plot_byakujutsu: { actRow: 11, actCols: [9], artX: 312, artY: 310 },
}

export class WinterHomeScene extends GridScene {
  protected sceneSeason: Season = 'winter'
  private plotImages: Record<string, Phaser.GameObjects.Image> = {}

  constructor() {
    super(
      'WinterHomeScene',
      { type: 'image', textureKey: 'bg_winter_home', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      14,
      19, // 秋の里からの到着点（下端）
    )
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {
      // 上中央: 冬の種の聖域へ（聖域側の戻り口が最下段r21のため、到着は少し手前のr19）
      '2,14': { exit: { targetScene: 'WinterSeedFieldScene', spawnCol: 14, spawnRow: 19 } },
      // 右の工房入口
      '10,20': { exit: { targetScene: 'WinterWorkshopScene', spawnCol: 14, spawnRow: 19 } },
      // 下端: 秋の里へ戻る（秋側は冬の門(4,24)のすぐ下に出現。門のマスに直接出さない）
      '20,14': { exit: { targetScene: 'AutumnHomeScene', spawnCol: 24, spawnRow: 5 } },
      // 花占いのポスト（§9-11・右上の通路の突き当たり）。調べマスは2マス
      '3,23': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
      '3,24': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
    }
    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      for (const col of pos.actCols) specs[`${pos.actRow},${col}`] = { data: plots[plotId] }
    }
    return specs
  }

  protected onReady() {
    // 冬の里BGM（SUNO制作・2026-07-25生成のStage4.wav）。暫定流用していた秋のトラックから差し替え済み
    playBgm(this, 'bgm_stage4')

    for (const npc of NPC_LAYOUT) this.addNpc(npc.chara, npc.row, npc.col)

    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      const crop = plots[plotId].crop
      const img = this.add.image(pos.artX, pos.artY + PLOT_ART_BASELINE, `${crop}_stage1`)
      img.setOrigin(0.5, 1) // 足元固定（上へ伸びる）
      this.fitImage(img, plotArtSize(crop))
      img.setDepth(5)
      img.setVisible(false)
      this.plotImages[plotId] = img
    }
    this.refreshPlots()
    this.time.addEvent({ delay: 200, loop: true, callback: () => this.refreshPlots() })

    // 花占いのポスト（春夏秋と同じuranai.webp16コマ）。設置マスは元から通行不可の突き当たり
    const postX = ((URANAI_POST.cols[0] + URANAI_POST.cols[1]) / 2) * 32 + 16
    const post = this.add.image(postX, URANAI_POST.row * 32 + 26, 'hanauranai_post_1')
    this.fitImage(post, 68)
    this.registerDepthSortedProp(post, URANAI_POST.row) // 調べマス(3,23)(3,24)は手前側＝トリカが表に出る
    let postFrame = 1
    this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        postFrame = (postFrame % 16) + 1
        post.setTexture(`hanauranai_post_${postFrame}`)
      },
    })

    updateHud()
    showMessage('冬の里（伊賀の拠点）。上=種の聖域、右=工房、下=秋の里へ。畑の手前でSpaceキーを押して種植え/収穫')
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
    const data = spec?.data as { kind?: string } | undefined
    if (data?.kind === 'hanauranai') {
      openDialogue(fortuneLines())
      return
    }

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
        this.fitImage(img, plotArtSize(plot.crop))
      }
      img.setVisible(true)
    }
  }
}
