import Phaser from 'phaser'
import { setDialogueData } from '../state/dialogueData'
import { RECIPES } from '../state/gameState'

// 全アセットの一括読み込み。完了後にHomeSceneへ遷移する。
// 画像は scripts/extract-assets.mjs が生成した public/assets/ 配下のPNG。

const KINDS = ['kanzou', 'syoubaku', 'taisou'] as const
const SUMMER_KINDS = ['syakuyaku', 'keihi', 'syoukyou'] as const
const AUTUMN_KINDS = ['mao', 'kyounin', 'kakkon'] as const
// 乾姜(kankyou)の種・成長段階は生姜のPNGをkankyou名で複製したもの（extract-assets.mjs参照）
const WINTER_KINDS = ['kankyou', 'ninjin', 'byakujutsu'] as const

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload() {
    // タイトルロゴ（木札デザイン・透過webp）
    this.load.image('title_logo', 'assets/bg/title_logo.webp')

    // 全ステージ、コンセプト画をそのまま床に敷く一枚絵背景モード
    this.load.image('bg_home', 'assets/bg/home_stage.webp')
    this.load.image('bg_workshop', 'assets/bg/workshop_stage.webp')
    // 春の種の聖域はV3画像（生薬植生スポット版・2026-07-19）へ差し替え済み。
    // SeedFieldSceneの通行マスク/スポット座標は旧画像のトレースのままなので、再トレース待ち
    this.load.image('bg_seedfield', 'assets/bg/seedfield_stage.webp')
    // ステージ2（夏・風魔）の3マップ（2026-07-19仮組み）
    this.load.image('bg_summer_home', 'assets/bg/summer_home_stage.webp')
    this.load.image('bg_summer_workshop', 'assets/bg/workshop_summer_stage.webp')
    this.load.image('bg_summer_seedfield', 'assets/bg/seedfield_summer_stage.webp')
    // ステージ3（秋・雑賀）の3マップ（2026-07-24仮組み）
    this.load.image('bg_autumn_home', 'assets/bg/autumn_home_stage.webp')
    this.load.image('bg_autumn_workshop', 'assets/bg/workshop_autumn_stage.webp')
    this.load.image('bg_autumn_seedfield', 'assets/bg/seedfield_autumn_stage.webp')
    // ステージ4（冬・伊賀）の3マップ（2026-07-25仮組み）
    this.load.image('bg_winter_home', 'assets/bg/winter_home_stage.webp')
    this.load.image('bg_winter_workshop', 'assets/bg/workshop_winter_stage.webp')
    this.load.image('bg_winter_seedfield', 'assets/bg/seedfield_winter_stage.webp')

    // プレイヤー（トリカ歩行モーション: 正面・側面・背面 × 4ポーズ。右向きは側面を反転）
    // 1=接地(右腕前) 2=直立(通過) 3=接地(左腕前・1の反転) 4=直立(通過)
    for (const dir of ['front', 'side', 'back']) {
      for (let f = 1; f <= 4; f++) {
        this.load.image(`torika_walk_${dir}_${f}`, `assets/chara/torika_walk_${dir}_${f}.png`)
      }
    }

    // NPC待機モーション（12コマ連続フレーム。咲耶/イズナ=第4版、シャオラン=腕組み、ネム=腰当て＋髪なびき、
    // 蛇ノ目=片腕で頬杖、アウン=仁王立ち、イブキ=両手を前で重ねる。ステージ2・2026-07-20生成）
    for (const chara of ['sakuya', 'izuna', 'xiaolan', 'nemu', 'janome', 'aum', 'ibuki', 'shiba', 'nekomata', 'benten', 'anne', 'yui', 'hayate']) {
      for (let f = 1; f <= 12; f++) {
        this.load.image(`${chara}_idle_${f}`, `assets/chara/${chara}_idle_${f}.png`)
      }
    }
    // 会話イベントの単発リアクション用（旧3モーション版から切り出した4コマ素材）
    for (const [chara, motion] of [
      ['sakuya', 'greet'],
      ['sakuya', 'kiai'],
      ['izuna', 'greet'],
      ['izuna', 'think'],
    ] as const) {
      for (let f = 1; f <= 4; f++) {
        this.load.image(`${chara}_${motion}_${f}`, `assets/chara/${chara}_${motion}_${f}.png`)
      }
    }

    for (const k of [...KINDS, ...SUMMER_KINDS, ...AUTUMN_KINDS, ...WINTER_KINDS]) {
      this.load.image(`seed_field_${k}`, `assets/items/seed_field_${k}.png`)
      this.load.image(`seed_bag_${k}`, `assets/items/seed_bag_${k}.png`)
      this.load.image(`medal_${k}`, `assets/items/medal_${k}.png`)
      for (let s = 1; s <= 4; s++) {
        this.load.image(`${k}_stage${s}`, `assets/plants/${k}_stage${s}.png`)
      }
    }
    // 演出素材: ワープ魔法陣4色＋調合マーク（各16コマ、scripts/extract-effects.mjs が生成）と
    // 花占いポスト（§9-11・16コマゆらぎ、scripts/extract-uranai.mjs が生成）
    for (const key of ['warp_pink', 'warp_blue', 'warp_yellow', 'warp_green', 'mark_compound', 'hanauranai_post']) {
      for (let f = 1; f <= 16; f++) {
        this.load.image(`${key}_${f}`, `assets/effects/${key}_${f}.png`)
      }
    }

    // 調合成功のカットインムービー（PV素材・動画31.mp4の再利用。冒頭のUIモック0.3秒と
    // 四辺の透かしをカット・音声なし。2026-07-19試験導入・2026-07-21よりDOM側の<video>で
    // 直接参照する形に変更したためPhaserへの読み込みは不要になった）

    // 会話データ（顔グラ画像はDOM側で直接<img>参照するためPhaserには読み込まない）
    this.load.json('dialogues', 'data/dialogues.json')

    // BGM（SUNO制作・2026-07-18採用）。title=タイトル / stage1=春の里 / stage2=夏の里（2026-07-19生成）/
    // stage3=秋の里 / stage4=冬の里（2026-07-25生成・§7系プロンプト）/ seed=種の聖域 / koubou=工房
    for (const key of ['title', 'stage1', 'stage2', 'stage3', 'stage4', 'seed', 'koubou']) {
      this.load.audio(`bgm_${key}`, [`assets/bgm/${key}.ogg`, `assets/bgm/${key}.m4a`])
    }

    // 甘麦大棗湯（完成薬）と工房の置物
    // 完成薬アイコンはツムラ実物準拠の色・ライン入り12バリエーション（§9-9・scripts/make-kusuri-variants.mjs生成）。
    // RECIPESに登録された処方ぶんを kusuri_<id> のキーで読み込む（処方追加はRECIPESに足すだけ）
    for (const r of RECIPES) this.load.image(`kusuri_${r.id}`, r.icon)
    this.load.image('kusuri_glow', 'assets/items/kusuri_glow.png')
    this.load.image('kusuri_bowl', 'assets/items/kusuri_bowl.png')
  }

  create() {
    setDialogueData(this.cache.json.get('dialogues'))
    this.scene.start('TitleScene')
  }
}
