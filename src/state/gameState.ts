// プレイヤーの所持品・進行状態。まだ絵がない段階なので純粋なロジックだけを持つ。

import { playSfx } from './sfx'

// 4ステージ共通の季節タグ。GridScene.sceneSeason・dialogueData.pickTalk・
// 依頼の季節タグ(unlockSeason)などで共通利用する（2026-07-24〜）
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

// テストプレイ用の一時措置: trueにすると生薬メダル・完成薬の所持数を99固定にし、
// 調合・受け渡しで消費しても99に戻る。
// **2026-07-26に本番設定（false）へ戻した**。検証で一時的に立てたら必ず戻すこと
const TEST_UNLIMITED_KUSURI = false

// テストプレイ用の一時措置（2026-07-27）: trueにすると生薬メダルの初期所持数だけ99にする。
// TEST_UNLIMITED_KUSURIと違い、消費すればちゃんと減り、完成薬(kusuriCounts)も
// 調合で増える・渡して減るという通常の挙動のまま。渡す前後でセリフがどう変わるかを
// 確認したいときに使う。確認が終わったら必ずfalseに戻すこと
const TEST_START_WITH_MEDALS = true

// ステージ1（春・甲賀）3種＋ステージ2（夏・風魔）3種＋ステージ3（秋・雑賀）3種＋ステージ4（冬・伊賀）3種。
// ステージが増えるたびにここへ追加する。乾姜(kankyou)は生姜と同一植物のため種・成長段階の
// アセットは生姜(syoukyou)のものを流用する方針（2026-07-23本人指示）だが、レシピ上は
// 生姜と別数量で消費する生薬なのでSeedKind自体は独立させる（メダル絵柄のみ新規）
export type SeedKind =
  | 'kanzou'
  | 'syoubaku'
  | 'taisou'
  | 'syakuyaku'
  | 'keihi'
  | 'syoukyou'
  | 'mao'
  | 'kyounin'
  | 'kakkon'
  | 'kankyou'
  | 'ninjin'
  | 'byakujutsu'

// 種類ごとにどのステージ解放で出現するか（HUDの表示範囲の判定に使う。§2解放条件と連動）
export const KIND_STAGE: Record<SeedKind, Season> = {
  kanzou: 'spring',
  syoubaku: 'spring',
  taisou: 'spring',
  syakuyaku: 'summer',
  keihi: 'summer',
  syoukyou: 'summer',
  mao: 'autumn',
  kyounin: 'autumn',
  kakkon: 'autumn',
  kankyou: 'winter',
  ninjin: 'winter',
  byakujutsu: 'winter',
}

// 画面表示用の生薬名（メッセージ・トーストで使う。内部キーのローマ字を露出させない）
export const KIND_LABELS: Record<SeedKind, string> = {
  kanzou: '甘草',
  syoubaku: '小麦',
  taisou: '大棗',
  syakuyaku: '芍薬',
  keihi: '桂皮',
  syoukyou: '生姜',
  mao: '麻黄',
  kyounin: '杏仁',
  kakkon: '葛根',
  kankyou: '乾姜',
  ninjin: '人参',
  byakujutsu: '白朮',
}

// ふりがな付きの生薬名（2026-07-18）。漢方の読みは初見で読めないため、
// メッセージ・トーストでは原則こちらを使う（同一文中の2回目以降はKIND_LABELSで簡潔に）
export const KIND_LABELS_RUBY: Record<SeedKind, string> = {
  kanzou: '甘草（かんぞう）',
  syoubaku: '小麦（しょうばく）',
  taisou: '大棗（たいそう）',
  syakuyaku: '芍薬（しゃくやく）',
  keihi: '桂皮（けいひ）',
  syoukyou: '生姜（しょうきょう）',
  mao: '麻黄（まおう）',
  kyounin: '杏仁（きょうにん）',
  kakkon: '葛根（かっこん）',
  kankyou: '乾姜（かんきょう）',
  ninjin: '人参（にんじん）',
  byakujutsu: '白朮（びゃくじゅつ）',
}

export const gameState = {
  seeds: {
    kanzou: 0,
    syoubaku: 0,
    taisou: 0,
    syakuyaku: 0,
    keihi: 0,
    syoukyou: 0,
    mao: 0,
    kyounin: 0,
    kakkon: 0,
    kankyou: 0,
    ninjin: 0,
    byakujutsu: 0,
  } as Record<SeedKind, number>,
  medals: {
    kanzou: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    syoubaku: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    taisou: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    syakuyaku: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    keihi: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    syoukyou: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    mao: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    kyounin: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    kakkon: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    kankyou: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    ninjin: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
    byakujutsu: TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0,
  } as Record<SeedKind, number>,
  // 完成薬の所持数（処方IDごと・2026-07-19処方別化）。キーはRECIPESのid
  kusuriCounts: {} as Record<string, number>,
  // 一度でも調合したことがある処方（2026-07-21〜）。渡して所持数が0に戻ってもtrueのまま保つ。
  // HUDで「所持数0でも図鑑として表示し続けるか」の判定に使う（kusuriCountsは渡すたびに減るため流用不可）
  kusuriEverObtained: {} as Record<string, boolean>,
  // 累計調合数（薬依頼システム§9-8の発動条件用。薬を渡して手持ちが0になっても発動は維持される）
  totalKusuriCrafted: 0,
  // 裏話（全処方コンプのやりこみ報酬）を、そのキャラぶん一度でも読んだか（2026-07-26〜）。
  // 未読のうちは世間話より優先して再生し、読み終わったら通常プールへ合流させる
  urabanashiSeen: {} as Record<string, boolean>,
  // 特殊会話（里の外＝現実側の話をするメタ枠。2026-07-26〜）を、そのキャラぶん一度でも読んだか。
  // 裏話と同じ「全処方コンプ」で解放され、裏話を読み終えたキャラから順に再生される
  specialSeen: {} as Record<string, boolean>,
  // 変化（人間形態）の話（柴・猫又。2026-07-27〜）を一度でも読んだか。
  // そのキャラに薬を1件でも渡すと解放され、初回は世間話より優先して必ず流す（裏話と同じ方式）。
  // 「薬をくれた恩人にだけ、本当の姿を見せる」という信頼の演出のため、初対面では出さない
  hengeSeen: {} as Record<string, boolean>,
}

export function kusuriCountOf(recipeId: string): number {
  return gameState.kusuriCounts[recipeId] ?? 0
}

// ── NPCの信頼度・会話回数（仕様書§9-6の土台） ──────────
// 話しかけるたび trust と talkCount が1ずつ増える。会話プールの解放条件（minTrust）は
// public/data/dialogues.json 側に持ち、状態はここでセーブに含める。

export interface NpcState {
  trust: number
  talkCount: number
  trustGainedOn: string | null // 話しかけによるtrust+1を最後に得た日付キー（日次上限用・2026-07-22〜）
}

export const npcStates: Record<string, NpcState> = {
  izuna: { trust: 0, talkCount: 0, trustGainedOn: null },
  sakuya: { trust: 0, talkCount: 0, trustGainedOn: null },
  xiaolan: { trust: 0, talkCount: 0, trustGainedOn: null },
  nemu: { trust: 0, talkCount: 0, trustGainedOn: null },
  janome: { trust: 0, talkCount: 0, trustGainedOn: null },
  aum: { trust: 0, talkCount: 0, trustGainedOn: null },
  ibuki: { trust: 0, talkCount: 0, trustGainedOn: null },
  shiba: { trust: 0, talkCount: 0, trustGainedOn: null },
  nekomata: { trust: 0, talkCount: 0, trustGainedOn: null },
  benten: { trust: 0, talkCount: 0, trustGainedOn: null },
  anne: { trust: 0, talkCount: 0, trustGainedOn: null },
  yui: { trust: 0, talkCount: 0, trustGainedOn: null },
  hayate: { trust: 0, talkCount: 0, trustGainedOn: null },
}

// ── クロストーク解放数（春夏秋冬12キャラ共通・2026-07-24〜） ──────────
// 依頼完遂で段階的に増える特別な深い会話の解放数。各キャラの目標値はquestData.CROSS_TALK_TARGETSに
// 持たせ、季節タグ付き依頼を渡し終えるたびにquestData.checkCrossTalkUnlockから呼ばれる
export const npcCrossTalk: Record<string, number> = {
  sakuya: 0,
  xiaolan: 0,
  nemu: 0,
  janome: 0,
  aum: 0,
  ibuki: 0,
  shiba: 0,
  nekomata: 0,
  benten: 0,
  anne: 0,
  yui: 0,
  hayate: 0,
}

// クロストーク解放数をtierまで引き上げる（すでに到達済みなら何もしない）。
// 新規に引き上げたときだけtrueを返す（解放演出メッセージ用）
export function unlockCrossTalkTier(chara: string, tier: number): boolean {
  const current = npcCrossTalk[chara]
  if (current === undefined || current >= tier) return false
  npcCrossTalk[chara] = tier
  persist()
  return true
}

// 日付キー（例: 2026-07-22）。話しかけ+1の日次上限判定に使う
function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

// 話しかけるたびtalkCountは必ず+1（会話のローテーションに使うため）。
// trust+1は1日1回まで（放置ゲームとして日をまたぐごとに信頼度が育っていく体験にするため。2026-07-22本人指示）
export function recordTalk(chara: string) {
  const s = npcStates[chara]
  if (!s) return
  const today = todayKey()
  if (s.trustGainedOn !== today) {
    s.trust++
    s.trustGainedOn = today
  }
  s.talkCount++
  persist()
}

// イズナの深い会話の開放（§9-8）。「各ステージの流派キャラ3体に薬を渡し終えると開放」という
// 開放条件は"話しかけた回数"とは無関係のため、仕様書の指定どおり信頼度プール（minTrust）の仕組みに
// 接続する形で実現する: 条件達成時にイズナのtrustを専用の閾値まで一気に引き上げ、
// dialogues.json側のminTrust:10プールを解禁する。通常の会話でも自然に到達しうる値ではないよう、
// 話しかけ+1の蓄積とは別枠の一段大きい値にしてある
export const IZUNA_STAGE1_UNLOCK_TRUST = 10
// ステージ2〜4分の深い会話しきい値（2026-07-24追加）。段階を踏むごとに一段引き上げる方式は
// ステージ1と同じ。値は通常の話しかけ+1蓄積では自然に到達しない大きさにしてある
export const IZUNA_STAGE2_UNLOCK_TRUST = 20
export const IZUNA_STAGE3_UNLOCK_TRUST = 30
export const IZUNA_STAGE4_UNLOCK_TRUST = 40

export function unlockIzunaStage1Dialogue() {
  const s = npcStates.izuna
  if (!s || s.trust >= IZUNA_STAGE1_UNLOCK_TRUST) return
  s.trust = IZUNA_STAGE1_UNLOCK_TRUST
  persist()
}

export function unlockIzunaStage2Dialogue() {
  const s = npcStates.izuna
  if (!s || s.trust >= IZUNA_STAGE2_UNLOCK_TRUST) return
  s.trust = IZUNA_STAGE2_UNLOCK_TRUST
  persist()
}

export function unlockIzunaStage3Dialogue() {
  const s = npcStates.izuna
  if (!s || s.trust >= IZUNA_STAGE3_UNLOCK_TRUST) return
  s.trust = IZUNA_STAGE3_UNLOCK_TRUST
  persist()
}

export function unlockIzunaStage4Dialogue() {
  const s = npcStates.izuna
  if (!s || s.trust >= IZUNA_STAGE4_UNLOCK_TRUST) return
  s.trust = IZUNA_STAGE4_UNLOCK_TRUST
  persist()
}

// ── ステージ解放（§2季節の門・2026-07-19確定） ──────────
// 解放条件: そのステージの薬依頼を全キャラ分渡し終えること（ステージ1→2は咲耶・シャオラン・ネムの3依頼）。
// 解放は一度きり（24時間ループで依頼が復活しても門は閉じない）ためセーブに含める

export const stageUnlocks = { summer: false, autumn: false, winter: false }

// 夏の門を開く。今回の呼び出しで新規に開放されたときだけtrueを返す（開放の瞬間の演出メッセージ用）
export function unlockSummer(): boolean {
  if (stageUnlocks.summer) return false
  stageUnlocks.summer = true
  persist()
  return true
}

// 秋の門を開く（ステージ2の3依頼を渡し終えると解放。仕組みはunlockSummerと同じ）
export function unlockAutumn(): boolean {
  if (stageUnlocks.autumn) return false
  stageUnlocks.autumn = true
  persist()
  return true
}

// 冬の門を開く（ステージ3=柴・猫又・弁天の全依頼を渡し終えると解放。仕組みはunlockAutumnと同じ。2026-07-25追加）
export function unlockWinter(): boolean {
  if (stageUnlocks.winter) return false
  stageUnlocks.winter = true
  persist()
  return true
}

// 薬プレゼントのボーナス加算（仕様書§9-8「話しかけ=+1、薬プレゼント=ボーナス加算」の二段構え）
export function recordGift(chara: string, bonus: number) {
  const s = npcStates[chara]
  if (!s) return
  s.trust += bonus
  persist()
}

// ── 薬依頼の達成記録（仕様書§9-8） ──────────────────
// 依頼IDごとに「最後に薬を渡した時刻」を持つ。未達成なら記録なし。
// 24時間ループ（渡してから24時間で再依頼）は、この時刻との差分で後日実装する

export const questDeliveredAt: Record<string, number> = {}

export function markQuestDelivered(questId: string) {
  questDeliveredAt[questId] = Date.now()
  persist()
}

// 手持ちの薬を1個渡す。持っていなければ失敗
export function giveKusuri(recipeId: string): boolean {
  if ((gameState.kusuriCounts[recipeId] ?? 0) <= 0) return false
  gameState.kusuriCounts[recipeId]--
  if (TEST_UNLIMITED_KUSURI) gameState.kusuriCounts[recipeId] = 99 // テスト中は渡しても減らない
  persist()
  return true
}

// ── 畑の成長管理 ──────────────────────────────
// 「植えた時刻」をゲーム全体の状態として持ち、経過実時間から成長段階を算出する。
// これにより、別のマップ（種の聖域・工房）にいる間も畑は育ち続ける。
// 将来LocalStorageセーブに移行するときも plantedAtMs を保存するだけで済む。

// 本番バランス（2026-07-27改訂・本人指示で線形カーブへ再設計）。段階1→4に3段階ぶんかかるので、
// 2時間×3＝**6時間で収穫可能**になる（収穫カーブの最初の刻みと一致させる。§下記参照）
// TEST_FAST_GROWTH: 実機プレイ確認用の一時短縮。確認が終わったら必ず false に戻すこと
const TEST_FAST_GROWTH = true
export const GROWTH_MS_PER_STAGE = TEST_FAST_GROWTH ? 5 * 1000 : 2 * 60 * 60 * 1000

export interface PlotState {
  crop: SeedKind
  plantedAtMs: number | null // nullなら未植え
}

// 畑3区画×ステージ分（春の里・夏の里・秋の里・冬の里）。マスの担当作物は固定。
// 冬は乾姜(kankyou)も畑に植えられる作物として扱う（見た目は生姜のスプライトを流用するが、
// 所持数・畑の区画はSeedKind上は独立している）
export const plots: Record<string, PlotState> = {
  plot_kanzou: { crop: 'kanzou', plantedAtMs: null },
  plot_syoubaku: { crop: 'syoubaku', plantedAtMs: null },
  plot_taisou: { crop: 'taisou', plantedAtMs: null },
  plot_syakuyaku: { crop: 'syakuyaku', plantedAtMs: null },
  plot_keihi: { crop: 'keihi', plantedAtMs: null },
  plot_syoukyou: { crop: 'syoukyou', plantedAtMs: null },
  plot_mao: { crop: 'mao', plantedAtMs: null },
  plot_kyounin: { crop: 'kyounin', plantedAtMs: null },
  plot_kakkon: { crop: 'kakkon', plantedAtMs: null },
  plot_kankyou: { crop: 'kankyou', plantedAtMs: null },
  plot_ninjin: { crop: 'ninjin', plantedAtMs: null },
  plot_byakujutsu: { crop: 'byakujutsu', plantedAtMs: null },
}

// 0=未植え, 1=種, 2=芽, 3=成長中, 4=収穫可能
export function growthStageOf(plot: PlotState, nowMs = Date.now()): number {
  if (plot.plantedAtMs === null) return 0
  const elapsed = nowMs - plot.plantedAtMs
  return Math.min(4, 1 + Math.floor(elapsed / GROWTH_MS_PER_STAGE))
}

export function plantOn(plot: PlotState): boolean {
  if (plot.plantedAtMs !== null) return false
  if (gameState.seeds[plot.crop] <= 0) return false
  gameState.seeds[plot.crop]--
  plot.plantedAtMs = Date.now()
  playSfx('plant')
  persist()
  return true
}

// ── 収穫カーブ（仕様書§9-10。2026-07-27に本人指示で線形カーブへ再設計） ──────────
// HARVEST_STEP_MS = 段階1→4に要する時間 = 6時間。ランダム幅は廃止し、6時間刻みの線形で
// 待った分だけ素直に増える設計にした:
//   6時間=1個 / 12時間=2個 / 18時間=3個 / 24時間=4個で頭打ち
// 旧カーブ（12時間=1個固定 / 24時間以上=2〜4個ランダム）は「待っても増えない/一気に増える」の
// 段差と乱数が分かりにくいという理由で廃止（本人判断）

export const HARVEST_STEP_MS = GROWTH_MS_PER_STAGE * 3 // = 6時間

export function harvestYieldOf(plot: PlotState, nowMs = Date.now()): number {
  if (plot.plantedAtMs === null) return 0
  const steps = Math.floor((nowMs - plot.plantedAtMs) / HARVEST_STEP_MS)
  return Math.min(4, steps) // 6h=1 / 12h=2 / 18h=3 / 24h=4で頭打ち
}

// 収穫。育ちきっていなければ0、収穫できたら獲得したメダル数を返す
export function harvestFrom(plot: PlotState): number {
  if (growthStageOf(plot) !== 4) return 0
  const gained = harvestYieldOf(plot)
  plot.plantedAtMs = null
  gameState.medals[plot.crop] += gained
  playSfx('get')
  persist()
  return gained
}

export function addSeed(kind: SeedKind) {
  gameState.seeds[kind]++
  persist()
}

// ── 種の採取クールダウン ──────────────────────
// 採取スポットは1回採ると**6時間**後に次の種が出る（2026-07-26本人決定。旧60分から延長）。
// 採取時刻を保存し、経過実時間で判定するので、ブラウザを閉じていても回復が進む。

export const SEED_COOLDOWN_MS = 6 * 60 * 60 * 1000

export const seedSpotCollectedAt: Record<SeedKind, number | null> = {
  kanzou: null,
  syoubaku: null,
  taisou: null,
  syakuyaku: null,
  keihi: null,
  syoukyou: null,
  mao: null,
  kyounin: null,
  kakkon: null,
  kankyou: null,
  ninjin: null,
  byakujutsu: null,
}

export function seedCooldownRemainMs(kind: SeedKind, nowMs = Date.now()): number {
  const last = seedSpotCollectedAt[kind]
  if (last === null) return 0
  return Math.max(0, SEED_COOLDOWN_MS - (nowMs - last))
}

// 採取を試みる。クールダウン中は残り時間を返して失敗する
export function collectSeed(kind: SeedKind): { ok: boolean; remainMs: number } {
  const remain = seedCooldownRemainMs(kind)
  if (remain > 0) return { ok: false, remainMs: remain }
  seedSpotCollectedAt[kind] = Date.now()
  gameState.seeds[kind]++
  playSfx('get')
  persist()
  return { ok: true, remainMs: 0 }
}

export function addMedal(kind: SeedKind) {
  gameState.medals[kind]++
  persist()
}

// ── レシピ（仕様書§9-10・レシピ分量表.md 2026-07-19本人サイン済み） ──────────
// 処方ごとに必要メダル数を持つ。分量は実際の漢方の分量比をゆるく反映する。
// ステージ2以降の処方はRECIPESに追記するだけで増やせる（所持数の処方別化と
// HUDの11処方対応は§9-9のUI再設計とあわせて行う）

export interface Recipe {
  id: string
  name: string
  ruby: string
  cost: Partial<Record<SeedKind, number>>
  icon: string // 完成薬アイコン（§9-9・ツムラ実物準拠12バリエーション）
  // 解説カードの番号表示（例: ツムラ 72番）。ゲームがその製品を直接取り扱っている・提携しているという
  // 誤解を避けるため、UI側（hud.ts）で「実際に市販されている製品名の一例（参考）」と明示した上で表示する
  // （2026-07-21・本人指摘）。番号なし処方は「古典処方」等
  numberLabel: string
  desc: string // 解説カードの短い解説文（医学的表現はfact-check→本人確認の対象）
  // 見開き2枚の紹介イラスト（2026-07-21〜。本人が色鉛筆風で個別生成）。
  // [0]=かんたん紹介カード [1]=生薬の設定資料集ページ。未生成の処方はundefinedのまま
  // （hud.ts側で従来のテキストカード表示にフォールバックする）
  settei?: [string, string]
}

export const RECIPES: Recipe[] = [
  {
    // 最初のチュートリアル処方（§9-7: 甘草の単味）。ゲームテンポ優先で必要メダル1個（分量表の確定例外）
    id: 'kanzoto',
    name: '甘草湯',
    ruby: 'かんぞうとう',
    cost: { kanzou: 1 },
    icon: 'assets/items/kusuri/kusuri_kanzoto.png',
    numberLabel: 'クラシエ 401番',
    desc: 'たったひとつの生薬・甘草だけで作れる、いちばんシンプルなお薬。のどが痛いときや、はげしい咳に使われてきた。実物は甘草をたっぷり使うのが特徴。',
    settei: ['assets/items/kusuri/settei/kanzoto_1.webp', 'assets/items/kusuri/settei/kanzoto_2.webp'],
  },
  {
    id: 'kanbakutaisouto',
    name: '甘麦大棗湯',
    ruby: 'かんばくたいそうとう',
    cost: { kanzou: 1, syoubaku: 3, taisou: 1 }, // 実比 甘草5g:小麦20g:大棗6g の丸め
    icon: 'assets/items/kusuri/kusuri_kanbakutaisouto.png',
    numberLabel: 'ツムラ 72番',
    desc: '甘草・小麦・大棗、3つの生薬でつくる、心をやわらげるお薬。気持ちの昂ぶりや不安、子どもの夜泣きに古くから使われてきた。いちばん多く入っているのは小麦。',
    settei: ['assets/items/kusuri/settei/kanbakutaisouto_1.webp', 'assets/items/kusuri/settei/kanbakutaisouto_2.webp'],
  },
  // ── ステージ2（夏・風魔）追加分（レシピ分量表.md 2026-07-19本人サイン済み） ──
  {
    id: 'shakuyakukanzoto',
    name: '芍薬甘草湯',
    ruby: 'しゃくやくかんぞうとう',
    cost: { syakuyaku: 2, kanzou: 2 }, // 実比 芍薬6g:甘草6g（等量）の丸め
    icon: 'assets/items/kusuri/kusuri_shakuyakukanzoto.png',
    numberLabel: 'ツムラ 68番',
    desc: '芍薬と甘草を同じ量だけ合わせる、たった2つの生薬のお薬。急に足がつったときの、こわばった筋肉をゆるめるために古くから使われてきた。効き目の速さでも知られている。',
    settei: ['assets/items/kusuri/settei/shakuyakukanzoto_1.webp', 'assets/items/kusuri/settei/shakuyakukanzoto_2.webp'],
  },
  {
    id: 'keishito',
    name: '桂枝湯',
    ruby: 'けいしとう',
    cost: { keihi: 2, syakuyaku: 2, taisou: 2, syoukyou: 1, kanzou: 1 }, // 実比 桂皮4g:芍薬4g:大棗4g:生姜1.5g:甘草2g の丸め
    icon: 'assets/items/kusuri/kusuri_keishito.png',
    numberLabel: 'ツムラ 45番',
    desc: '桂皮・芍薬・大棗・生姜・甘草の5つの生薬でつくる、かぜのひき始めの基本処方。汗ばんでいるのに寒気がとれない、体力があまり強くない人の初期のかぜに向いている。',
    settei: ['assets/items/kusuri/settei/keishito_1.webp', 'assets/items/kusuri/settei/keishito_2.webp'],
  },
  {
    id: 'keishikashakuyakuto',
    name: '桂枝加芍薬湯',
    ruby: 'けいしかしゃくやくとう',
    cost: { keihi: 2, syakuyaku: 3, taisou: 2, syoukyou: 1, kanzou: 1 }, // 桂枝湯の芍薬量だけを+1した加減方
    icon: 'assets/items/kusuri/kusuri_keishikashakuyakuto.png',
    numberLabel: 'ツムラ 60番',
    desc: '桂枝湯に、芍薬をひとつだけ多く加えたお薬。おなかの張りや痛みをやわらげる働きがあり、桂枝湯との違いは芍薬の量だけ――分量ひとつで薬の役割が変わることを教えてくれる処方。',
    settei: ['assets/items/kusuri/settei/keishikashakuyakuto_1.webp', 'assets/items/kusuri/settei/keishikashakuyakuto_2.webp'],
  },
  // ── ステージ3（秋・雑賀）追加分（レシピ分量表.md 2026-07-19本人サイン済み） ──
  // numberLabel未検証（2026-07-23・本セッションでのfact-check未実施。実装前にレシピ分量表.mdと
  // 同様の検証パスを通すことを推奨）
  {
    id: 'maoto',
    name: '麻黄湯',
    ruby: 'まおうとう',
    cost: { mao: 2, kyounin: 2, keihi: 2, kanzou: 1 }, // 実比 麻黄5g:杏仁5g:桂皮4g:甘草1.5g の丸め
    icon: 'assets/items/kusuri/kusuri_maoto.png',
    numberLabel: 'ツムラ 27番',
    desc: '麻黄・杏仁・桂皮・甘草の4つの生薬でつくる、かぜのひき始めのお薬。汗がまったく出ないのに寒気や節々の痛みが強い、体力のある人向けの処方として使われてきた。主役は麻黄と杏仁。',
    settei: ['assets/items/kusuri/settei/maoto_1.webp', 'assets/items/kusuri/settei/maoto_2.webp'],
  },
  {
    id: 'keishikakakkonto',
    name: '桂枝加葛根湯',
    ruby: 'けいしかかっこんとう',
    cost: { kakkon: 2, keihi: 2, syakuyaku: 2, taisou: 2, syoukyou: 1, kanzou: 1 }, // 桂枝湯に葛根だけを加えた加減方
    icon: 'assets/items/kusuri/kusuri_keishikakakkonto.png',
    numberLabel: 'ツムラ 76番',
    desc: '桂枝湯に、葛根をひとつだけ加えたお薬。汗ばんでいるのに首や肩がこわばるときに使われてきた。桂枝加芍薬湯が芍薬を増やしたのに対して、こちらは葛根を足すだけ――麻黄は入らないのが桂枝湯系との共通点。',
    settei: ['assets/items/kusuri/settei/keishikakakkonto_1.webp', 'assets/items/kusuri/settei/keishikakakkonto_2.webp'],
  },
  {
    id: 'kakkonto',
    name: '葛根湯',
    ruby: 'かっこんとう',
    cost: { kakkon: 3, mao: 2, taisou: 2, keihi: 1, syakuyaku: 1, kanzou: 1, syoukyou: 1 }, // 実比 葛根4g:麻黄3g:大棗3g:桂皮2g:芍薬2g:甘草2g:生姜2g の丸め
    icon: 'assets/items/kusuri/kusuri_kakkonto.png',
    numberLabel: 'ツムラ 1番',
    desc: '葛根・麻黄・大棗・桂皮・芍薬・甘草・生姜の7つの生薬を使う、かぜのひき始めの代表的なお薬。汗をかいていないのに首から肩がこわばるときに使われてきた。ステージ3でいちばん生薬を集める処方。',
    settei: ['assets/items/kusuri/settei/kakkonto_1.webp', 'assets/items/kusuri/settei/kakkonto_2.webp'],
  },
  // ── ステージ4（冬・伊賀）追加分（レシピ分量表.md 2026-07-19本人サイン済み） ──
  {
    id: 'kanzokankyoto',
    name: '甘草乾姜湯',
    ruby: 'かんぞうかんきょうとう',
    cost: { kanzou: 2, kankyou: 1 }, // 実比 甘草4g:乾姜2g の丸め
    icon: 'assets/items/kusuri/kusuri_kanzokankyoto.png',
    numberLabel: '古典処方（一般用医薬品の承認基準にもとづく2生薬）',
    desc: '甘草と乾姜、たった2つの生薬でつくる、体の芯の冷えに向けたお薬。手足が冷えて口の中に唾がたまる、お手洗いが近い、といった症状に使われてきた。冬のステージらしいシンプルな処方。',
    settei: ['assets/items/kusuri/settei/kanzokankyoto_1.webp', 'assets/items/kusuri/settei/kanzokankyoto_2.webp'],
  },
  {
    id: 'ninjinto',
    name: '人参湯',
    ruby: 'にんじんとう',
    cost: { ninjin: 2, kanzou: 2, kankyou: 2, byakujutsu: 2 }, // 実比 人参3g:甘草3g:乾姜3g:白朮3g（等量）の丸め
    icon: 'assets/items/kusuri/kusuri_ninjinto.png',
    numberLabel: 'ツムラ 32番',
    desc: '人参・甘草・乾姜・白朮、同じ量ずつの4つの生薬でつくるお薬。胃腸が冷えて食欲がわかない、冷たいものですぐお腹をこわす、といった体質に使われてきた。ステージ4の締めくくりにふさわしい等量処方。',
    settei: ['assets/items/kusuri/settei/ninjinto_1.webp', 'assets/items/kusuri/settei/ninjinto_2.webp'],
  },
  {
    id: 'keishininjinto',
    name: '桂枝人参湯',
    ruby: 'けいしにんじんとう',
    cost: { keihi: 2, kanzou: 2, byakujutsu: 2, ninjin: 2, kankyou: 1 }, // 実比 桂皮4g:甘草3g:白朮3g:人参3g:乾姜2g の丸め
    icon: 'assets/items/kusuri/kusuri_keishininjinto.png',
    numberLabel: 'ツムラ 82番',
    desc: '人参湯に、桂皮をひとつ加えたお薬。冷えて頭痛がするうえ、おなかもゆるくなる、という2つの不調を同時にかかえているときに使われてきた。人参湯との違いは桂皮の有無だけ。',
    settei: ['assets/items/kusuri/settei/keishininjinto_1.webp', 'assets/items/kusuri/settei/keishininjinto_2.webp'],
  },
]

export function canCompound(recipe: Recipe): boolean {
  return (Object.entries(recipe.cost) as [SeedKind, number][]).every(
    ([kind, n]) => gameState.medals[kind] >= n,
  )
}

// ── 裏話（やりこみ報酬）の解放判定（2026-07-26新設・本人指示） ──────────────────
// 全11処方を一度でも調合したら、全キャラの「キャラ設定の裏話」が解放される。
// 冬の依頼で必ず作る処方（甘草乾姜湯・桂枝人参湯）だけでは埋まらず、依頼に出てこない
// 処方（人参湯・葛根湯など）も自分から作る必要があるため、やりこみのゲートとして機能する
export function allRecipesEverCrafted(): boolean {
  return RECIPES.every((r) => gameState.kusuriEverObtained[r.id])
}

// ── レシピの季節判定（2026-07-27・薬依頼の発動タイミング制御用） ──────────────────
// レシピがどのステージ相当かは、使う生薬のうち「最も遅い季節」で決まる
// （例: 桂枝湯は桂皮・芍薬・生姜が夏の生薬なので夏レシピ。甘草・大棗が混ざっていても夏）。
// 明示のstageフィールドを持たせず材料から導出するので、レシピ追加時のタグ付け漏れが起きない
const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter']

export function recipeSeasonOf(recipe: Recipe): Season {
  let idx = 0
  for (const kind of Object.keys(recipe.cost) as SeedKind[]) {
    idx = Math.max(idx, SEASON_ORDER.indexOf(KIND_STAGE[kind]))
  }
  return SEASON_ORDER[idx]
}

// その季節のレシピをどれか1種類でも調合したことがあるか。
// 薬依頼の発動ゲート（2026-07-27本人指示: 新ステージの依頼は、そのステージの薬を
// 1つ作ってから話し始める。ステージに入った瞬間に全員が症状を語り出す唐突さの解消）
export function anySeasonRecipeCrafted(season: Season): boolean {
  return RECIPES.some((r) => recipeSeasonOf(r) === season && gameState.kusuriEverObtained[r.id])
}

// この処方をUI（HUDの薬欄・工房のレシピ本・調合の選択肢）に出してよいか（2026-07-27本人指示）。
// 調合済みなら常に表示。未調合でも、材料の季節がすべて到達済みなら表示（未知の「?」枠として）。
// 未到達の季節の生薬を使う処方は、名前も材料もネタバレになるためUIごと隠す
export function recipeVisibleInUi(recipe: Recipe): boolean {
  if (gameState.kusuriEverObtained[recipe.id]) return true
  const season = recipeSeasonOf(recipe)
  return season === 'spring' || stageUnlocks[season]
}

// 「今の調合で全処方コンプに到達した」ことを一度だけHUDへ伝えるための受け渡し用フラグ。
// gameStateからhud.tsを直接呼ぶと循環参照になるため、hud側のupdateHud()（調合後に必ず呼ばれる）が
// takeUrabanashiUnlockNotice()で取りに来る方式にしている。4つの工房シーンを個別に触らずに済む
let urabanashiUnlockPending = false

export function takeUrabanashiUnlockNotice(): boolean {
  if (!urabanashiUnlockPending) return false
  urabanashiUnlockPending = false
  return true
}

// 裏話を読み終えたことを記録する（未読のうちは優先再生されるため、既読化して通常プールへ戻す）
export function markUrabanashiSeen(chara: string) {
  if (gameState.urabanashiSeen[chara]) return
  gameState.urabanashiSeen[chara] = true
  persist()
}

// 特殊会話を読み終えたことを記録する。裏話と同じ扱い（既読後は通常プールへ合流）
export function markSpecialSeen(chara: string) {
  if (gameState.specialSeen[chara]) return
  gameState.specialSeen[chara] = true
  persist()
}

// 変化（人間形態）の話を既読にする（柴・猫又。2026-07-27〜）
export function markHengeSeen(chara: string) {
  if (gameState.hengeSeen[chara]) return
  gameState.hengeSeen[chara] = true
  persist()
}

export function tryCompound(recipe: Recipe): boolean {
  if (!canCompound(recipe)) return false
  for (const [kind, n] of Object.entries(recipe.cost) as [SeedKind, number][]) {
    gameState.medals[kind] = TEST_UNLIMITED_KUSURI ? 99 : gameState.medals[kind] - n
  }
  gameState.kusuriCounts[recipe.id] = TEST_UNLIMITED_KUSURI
    ? 99
    : (gameState.kusuriCounts[recipe.id] ?? 0) + 1
  const wasComplete = allRecipesEverCrafted() // この調合の前にコンプしていたか
  gameState.kusuriEverObtained[recipe.id] = true
  gameState.totalKusuriCrafted++
  // 最後の1処方を埋めた瞬間だけ、裏話の解放をHUDへ通知する
  if (!wasComplete && allRecipesEverCrafted()) urabanashiUnlockPending = true
  persist()
  return true
}

// ── セーブ（LocalStorage・3スロット制） ──────────────
// 仕様書§7セーブ設計: スロット3個・イベント毎自動セーブ・旧形式からの移行。
// plantedAtMs（実時刻）を保存するだけで、閉じていた間の経過時間も
// growthStageOf() の計算にそのまま反映される。
// タイトル画面でスロットを選ぶまで activeSlot は null で、その間 persist() は何もしない。

const LEGACY_SAVE_KEY = 'torikka-flower-save-v1' // スロット制以前の単一セーブ（スロット1へ移行）
const slotKey = (slot: number) => `torikka-flower-save-slot${slot}`

let activeSlot: number | null = null

interface SaveData {
  seeds: Record<SeedKind, number>
  medals: Record<SeedKind, number>
  kusuriCounts?: Record<string, number> // 処方別所持数（2026-07-19〜）
  kusuriEverObtained?: Record<string, boolean> // 一度でも調合したか（2026-07-21〜。追加前のセーブには無い）
  totalKusuriCrafted?: number // 累計調合数（薬依頼の発動条件。追加前のセーブには無い）
  questDeliveredAt?: Record<string, number> // 薬依頼の達成時刻（追加前のセーブには無い）
  kusuri?: number // 旧形式（甘麦大棗湯のみの単一カウント）との互換用
  hasKanbakutaisouto?: boolean // 最旧形式（boolean）との互換用
  plots: Record<string, { crop: SeedKind; plantedAtMs: number | null }>
  npcStates?: Record<string, NpcState> // 会話システム追加前のセーブには無い
  npcCrossTalk?: Record<string, number> // クロストーク解放数（2026-07-24追加。追加前のセーブには無い）
  urabanashiSeen?: Record<string, boolean> // 裏話の既読（2026-07-26追加。追加前のセーブには無い＝全員未読扱い）
  specialSeen?: Record<string, boolean> // 特殊会話の既読（2026-07-26追加。追加前のセーブには無い＝全員未読扱い）
  hengeSeen?: Record<string, boolean> // 変化（人間形態）の話の既読（2026-07-27追加。追加前のセーブには無い＝全員未読扱い）
  seedSpotCollectedAt?: Record<SeedKind, number | null> // 採取クールダウン追加前のセーブには無い
  stageUnlocks?: { summer?: boolean; autumn?: boolean; winter?: boolean } // 季節の門の解放状態（2026-07-19追加。追加前のセーブには無い）
  lastPlayedMs?: number // スロット選択画面の要約表示用
}

function persist() {
  if (activeSlot === null) return
  try {
    const data: SaveData = {
      seeds: gameState.seeds,
      medals: gameState.medals,
      kusuriCounts: gameState.kusuriCounts,
      kusuriEverObtained: gameState.kusuriEverObtained,
      totalKusuriCrafted: gameState.totalKusuriCrafted,
      questDeliveredAt,
      plots,
      npcStates,
      npcCrossTalk,
      urabanashiSeen: gameState.urabanashiSeen,
      specialSeen: gameState.specialSeen,
      hengeSeen: gameState.hengeSeen,
      seedSpotCollectedAt,
      stageUnlocks,
      lastPlayedMs: Date.now(),
    }
    localStorage.setItem(slotKey(activeSlot), JSON.stringify(data))
  } catch {
    // プライベートブラウジング等、保存できない環境では黙って無視する
  }
}

// 全状態を初期値に戻す（「はじめから」用）
function resetState() {
  for (const k of Object.keys(gameState.seeds) as SeedKind[]) {
    gameState.seeds[k] = 0
    gameState.medals[k] = TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS ? 99 : 0
    seedSpotCollectedAt[k] = null
  }
  gameState.kusuriCounts = {}
  gameState.kusuriEverObtained = {}
  gameState.totalKusuriCrafted = 0
  gameState.urabanashiSeen = {}
  gameState.specialSeen = {}
  gameState.hengeSeen = {}
  for (const key of Object.keys(questDeliveredAt)) delete questDeliveredAt[key]
  for (const key of Object.keys(plots)) plots[key].plantedAtMs = null
  for (const key of Object.keys(npcStates)) {
    npcStates[key].trust = 0
    npcStates[key].talkCount = 0
    npcStates[key].trustGainedOn = null
  }
  for (const key of Object.keys(npcCrossTalk)) npcCrossTalk[key] = 0
  stageUnlocks.summer = false
  stageUnlocks.autumn = false
  stageUnlocks.winter = false
}

function applySaveData(data: SaveData) {
  resetState()
  Object.assign(gameState.seeds, data.seeds)
  Object.assign(gameState.medals, data.medals)
  // テスト中は旧セーブの少ない所持数を読み込んでも99へ揃える
  if (TEST_UNLIMITED_KUSURI || TEST_START_WITH_MEDALS) {
    for (const k of Object.keys(gameState.medals) as SeedKind[]) gameState.medals[k] = 99
  }
  // 旧セーブの移行: 単一カウント（kusuri）・最旧のboolean → 甘麦大棗湯の所持数として引き継ぐ
  gameState.kusuriCounts = data.kusuriCounts
    ? { ...data.kusuriCounts }
    : { kanbakutaisouto: data.kusuri ?? (data.hasKanbakutaisouto ? 1 : 0) }
  // ever obtained移行: 記録がない旧セーブは、渡して0になった処方までは復元できないため
  // 「今の所持数が1以上のもの」だけをtrueとして引き継ぐ（それ以外は次に調合した時点で改めてtrueになる）
  gameState.kusuriEverObtained = data.kusuriEverObtained
    ? { ...data.kusuriEverObtained }
    : Object.fromEntries(
        Object.entries(gameState.kusuriCounts).filter(([, v]) => (v ?? 0) > 0).map(([id]) => [id, true]),
      )
  // 累計調合数の移行: 記録がない旧セーブは「まだ誰にも渡していない」ので所持数の合計と一致する
  gameState.totalKusuriCrafted =
    data.totalKusuriCrafted ??
    Object.values(gameState.kusuriCounts).reduce((s, v) => s + (v || 0), 0)
  // 裏話・特殊会話の既読は記録がなければ空のまま（＝全員未読。解放済みなら優先再生される）
  if (data.urabanashiSeen) gameState.urabanashiSeen = { ...data.urabanashiSeen }
  if (data.specialSeen) gameState.specialSeen = { ...data.specialSeen }
  if (data.hengeSeen) gameState.hengeSeen = { ...data.hengeSeen }
  if (data.questDeliveredAt) Object.assign(questDeliveredAt, data.questDeliveredAt)
  for (const key of Object.keys(plots)) {
    if (data.plots?.[key]) plots[key].plantedAtMs = data.plots[key].plantedAtMs
  }
  for (const key of Object.keys(npcStates)) {
    if (data.npcStates?.[key]) Object.assign(npcStates[key], data.npcStates[key])
  }
  if (data.npcCrossTalk) Object.assign(npcCrossTalk, data.npcCrossTalk)
  if (data.seedSpotCollectedAt) Object.assign(seedSpotCollectedAt, data.seedSpotCollectedAt)
  stageUnlocks.summer = data.stageUnlocks?.summer ?? false
  stageUnlocks.autumn = data.stageUnlocks?.autumn ?? false
  stageUnlocks.winter = data.stageUnlocks?.winter ?? false
}

function readSlot(slot: number): SaveData | null {
  try {
    const raw = localStorage.getItem(slotKey(slot))
    if (!raw) return null
    return JSON.parse(raw) as SaveData
  } catch {
    return null // 壊れたセーブは空き扱い
  }
}

// スロット選択画面の要約。空きスロットならnull
export interface SlotSummary {
  kusuri: number
  medalTotal: number
  seedTotal: number
  lastPlayedMs: number | null
}

export function slotSummary(slot: number): SlotSummary | null {
  const data = readSlot(slot)
  if (!data) return null
  const sum = (rec?: Record<SeedKind, number>) =>
    rec ? Object.values(rec).reduce((s, v) => s + (v || 0), 0) : 0
  const kusuriTotal = data.kusuriCounts
    ? Object.values(data.kusuriCounts).reduce((s, v) => s + (v || 0), 0)
    : data.kusuri ?? (data.hasKanbakutaisouto ? 1 : 0)
  return {
    kusuri: kusuriTotal,
    medalTotal: sum(data.medals),
    seedTotal: sum(data.seeds),
    lastPlayedMs: data.lastPlayedMs ?? null,
  }
}

// つづきから: スロットのデータを読み込んでアクティブにする
export function loadSlot(slot: number): boolean {
  const data = readSlot(slot)
  if (!data) return false
  applySaveData(data)
  activeSlot = slot
  return true
}

// はじめから: スロットを初期化してアクティブにする（上書き確認はUI側の責務）
export function startNewGame(slot: number) {
  resetState()
  activeSlot = slot
  persist()
}

// オプション「セーブデータを消す」用。スロットのデータを完全に削除する（確認はUI側の責務）
export function deleteSlot(slot: number) {
  try {
    localStorage.removeItem(slotKey(slot))
  } catch {
    // 削除できない環境では黙って無視
  }
  if (activeSlot === slot) activeSlot = null
}

// 旧形式（単一セーブ）からの移行: スロット1が空いていればコピーして引き継ぐ
try {
  const legacy = localStorage.getItem(LEGACY_SAVE_KEY)
  if (legacy && !localStorage.getItem(slotKey(1))) {
    localStorage.setItem(slotKey(1), legacy)
  }
  if (legacy) localStorage.removeItem(LEGACY_SAVE_KEY)
} catch {
  // 移行できない環境ではそのまま
}
