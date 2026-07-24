import Phaser from 'phaser'
import { GridScene, type CellSpec } from './GridScene'
import { DOOR_ENTRY } from './WorkshopScene'
import { playBgm } from '../state/bgm'
import { plots, plantOn, harvestFrom, growthStageOf, stageUnlocks, unlockSummer, KIND_LABELS, KIND_LABELS_RUBY, type PlotState } from '../state/gameState'
import { updateHud, showMessage, showToast } from '../ui/hud'
import { openDialogue, type DialogueLine } from '../ui/dialogue'
import { fortuneLines } from '../state/fortuneData'
import { allStage1QuestsEverDelivered } from '../state/questData'

// 春ステージ（自宅・里）V2.3。コンセプト画（stage1.webp）をそのまま床に敷く一枚絵背景モード。
// 通行判定は下のASCIIマスク（30×22、'#'=通行不可）で画像の川・建物・畑・木立に対応させている。
// レイアウト: 上中央=鳥居(種の聖域へ)、右上=施錠された季節の門、門から右端沿い→工房裏手→下の道へ合流、
// 右=工房(入口ポーチから調合部屋へ)、左中央=畑3区画、左上/左下=開けた平地(NPC予定地)、下中央=円形広場

const COLS = 30
const ROWS = 22

// 当たり判定マッピングツール（tools/stage-mapper）でトレースした stage-map (1).json（2026-07-17版）を
// そのまま採用。前版からの変更: 鳥居の出口がr2へ、工房ポーチがr11-13の縦通路に、
// 季節の門前がr3へ、畑下の草原（咲耶の周辺）が歩行可能に拡張
const WALK_MASK = [
  '##############################', // r0
  '##############################', // r1
  '##############.###############', // r2 鳥居の出口(c14)
  '##############.##########.####', // r3 参道・季節の門前(c25)
  '##############.##########.####', // r4
  '##############.##########.####', // r5
  '###..#########.##########.####', // r6 左上の平地(c3-4)・イズナ(6,3)
  '###..#########.##########.####', // r7
  '##.............##########.####', // r8 畑の上の道
  '#############..##########..###', // r9
  '##############.###########..##', // r10 ネムの立ち位置(10,27)
  '##############.######.####.###', // r11 工房の入口ポーチ(c21)
  '##############.######.####.###', // r12
  '###.###.###.##.............###', // r13 畑の作業マス(c3/c7/c11)・工房下の横道の上段(c15-26。2026-07-19実機評: 道は2マス幅で描かれているのに1列しか歩けなかったズレを修正)
  '##.........................###', // r14 下の横断道路
  '##.#.....##...#...########.###', // r15 畑下の草原(左)・灯籠まわり
  '####.....##...#...########.###', // r16
  '#####....##.......########.###', // r17 咲耶(17,6)
  '#####...######.###########.###', // r18
  '##############.###########.###', // r19
  '##############.###############', // r20
  '##############################', // r21
]

// 畑の作業マス（柵の手前の通路口）と、成長スプライトを重ねる位置。
// artX/artYは背景画像の土の領域を色検出で実測したキャンバス座標（土の中心にぴったり重ねる）。
// 95px（5%縮小）でも大きい評だったため、さらに75%の71pxに縮小（2026-07-17）
const PLOT_ART_SIZE = 71
const PLOT_LAYOUT: Record<string, { actRow: number; actCol: number; artX: number; artY: number }> = {
  plot_kanzou: { actRow: 13, actCol: 3, artX: 112, artY: 343 },
  plot_syoubaku: { actRow: 13, actCol: 7, artX: 233, artY: 344 },
  plot_taisou: { actRow: 13, actCol: 11, artX: 356, artY: 344 },
}

// NPCの立ち位置（マッピングツールで塗った紫のアクションマス準拠・2026-07-17）。
// イズナ=川近くの左上平地(6,3)、咲耶=畑下の草原(17,6)、ネム=右の道の中腹・工房裏手の脇(10,27)。
// 待機ループ・当たり判定・話しかけはGridScene.addNpc()の共通処理
const NPC_LAYOUT = [
  { chara: 'izuna', row: 6, col: 3 },
  { chara: 'sakuya', row: 17, col: 6 },
  { chara: 'nemu', row: 10, col: 27 },
]

// 「はじめから」直後にトリカ本人が話すチュートリアル会話（2026-07-18実装）。
// 案内役NPCのイズナ（仕様書§3）とは別に、主人公トリカ自身が喋る初めての場面。
// face番号: 1=通常 2=にっこり 3=驚き 4=困り 5=怒り/心配 6=真剣/微笑
// 名前欄は「漢字（読み）」形式（2026-07-19ルール）。guideは案内矢印の表示先（該当行の表示中だけ出す）
type IntroLine = DialogueLine & { guide?: 'seed' | 'field' | 'workshop' }
const INTRO_NAME = '酉花（トリカ）'
const INTRO_LINES: IntroLine[] = [
  { speaker: 'torika', name: INTRO_NAME, face: 2, text: 'わたしは酉花（トリカ）。この里で「花守り」をつとめる、花の薬師だよ。よろしくね！' },
  { speaker: 'torika', name: INTRO_NAME, face: 1, text: 'わたしのお仕事は、薬草を育ててお薬を作ること。目指すは、心をやわらげるお薬『甘麦大棗湯（かんばくたいそうとう）』！' },
  { speaker: 'torika', name: INTRO_NAME, face: 6, guide: 'seed', text: 'まずは上の鳥居をくぐって「種の聖域」へ。甘草（かんぞう）・小麦（しょうばく）・大棗（たいそう）、3つの種を集めてくるんだ。' },
  { speaker: 'torika', name: INTRO_NAME, face: 1, guide: 'field', text: '集めた種は左の畑にまいて、育ったら収穫。そうすると生薬（しょうやく）メダルが手に入るよ。' },
  { speaker: 'torika', name: INTRO_NAME, face: 2, guide: 'workshop', text: 'メダルが3種類そろったら、右の工房で調合！ これでお薬の完成だよ。' },
  { speaker: 'torika', name: INTRO_NAME, face: 1, text: '移動は矢印キーかWASD、行きたい場所をクリックでもOK。Spaceキーで調べたり、里のみんなとお話しできるよ。' },
  { speaker: 'torika', name: INTRO_NAME, face: 2, text: 'わからなくなったら、みんなに話しかけてみてね。……それじゃあ、花守りのお仕事、はじめよっか！' },
]

// 案内矢印を出す位置（マス座標基準のキャンバス座標）。
// seed=上の鳥居(2,14)の上空、field=畑3区画の中央（小麦の畑）の上空、workshop=工房入口ポーチ(11,21)の上空
const GUIDE_SPOTS: Record<'seed' | 'field' | 'workshop', { x: number; y: number }> = {
  seed: { x: 14 * 32 + 16, y: 44 },
  field: { x: 7 * 32 + 16, y: 8 * 32 + 4 },
  workshop: { x: 21 * 32 + 16, y: 10 * 32 - 6 },
}

export class HomeScene extends GridScene {
  private plotImages: Record<string, Phaser.GameObjects.Image> = {}
  private introPending = false
  private guideArrow?: Phaser.GameObjects.Image
  private enteringGate = false // 門のフェード中に再度onEnterが走っても二重遷移しないためのガード

  // チュートリアルの案内矢印テクスチャ（赤・下向き・白フチ）。図形の組み合わせだと
  // Phaserの原点計算で軸と三角がずれるため、1枚のテクスチャに焼いて使う（2026-07-19修正）
  private ensureArrowTexture() {
    if (this.textures.exists('guide_arrow')) return
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    g.lineStyle(3, 0xffffff, 1)
    g.strokeRect(13, 2, 14, 20) // 軸の白フチ
    g.strokeTriangle(3, 22, 37, 22, 20, 43) // 矢先の白フチ
    g.fillStyle(0xe23b2e, 1)
    g.fillRect(13, 2, 14, 20) // 軸（つなぎ目の白線は後塗りの本体で消す）
    g.fillTriangle(3, 22, 37, 22, 20, 43) // 矢先
    g.generateTexture('guide_arrow', 40, 46)
    g.destroy()
  }

  // 案内矢印を対象入口の上空に表示し、上下にゆらゆら揺らす。
  // spot未指定なら消すだけ（会話が該当行を離れたとき・会話終了時）
  private showGuideArrow(spot?: 'seed' | 'field' | 'workshop') {
    this.guideArrow?.destroy()
    this.guideArrow = undefined
    if (!spot) return
    this.ensureArrowTexture()
    const pos = GUIDE_SPOTS[spot]
    const arrow = this.add.image(pos.x, pos.y, 'guide_arrow').setDepth(30)
    this.guideArrow = arrow
    this.tweens.add({
      targets: arrow,
      y: pos.y + 10,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })
  }

  constructor() {
    super('HomeScene', { type: 'image', textureKey: 'bg_home', cols: COLS, rows: ROWS, walkMask: WALK_MASK }, 14, 18)
  }

  init(data: { spawnCol?: number; spawnRow?: number; intro?: boolean }) {
    super.init(data)
    this.introPending = data?.intro === true
  }

  protected specials(): Record<string, CellSpec> {
    const specs: Record<string, CellSpec> = {
      // 上の鳥居: 種の聖域への出口（聖域側は下端の道r19が出口なので、その1マス上r18に出現）
      '2,14': { exit: { targetScene: 'SeedFieldScene', spawnCol: 15, spawnRow: 18 } },
      // 工房の入口ポーチ（縦通路c21の突き当たり）。出現は工房下端の扉のすぐ内側（2026-07-18修正）
      '11,21': { exit: { targetScene: 'WorkshopScene', spawnCol: DOOR_ENTRY.col, spawnRow: DOOR_ENTRY.row } },
      // 季節の門の前（門前の道の突き当たり）。解放判定はonEnterで毎回行う
      // （§2解放条件・2026-07-19確定: 依頼3件をすべて渡すと開く。specialsはシーン生成時に
      // 固まるため、滞在中に解放された場合もonEnter側の判定なら即座に通れる）
      '3,25': { data: { kind: 'seasonGate', message: '季節の門は固く閉ざされている……。次の季節へ進むには、まだ何かが足りないようだ' } },
      // 花占いのポスト（§9-11）: ポスト本体は(18,26)-(19,26)を占有し通行不可（onReadyでblockCell）。
      // 調べるマスはその手前(17,26)（2026-07-19実機評: 台の上に乗って見えたため1マス拡張）
      '17,26': { data: { kind: 'hanauranai', message: '花占いのポストがある。Spaceキーで「今日の花占い」' } },
    }
    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      // 畑の色枠は2026-07-20本人指示で廃止。代わりに乗った瞬間にonEnterで案内テキストを出す
      specs[`${pos.actRow},${pos.actCol}`] = { data: plots[plotId] }
    }
    return specs
  }

  protected onReady() {
    // シーンインスタンスは再利用されるため、前回の門通過で立てたフラグを毎回リセットする
    // （2026-07-24修正: リセットが無いと、一度門を通過した後は再訪しても二度と通れなくなるバグがあった）
    this.enteringGate = false
    playBgm(this, 'bgm_stage1')

    // はじめから: フェードインが落ち着いてからトリカのチュートリアル会話を開く。
    // 各行のonShowで案内矢印を出し分け、会話終了で必ず消す
    if (this.introPending) {
      this.introPending = false
      this.time.delayedCall(400, () =>
        openDialogue(
          INTRO_LINES.map((l) => ({ ...l, onShow: () => this.showGuideArrow(l.guide) })),
          () => this.showGuideArrow(undefined),
        ),
      )
    }

    // 畑の土の中心に成長段階スプライトを重ねる（stage 0 のときは非表示）
    for (const [plotId, pos] of Object.entries(PLOT_LAYOUT)) {
      const img = this.add.image(pos.artX, pos.artY, `${plots[plotId].crop}_stage1`)
      this.fitImage(img, PLOT_ART_SIZE)
      img.setDepth(5)
      img.setVisible(false)
      this.plotImages[plotId] = img
    }
    this.refreshPlots()

    // NPC（イズナ・咲耶・ネム）を配置。待機ループ・話しかけはGridScene共通処理
    for (const npc of NPC_LAYOUT) {
      this.addNpc(npc.chara, npc.row, npc.col)
    }

    // 花占いのポスト（§9-11）: 右下の道の突き当たりに立てて、絵が重なる(18,26)-(19,26)の2マスを通行不可にする。
    // 本人生成のuranai.webp16コマ（花飾りのゆれ＋水面の花びら）を90msループで再生
    this.blockCell(18, 26)
    this.blockCell(19, 26)
    const post = this.add.image(26 * 32 + 16, 18 * 32 + 26, 'hanauranai_post_1')
    this.fitImage(post, 68)
    // プレイヤー(depth10)より手前に描く: 調べるマス(17,26)はポストの奥側なので、手前に立ったトリカは
    // ポストの屋根に隠れるのが正しい見え方。下側から重なるルートは柵で存在しないため固定値でよい
    post.setDepth(12)
    let postFrame = 1
    this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        postFrame = (postFrame % 16) + 1
        post.setTexture(`hanauranai_post_${postFrame}`) // 全16コマ同寸で切り出し済みのためスケール再計算は不要
      },
    })

    updateHud()
    showMessage('矢印キー/WASDで移動。上の鳥居から種の聖域へ、工房の入口で調合部屋へ。畑の手前でSpaceキーを押して種植え/収穫')

    // 表示の更新のみ（成長判定はgameState側が実時間で行う）
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this.refreshPlots(),
    })
  }

  protected onEnter(spec: CellSpec) {
    const data = spec.data as ({ kind?: string; message?: string } & Partial<PlotState>) | undefined
    // 季節の門: 解放済みなら通常のexitマスと同じ手順（フェード→遷移）で夏の里へ。
    // 到着は夏の里の青竹の関所の下(3,14)。
    // 旧セーブ救済（2026-07-19）: 解放フラグ実装より前に依頼3件を達成済みだったセーブは
    // 「渡した瞬間」のトリガーが走っていないため、門に触れた時点でも達成歴を見て解放する
    if (data?.kind === 'seasonGate') {
      if (!stageUnlocks.summer && allStage1QuestsEverDelivered()) unlockSummer()
      if (stageUnlocks.summer && !this.enteringGate) {
        this.enteringGate = true
        this.cameras.main.fadeOut(200, 0, 0, 0)
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('SummerHomeScene', { spawnCol: 14, spawnRow: 19 })
        })
        return
      }
    }
    // 畑: 乗った瞬間に案内テキストを出す（2026-07-20本人指示。色枠の代わり）
    if (data?.crop) {
      showMessage(`ここは${KIND_LABELS_RUBY[data.crop]}を植える場所`)
      return
    }
    if (data?.message) showMessage(data.message)
  }

  protected onAction(spec: CellSpec | undefined) {
    // 花占い（§9-11）: トリカの独白。結果は日付で決まり、同じ日は何度見ても同じ
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
      // 収穫カーブ（§9-10）の上振れは一言添えて「待った甲斐」を演出する
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
