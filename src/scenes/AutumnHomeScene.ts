import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { openDialogue } from '../ui/dialogue'
import { fortuneLines } from '../state/fortuneData'
import { plots, plantOn, harvestFrom, growthStageOf, stageUnlocks, unlockWinter, KIND_LABELS, KIND_LABELS_RUBY, type PlotState, type Season } from '../state/gameState'
import { winterGateConditionMet } from '../state/questData'

// 秋の里（ステージ3・雑賀エリア）。Stage_Autumn.webpをそのまま床に敷く一枚絵背景モード。
//
// 2026-07-25: 本人がstage-mapperで実際に歩いてトレースした Stage_Autumn.json（D:\...\V2）を全面採用。
// 当たり判定・NPCの立ち位置・畑の作業マス・花占い・出口はすべてトレースの実測値で、
// これまでの「外周のみ壁の仮マスク＋夏からの流用座標」を置き換えた。
//
// トレースの紫マス（アクション）の割り当て:
//   (5,6)=イズナ / (15,6)=猫又 / (16,23)=弁天 … NPCの立ち位置（本人指示: 紫マスにキャラを配置）
//   (11,2)(11,3) / (11,6)(11,7) / (11,10)(11,11) … 畑3区画の作業マス（1区画=2マス）
//   (14,14)(14,15) … 花占いの調べマス（本人指示: 秋はマップ中央の広場）
// トレースの緑マス（ワープ）: (2,14)(2,15)=種の聖域へ、(11,23)=工房へ

const COLS = 30
const ROWS = 22

// Stage_Autumn.json（2026-07-25・本人トレース）のmaskをそのまま採用
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############..##############', // r2 種の聖域への関所(c14-15)
  '##############..##############', // r3
  '##############..########..####', // r4 冬への門前(c24-25)
  '#####...........#.........####', // r5 左上の平地（イズナ(5,6)）
  '#####.....................####', // r6
  '##############.....###########', // r7
  '##############..#..###########', // r8
  '##############..#..###########', // r9
  '##############..#..###########', // r10
  '##..............#..####.######', // r11 畑の作業マス(c2-3/c6-7/c10-11)・工房入口(c23)。c2-13は道として全通し（2026-08-01実機座標で確定）
  '#..................###...#####', // r12 畑の下の道
  '####.....................#####', // r13
  '####.......#.............#####', // r14 花占いの調べマス(c14-15)
  '####......##......##......####', // r15
  '####......##......##......####', // r16 猫又(15,6)・弁天(16,23)
  '#####.....##......##......####', // r17
  '#####.....####..####......####', // r18
  '##############..##############', // r19
  '##############..##############', // r20 下端=夏の里への道
  '##############################', // r21
]

// NPCの立ち位置（Stage_Autumn.jsonの紫マス・2026-07-25本人トレース）。
// イズナは全ステージ共通で左上の平地、猫又=左中段、弁天=右下（夏の蛇ノ目・イブキと同じ役割配置）
const NPC_LAYOUT = [
  { chara: 'izuna', row: 5, col: 6 },
  { chara: 'nekomata', row: 15, col: 6 },
  { chara: 'benten', row: 16, col: 23 },
]

// 花占いのポスト（§9-11）。調べマス(14,14)(14,15)の真下＝広場中央の敷石装飾の位置に立てる
// （夏の里と同じ「ポスト本体は通行不可・その1マス上が調べマス」の構造）
const URANAI_POST = { row: 15, cols: [14, 15] }

// 畑3区画の作業マスと成長スプライトの位置。作業マスはトレースの紫マス2つ1組で、
// artX=その2マスの中心。artYは夏・秋で共通の「作業マスから約2.3タイル上＝柵の中の土の中心」オフセット
// （背景画像から実測した畑の中心 y≒297px とも一致することを確認済み・2026-07-25）
const PLOT_ART_SIZE = 71 * 1.1
const PLOT_LAYOUT: Record<string, { actRow: number; actCols: number[]; artX: number; artY: number }> = {
  plot_mao: { actRow: 11, actCols: [2, 3], artX: 96, artY: 11 * 32 - 73 + 16 },
  plot_kyounin: { actRow: 11, actCols: [6, 7], artX: 224, artY: 11 * 32 - 73 + 16 },
  plot_kakkon: { actRow: 11, actCols: [10, 11], artX: 352, artY: 11 * 32 - 73 + 16 },
}

export class AutumnHomeScene extends GridScene {
  protected sceneSeason: Season = 'autumn'
  private plotImages: Record<string, Phaser.GameObjects.Image> = {}
  private enteringGate = false // 門のフェード中に再度onEnterが走っても二重遷移しないためのガード

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
      // 上中央: 秋の種の聖域へ（聖域側の戻り口が最下段r21のため、到着は少し手前のr19）
      '2,14': { exit: { targetScene: 'AutumnSeedFieldScene', spawnCol: 14, spawnRow: 19 } },
      '2,15': { exit: { targetScene: 'AutumnSeedFieldScene', spawnCol: 14, spawnRow: 19 } },
      // 右の工房入口
      '11,23': { exit: { targetScene: 'AutumnWorkshopScene', spawnCol: 14, spawnRow: 19 } },
      // 下端: 夏の里へ戻る（夏側は秋の門(3,25)の下に出現）
      '20,14': { exit: { targetScene: 'SummerHomeScene', spawnCol: 25, spawnRow: 4 } },
      '20,15': { exit: { targetScene: 'SummerHomeScene', spawnCol: 25, spawnRow: 4 } },
      // 右上: 冬への門。解放済みなら通常のexitマスと同じ手順（フェード→遷移）で冬の里へ。
      // 座標はトレースで「右上の通路の最奥＝到達できる一番上のマス」がr4と判明したため(3,24)(3,25)から移設（2026-07-25）
      '4,24': { data: { kind: 'seasonGate', message: '冬への門は固く閉ざされている……。この里のみんなを癒やせば、道が開けるのだろうか' } },
      '4,25': { data: { kind: 'seasonGate', message: '冬への門は固く閉ざされている……。この里のみんなを癒やせば、道が開けるのだろうか' } },
      // 花占いのポスト（§9-11・広場中央）。調べマスは奥側(14,*)。
      // 2026-07-26追加: 手前側(16,*)にも同じデータを登録する。ポスト本体(15,*)自体にはCellSpecが
      // 無いため、南から正対して近づいた場合isFacingOrOnKindの「向いている先」判定が
      // ポストマスに届かず反応しなかった（冬は調べマスが元から手前側にあり無関係だった）
      '14,14': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
      '14,15': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
      '16,14': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
      '16,15': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
    }
    // 畑3区画。作業マスは1区画あたり2マスあり、どちらに立ってもその区画を操作できる
    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      for (const col of pos.actCols) specs[`${pos.actRow},${col}`] = { data: plots[plotId] }
    }
    return specs
  }

  protected onReady() {
    // シーンインスタンスは再利用されるため、前回の門通過で立てたフラグを毎回リセットする
    // （HomeScene/SummerHomeSceneと同じ2026-07-24修正。リセットが無いと一度通過した門を二度と通れなくなる）
    this.enteringGate = false
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

    // 花占いのポスト（春夏と同じuranai.webp16コマ）。本体マスは通行不可にし、その1マス上を調べマスにする
    for (const col of URANAI_POST.cols) this.blockCell(URANAI_POST.row, col)
    const postX = ((URANAI_POST.cols[0] + URANAI_POST.cols[1]) / 2) * 32 + 16
    const post = this.add.image(postX, URANAI_POST.row * 32 + 26, 'hanauranai_post_1')
    this.fitImage(post, 68)
    this.registerDepthSortedProp(post, URANAI_POST.row) // 調べマス(14,*)は奥側＝トリカは隠れる
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
    showMessage('秋の里（雑賀の拠点）。上=種の聖域、右=工房、下=夏の里へ。畑の手前でSpaceキーを押して種植え/収穫')
  }

  protected onEnter(spec: CellSpec) {
    const data = spec.data as ({ kind?: string; message?: string } & Partial<PlotState>) | undefined
    // 冬への門: 解放済みならフェード→遷移。旧セーブ救済も夏の秋門と同じ方式（2026-07-25接続）
    if (data?.kind === 'seasonGate') {
      if (!stageUnlocks.winter && winterGateConditionMet()) unlockWinter()
      if (stageUnlocks.winter && !this.enteringGate) {
        this.enteringGate = true
        this.cameras.main.fadeOut(200, 0, 0, 0)
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('WinterHomeScene', { spawnCol: 14, spawnRow: 19 })
        })
        return
      }
    }
    if (data?.crop) {
      showMessage(`ここは${KIND_LABELS_RUBY[data.crop]}を植える場所`)
      return
    }
    if (data?.message) showMessage(data.message)
  }

  protected onAction(spec: CellSpec | undefined) {
    const data = spec?.data as { kind?: string } | undefined
    if (data?.kind === 'hanauranai' || this.isFacingOrOnKind('hanauranai')) {
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
        this.fitImage(img, PLOT_ART_SIZE)
      }
      img.setVisible(true)
    }
  }
}
