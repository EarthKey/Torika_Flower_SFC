// プレイヤーの所持品・進行状態。まだ絵がない段階なので純粋なロジックだけを持つ。

export type SeedKind = 'kanzou' | 'syoubaku' | 'taisou'

// 画面表示用の生薬名（メッセージ・トーストで使う。内部キーのローマ字を露出させない）
export const KIND_LABELS: Record<SeedKind, string> = {
  kanzou: '甘草',
  syoubaku: '小麦',
  taisou: '大棗',
}

// ふりがな付きの生薬名（2026-07-18）。漢方の読みは初見で読めないため、
// メッセージ・トーストでは原則こちらを使う（同一文中の2回目以降はKIND_LABELSで簡潔に）
export const KIND_LABELS_RUBY: Record<SeedKind, string> = {
  kanzou: '甘草（かんぞう）',
  syoubaku: '小麦（しょうばく）',
  taisou: '大棗（たいそう）',
}

export const gameState = {
  seeds: {
    kanzou: 0,
    syoubaku: 0,
    taisou: 0,
  } as Record<SeedKind, number>,
  medals: {
    kanzou: 0,
    syoubaku: 0,
    taisou: 0,
  } as Record<SeedKind, number>,
  // 完成薬の所持数（処方IDごと・2026-07-19処方別化）。キーはRECIPESのid
  kusuriCounts: {} as Record<string, number>,
  // 累計調合数（薬依頼システム§9-8の発動条件用。薬を渡して手持ちが0になっても発動は維持される）
  totalKusuriCrafted: 0,
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
}

export const npcStates: Record<string, NpcState> = {
  izuna: { trust: 0, talkCount: 0 },
  sakuya: { trust: 0, talkCount: 0 },
  xiaolan: { trust: 0, talkCount: 0 },
  nemu: { trust: 0, talkCount: 0 },
}

export function recordTalk(chara: string) {
  const s = npcStates[chara]
  if (!s) return
  s.trust++
  s.talkCount++
  persist()
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
  persist()
  return true
}

// ── 畑の成長管理 ──────────────────────────────
// 「植えた時刻」をゲーム全体の状態として持ち、経過実時間から成長段階を算出する。
// これにより、別のマップ（種の聖域・工房）にいる間も畑は育ち続ける。
// 将来LocalStorageセーブに移行するときも plantedAtMs を保存するだけで済む。

export const GROWTH_MS_PER_STAGE = 3000 // プロトタイプ用に短縮（本番は仕様書のタイマー値へ）

export interface PlotState {
  crop: SeedKind
  plantedAtMs: number | null // nullなら未植え
}

// 畑3区画（自宅）。マスの担当作物は固定
export const plots: Record<string, PlotState> = {
  plot_kanzou: { crop: 'kanzou', plantedAtMs: null },
  plot_syoubaku: { crop: 'syoubaku', plantedAtMs: null },
  plot_taisou: { crop: 'taisou', plantedAtMs: null },
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
  persist()
  return true
}

// ── 収穫カーブ（仕様書§9-10・2026-07-19本人サイン済み） ──────────
// 「1日」= 植えてから収穫可能（段階4）になるまでの時間。設計原則は「待っても損しない」:
// 収穫量の期待値を経過日数にほぼ線形（1日=1個 / 2日=1〜3個 / 3日以上=2〜4個で打ち止め）に
// することで、毎日収穫しても数日おきでも1日あたりの効率が変わらない。上限3日で数の爆発を防ぐ

export const DAY_MS = GROWTH_MS_PER_STAGE * 3 // 段階1→4に要する時間を「1日」とみなす

export function harvestYieldOf(plot: PlotState, nowMs = Date.now()): number {
  if (plot.plantedAtMs === null) return 0
  const days = Math.floor((nowMs - plot.plantedAtMs) / DAY_MS)
  if (days >= 3) return 2 + Math.floor(Math.random() * 3) // 2〜4個
  if (days >= 2) return 1 + Math.floor(Math.random() * 3) // 1〜3個
  return 1
}

// 収穫。育ちきっていなければ0、収穫できたら獲得したメダル数を返す
export function harvestFrom(plot: PlotState): number {
  if (growthStageOf(plot) !== 4) return 0
  const gained = harvestYieldOf(plot)
  plot.plantedAtMs = null
  gameState.medals[plot.crop] += gained
  persist()
  return gained
}

export function addSeed(kind: SeedKind) {
  gameState.seeds[kind]++
  persist()
}

// ── 種の採取クールダウン ──────────────────────
// 採取スポットは1回採ると60分後に次の種が出る（2026-07-17確定・放置ゲー日課設計）。
// 採取時刻を保存し、経過実時間で判定するので、ブラウザを閉じていても回復が進む。

export const SEED_COOLDOWN_MS = 60 * 60 * 1000

export const seedSpotCollectedAt: Record<SeedKind, number | null> = {
  kanzou: null,
  syoubaku: null,
  taisou: null,
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
  numberLabel: string // 解説カードの番号表示（例: ツムラ 72番）。番号なし処方は「古典処方」等
  desc: string // 解説カードの短い解説文（医学的表現はfact-check→本人確認の対象）
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
  },
  {
    id: 'kanbakutaisouto',
    name: '甘麦大棗湯',
    ruby: 'かんばくたいそうとう',
    cost: { kanzou: 1, syoubaku: 3, taisou: 1 }, // 実比 甘草5g:小麦20g:大棗6g の丸め
    icon: 'assets/items/kusuri/kusuri_kanbakutaisouto.png',
    numberLabel: 'ツムラ 72番',
    desc: '甘草・小麦・大棗、3つの生薬でつくる、心をやわらげるお薬。気持ちの昂ぶりや不安、子どもの夜泣きに古くから使われてきた。いちばん多く入っているのは小麦。',
  },
]

export function canCompound(recipe: Recipe): boolean {
  return (Object.entries(recipe.cost) as [SeedKind, number][]).every(
    ([kind, n]) => gameState.medals[kind] >= n,
  )
}

export function tryCompound(recipe: Recipe): boolean {
  if (!canCompound(recipe)) return false
  for (const [kind, n] of Object.entries(recipe.cost) as [SeedKind, number][]) {
    gameState.medals[kind] -= n
  }
  gameState.kusuriCounts[recipe.id] = (gameState.kusuriCounts[recipe.id] ?? 0) + 1
  gameState.totalKusuriCrafted++
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
  totalKusuriCrafted?: number // 累計調合数（薬依頼の発動条件。追加前のセーブには無い）
  questDeliveredAt?: Record<string, number> // 薬依頼の達成時刻（追加前のセーブには無い）
  kusuri?: number // 旧形式（甘麦大棗湯のみの単一カウント）との互換用
  hasKanbakutaisouto?: boolean // 最旧形式（boolean）との互換用
  plots: Record<string, { crop: SeedKind; plantedAtMs: number | null }>
  npcStates?: Record<string, NpcState> // 会話システム追加前のセーブには無い
  seedSpotCollectedAt?: Record<SeedKind, number | null> // 採取クールダウン追加前のセーブには無い
  lastPlayedMs?: number // スロット選択画面の要約表示用
}

function persist() {
  if (activeSlot === null) return
  try {
    const data: SaveData = {
      seeds: gameState.seeds,
      medals: gameState.medals,
      kusuriCounts: gameState.kusuriCounts,
      totalKusuriCrafted: gameState.totalKusuriCrafted,
      questDeliveredAt,
      plots,
      npcStates,
      seedSpotCollectedAt,
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
    gameState.medals[k] = 0
    seedSpotCollectedAt[k] = null
  }
  gameState.kusuriCounts = {}
  gameState.totalKusuriCrafted = 0
  for (const key of Object.keys(questDeliveredAt)) delete questDeliveredAt[key]
  for (const key of Object.keys(plots)) plots[key].plantedAtMs = null
  for (const key of Object.keys(npcStates)) {
    npcStates[key].trust = 0
    npcStates[key].talkCount = 0
  }
}

function applySaveData(data: SaveData) {
  resetState()
  Object.assign(gameState.seeds, data.seeds)
  Object.assign(gameState.medals, data.medals)
  // 旧セーブの移行: 単一カウント（kusuri）・最旧のboolean → 甘麦大棗湯の所持数として引き継ぐ
  gameState.kusuriCounts = data.kusuriCounts
    ? { ...data.kusuriCounts }
    : { kanbakutaisouto: data.kusuri ?? (data.hasKanbakutaisouto ? 1 : 0) }
  // 累計調合数の移行: 記録がない旧セーブは「まだ誰にも渡していない」ので所持数の合計と一致する
  gameState.totalKusuriCrafted =
    data.totalKusuriCrafted ??
    Object.values(gameState.kusuriCounts).reduce((s, v) => s + (v || 0), 0)
  if (data.questDeliveredAt) Object.assign(questDeliveredAt, data.questDeliveredAt)
  for (const key of Object.keys(plots)) {
    if (data.plots?.[key]) plots[key].plantedAtMs = data.plots[key].plantedAtMs
  }
  for (const key of Object.keys(npcStates)) {
    if (data.npcStates?.[key]) Object.assign(npcStates[key], data.npcStates[key])
  }
  if (data.seedSpotCollectedAt) Object.assign(seedSpotCollectedAt, data.seedSpotCollectedAt)
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
