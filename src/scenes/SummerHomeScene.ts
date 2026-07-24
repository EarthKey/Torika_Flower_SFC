import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { playBgm } from '../state/bgm'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { openDialogue } from '../ui/dialogue'
import { fortuneLines } from '../state/fortuneData'
import { plots, plantOn, harvestFrom, growthStageOf, stageUnlocks, unlockAutumn, KIND_LABELS, KIND_LABELS_RUBY, type PlotState } from '../state/gameState'
import { allStage2QuestsEverDelivered } from '../state/questData'

// 夏の里（ステージ2・風魔エリア）。Stage_Summer.webpをそのまま床に敷く一枚絵背景モード。
// レイアウト: 上中央=青竹の関所（種の聖域へ）、右上=施錠された秋の門、右=夏の工房、
// 左=畑3区画（芍薬・桂皮・生姜）、右下=花占いポスト、下端=春の里への道（春からの到着点）。
// 通行マスクと各マスは本人がマッピングツールで塗った Stage_Summer.json（2026-07-20版）を採用。
//
// NPC配置（2026-07-19本人確定・スプライト生成後にaddNpcを有効化）:
// イズナ=(6,4)（春と同じ左上の平地・全ステージ共通ポジション）
// 蛇ノ目=(17,6)（春で咲耶がいた位置相当）／イブキ=(10,27)（春でネムがいた位置相当）
// アウンは夏の工房の中（SummerWorkshopScene側で配置）

const COLS = 30
const ROWS = 22

// Stage_Summer.json（2026-07-20・本人トレース）のmaskをそのまま採用
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############.###############', // r2 青竹の関所（種の聖域へ）(c14)
  '##############.##########..###', // r3 秋の門前(c25-26)
  '##############.##########..###', // r4
  '##############.##########..###', // r5
  '####..########.##########..###', // r6 左上の平地（イズナ予定地 (6,4)）
  '####..########.###########.###', // r7
  '##...............#########.###', // r8 畑の上の道
  '##############.###########.###', // r9
  '##############.###########..##', // r10 イブキ予定地(10,27)
  '##############.######.####.###', // r11 工房の入口(c21)
  '###.###.##.###.######.####.###', // r12 畑の作業マス(c3/c7/c10)
  '##.........................###', // r13 下の横断道路
  '##.###...##.......########.###', // r14
  '##.##....##.......########.###', // r15
  '#####....##.......########.###', // r16
  '######...##.......########.###', // r17 蛇ノ目予定地(17,6)
  '######..######.###########.###', // r18 花占いの調べマス(18,26)
  '##############.###############', // r19
  '##############.###############', // r20 下端=春の里への道
  '##############################', // r21
]

// NPCの立ち位置（Stage_Summer.jsonの紫マス・2026-07-19本人確定/2026-07-20マップ実測）。
// イズナ=左上の平地(6,4)（全ステージ共通ポジション）、蛇ノ目=左中段の平地(17,6)（春で咲耶がいた位置相当）、
// イブキ=右の道の中腹(10,27)（春でネムがいた位置相当）。アウンは夏の工房の中（別ファイル）
const NPC_LAYOUT = [
  { chara: 'izuna', row: 6, col: 4 },
  // 蛇ノ目: 2026-07-20本人指示で右上に寄りすぎとのことで左下へ再調整（15,7）→（16,6）
  { chara: 'janome', row: 16, col: 6 },
  // イブキ: 2026-07-20本人指示で(9,26)からさらに1マス右へ（9,27）。
  // (9,27)は当たり判定上は壁だが、NPCが立つマスとして問題なし（トリカは隣接マスから話しかける）
  { chara: 'ibuki', row: 9, col: 27 },
]

// 畑の作業マス（Stage_Summer.jsonの紫マス）と、成長スプライトを重ねる位置。
// artX/artYは春（HomeScene）と同じく「actRowの手前に立つ通路」から柵の中の土の中心までの
// オフセット（-73px≒2.3タイル分上）を踏襲した値。2026-07-20実機評: 苗が柵の下の通路に
// はみ出ていたため、タイル中心そのまま(actRow*32+16)から柵内の土の中心へ引き上げ修正
// 2026-07-20本人実機評その2: 3区画ともマップの柵より少し上に浮いて見えたため下へ16px（半マス）。
// 右端（生姜）だけさらに右へ16px（半マス）もずれていたため右方向にも補正
// 2026-07-20本人実機評その3: 左端（芍薬）を数px右へ、中央（桂皮）を気持ち左へ微調整。
// 3区画とも見た目を1.1倍に拡大
const PLOT_ART_SIZE = 71 * 1.1
const PLOT_LAYOUT: Record<string, { actRow: number; actCol: number; artX: number; artY: number }> = {
  plot_syakuyaku: { actRow: 12, actCol: 3, artX: 3 * 32 + 16 + 4, artY: 12 * 32 - 73 + 16 },
  plot_keihi: { actRow: 12, actCol: 7, artX: 7 * 32 + 16 - 4, artY: 12 * 32 - 73 + 16 },
  plot_syoukyou: { actRow: 12, actCol: 10, artX: 10 * 32 + 16 + 16, artY: 12 * 32 - 73 + 16 },
}

export class SummerHomeScene extends GridScene {
  protected sceneSeason: 'spring' | 'summer' = 'summer'
  private plotImages: Record<string, Phaser.GameObjects.Image> = {}
  private enteringGate = false // 門のフェード中に再度onEnterが走っても二重遷移しないためのガード

  constructor() {
    super(
      'SummerHomeScene',
      { type: 'image', textureKey: 'bg_summer_home', cols: COLS, rows: ROWS, walkMask: WALK_MASK },
      14,
      19, // 既定スポーン=下端の春側入口の上（春→夏の到着点。2026-07-20入れ替え）
    )
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {
      // 上中央の青竹の関所: 夏の種の聖域へ（春の里と同じ「上=聖域」の構造。2026-07-20本人指示で
      // 上下を入れ替え: 春からの到着は下端、上の関所は聖域行き）
      '2,14': { exit: { targetScene: 'SummerSeedFieldScene', spawnCol: 15, spawnRow: 18 } },
      // 右の夏の工房の入口（春と同じc21の縦通路の突き当たり）
      '11,21': { exit: { targetScene: 'SummerWorkshopScene', spawnCol: 15, spawnRow: 19 } },
      // 下端: 春の里へ戻る（春側は季節の門(3,25)の下に出現）
      '20,14': { exit: { targetScene: 'HomeScene', spawnCol: 25, spawnRow: 4 } },
      // 右上: 秋への門。解放済みなら通常のexitマスと同じ手順（フェード→遷移）で秋の里へ（2026-07-24接続）
      '3,25': { data: { kind: 'seasonGate', message: '秋への門は固く閉ざされている……。この里のみんなを癒やせば、道が開けるのだろうか' } },
      '3,26': { data: { kind: 'seasonGate', message: '秋への門は固く閉ざされている……。この里のみんなを癒やせば、道が開けるのだろうか' } },
      // 花占いのポスト（§9-11・各ステージ右下）。結果は日付で決まるため春と同じ結果が出る。
      // 2026-07-20本人指示: ポスト本体を1マス上(18,26)へ移動 → 調べマスはその1マス上(17,26)
      '17,26': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
    }
    // 畑3区画（芍薬・桂皮・生姜）。乗った瞬間にonEnterで案内テキストを出す（春と同じ方式）
    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      specs[`${pos.actRow},${pos.actCol}`] = { data: plots[plotId] }
    }
    return specs
  }

  protected onReady() {
    // シーンインスタンスは再利用されるため、前回の門通過で立てたフラグを毎回リセットする
    // （2026-07-24修正: HomeScene.tsと同じ不具合。リセットが無いと秋の門を一度通過した後、
    // 再訪しても二度と通れなくなる）
    this.enteringGate = false
    // 夏の里BGM（SUNO制作・2026-07-19生成のStage2.wav）
    playBgm(this, 'bgm_stage2')

    // 畑の土の中心に成長段階スプライトを重ねる（stage 0 のときは非表示。春のHomeScene方式と同一）
    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      const img = this.add.image(pos.artX, pos.artY, `${plots[plotId].crop}_stage1`)
      this.fitImage(img, PLOT_ART_SIZE)
      img.setDepth(5)
      img.setVisible(false)
      this.plotImages[plotId] = img
    }
    this.refreshPlots()
    this.time.addEvent({ delay: 200, loop: true, callback: () => this.refreshPlots() })

    // NPC（イズナ・蛇ノ目・イブキ）を配置。アウンは夏の工房の中（SummerWorkshopScene側）。
    // 待機ループ・当たり判定・話しかけはGridScene共通処理
    for (const npc of NPC_LAYOUT) {
      this.addNpc(npc.chara, npc.row, npc.col)
    }

    // 花占いのポスト（春と同じuranai.webp16コマを右下に設置。2026-07-20本人指示で1マス上へ移動:
    // 本体=(18,26)に描いて通行不可にし、調べマスは(17,26)）
    this.blockCell(18, 26)
    const post = this.add.image(26 * 32 + 16, 18 * 32 + 26, 'hanauranai_post_1')
    this.fitImage(post, 68)
    post.setDepth(12)
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
    showMessage('夏の里（風魔の拠点）。上=種の聖域、右=工房、下=春の里へ。畑の手前でSpaceキーを押して種植え/収穫')
  }

  protected onEnter(spec: CellSpec) {
    const data = spec.data as ({ kind?: string; message?: string } & Partial<PlotState>) | undefined
    // 秋への門: 解放済みならフェード→遷移。旧セーブ救済も春の季節の門と同じ方式（2026-07-24接続）
    if (data?.kind === 'seasonGate') {
      if (!stageUnlocks.autumn && allStage2QuestsEverDelivered()) unlockAutumn()
      if (stageUnlocks.autumn && !this.enteringGate) {
        this.enteringGate = true
        this.cameras.main.fadeOut(200, 0, 0, 0)
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('AutumnHomeScene', { spawnCol: 14, spawnRow: 19 })
        })
        return
      }
    }
    // 畑: 乗った瞬間に案内テキストを出す（春と同じ方式）
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
        this.fitImage(img, PLOT_ART_SIZE)
      }
      img.setVisible(true)
    }
  }
}
