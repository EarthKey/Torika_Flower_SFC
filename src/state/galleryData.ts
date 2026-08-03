// ギャラリーモード（タイトル「？？？」枠）の収録定義と解放判定（2026-08-03設計書どおり）。
// 解放判定は「ギャラリーを開いた瞬間に3セーブスロットを走査して逆算」する方式。
// ゲーム本編に新しい記録フックを足さず、既存のクリア済みセーブにも遡って効く。
// どれか1スロットで条件を満たせば解放（スロット横断のOR判定）。
// 未解放の枠は「？？？」表示で、タップすると解放条件（condition）が見られる。

import { readSlot } from './gameState'
import { ALL_QUESTS, QUESTS, QUESTS_STAGE2, QUESTS_STAGE3, type Quest } from './questData'

// 3スロットのセーブ生データから、ギャラリー判定に必要な進捗だけを合算した集計値
export interface GalleryProgress {
  delivered: Set<string> // 渡し終えた依頼id（全スロット合算）
  anyCrafted: boolean // 一度でも調合したか
  finaleCutinSeen: boolean
  finaleSeen: boolean
  talked: Set<string> // 一度でも話しかけたキャラ（npcStates.talkCount > 0）
  hasSave: boolean // 1つでもセーブがあるか（＝一度でも遊んだ）
  collectedSeed: boolean // 種の聖域で1度でも採取したか（サウンドの解放判定用）
  seasons: { summer: boolean; autumn: boolean; winter: boolean } // 季節の門の解放状態
}

export function scanGalleryProgress(): GalleryProgress {
  const delivered = new Set<string>()
  const talked = new Set<string>()
  let anyCrafted = false
  let finaleCutinSeen = false
  let finaleSeen = false
  let hasSave = false
  let collectedSeed = false
  const seasons = { summer: false, autumn: false, winter: false }
  for (const slot of [1, 2, 3]) {
    const d = readSlot(slot)
    if (!d) continue
    hasSave = true
    for (const id of Object.keys(d.questDeliveredAt ?? {})) delivered.add(id)
    for (const [chara, st] of Object.entries(d.npcStates ?? {})) {
      if ((st?.talkCount ?? 0) > 0) talked.add(chara)
    }
    const craftedTotal =
      d.totalKusuriCrafted ??
      Object.values(d.kusuriCounts ?? {}).reduce((s, v) => s + (v || 0), 0)
    if (craftedTotal > 0) anyCrafted = true
    if (d.finaleCutinSeen) finaleCutinSeen = true
    if (d.finaleSeen) finaleSeen = true
    // 採取の記録（クールダウン用のタイムスタンプ）が1つでも残っていれば種の聖域へ行った証拠。
    // 調合済みなら種を採らずには成立しないので、そちらも採取済みとみなす（旧セーブの救済）
    if (Object.values(d.seedSpotCollectedAt ?? {}).some((v) => v !== null && v !== undefined)) collectedSeed = true
    if (craftedTotal > 0) collectedSeed = true
    if (d.stageUnlocks?.summer) seasons.summer = true
    if (d.stageUnlocks?.autumn) seasons.autumn = true
    if (d.stageUnlocks?.winter) seasons.winter = true
  }
  return { delivered, anyCrafted, finaleCutinSeen, finaleSeen, talked, hasSave, collectedSeed, seasons }
}

export interface GalleryItem {
  id: string
  title: string
  kind: 'image' | 'video'
  asset: string // 本体（画像 or 動画）。未生成の間は読み込み失敗→「準備中」表示になる
  thumb: string // サムネイル
  condition: string // 未解放時にタップで見せる解放条件の文言
  unlocked: (p: GalleryProgress) => boolean
}

// キャラムービー12体の並び順（春組→夏組→秋組→冬組）。名前は「漢字（読み）」ルールどおり
const MOVIE_CHARS: { chara: string; name: string }[] = [
  { chara: 'sakuya', name: '咲耶（サクヤ）' },
  { chara: 'xiaolan', name: 'シャオラン' },
  { chara: 'nemu', name: 'ネム' },
  { chara: 'janome', name: '蛇ノ目（ジャノメ）' },
  { chara: 'aum', name: 'アウン' },
  { chara: 'ibuki', name: 'イブキ' },
  { chara: 'shiba', name: '柴（シバ）' },
  { chara: 'nekomata', name: '猫又（ねこまた）' },
  { chara: 'benten', name: '弁天（べんてん）' },
  { chara: 'anne', name: '餡音（あんね）' },
  { chara: 'yui', name: '結（ゆい）' },
  { chara: 'hayate', name: 'ハヤテ' },
]

const questIdsOf = (chara: string) => ALL_QUESTS.filter((q) => q.chara === chara).map((q) => q.id)

// 季節の門と同じ規則（そのステージの担当3キャラに各1件）をスロット合算の集計値で再現する
const eachCharaOnce = (p: GalleryProgress, quests: Quest[]) => {
  const charas = [...new Set(quests.map((q) => q.chara))]
  return charas.length > 0 && charas.every((c) => quests.some((q) => q.chara === c && p.delivered.has(q.id)))
}

const allQuestsDone = (p: GalleryProgress) => ALL_QUESTS.every((q) => p.delivered.has(q.id))

// ── タブ①: イラスト ──────────────────────────────
// 2026-08-03、動画13本の構想からイラスト14枚へ方針転換（本人指示）。動画は後日、同じ枠へ
// mp4を置いて差し替え可能な構造のまま残す（kindを'video'に戻すだけで動く）

// 12キャラぶんのイラスト。各キャラの全依頼を渡し終えると開く
const CHARA_ILLUSTS: GalleryItem[] = MOVIE_CHARS.map(({ chara, name }) => {
  const ids = questIdsOf(chara)
  return {
    id: `illust_${chara}`,
    title: `${name}のイラスト`,
    kind: 'image' as const,
    asset: `assets/gallery/illust_${chara}.webp`,
    thumb: `assets/gallery/illust_${chara}.webp`,
    condition: `${name}のお薬の依頼を すべて叶える（全${ids.length}件）`,
    unlocked: (p: GalleryProgress) => ids.every((id) => p.delivered.has(id)),
  }
})

// 13・14の特別枠（2026-08-03本人指示）: 条件は「1〜12のイラストが全部開いていること」。
// 依頼件数を数え直さず解放状態そのものを見るので、キャラ枠が増減しても条件が自動で追従する。
// この2枚は同時に開く
const allCharaIllustsUnlocked = (p: GalleryProgress) => CHARA_ILLUSTS.every((i) => i.unlocked(p))
const SPECIAL_CONDITION = 'ほかの12人のイラストを すべてひらく'

export const GALLERY_ILLUSTS: GalleryItem[] = [
  ...CHARA_ILLUSTS,
  {
    id: 'illust_izuna',
    title: 'イズナのイラスト',
    kind: 'image',
    asset: 'assets/gallery/illust_izuna.webp',
    thumb: 'assets/gallery/illust_izuna.webp',
    condition: SPECIAL_CONDITION,
    unlocked: allCharaIllustsUnlocked,
  },
  {
    id: 'illust_torika',
    title: '酉花（トリカ）のイラスト',
    kind: 'image',
    asset: 'assets/gallery/illust_torika.webp',
    thumb: 'assets/gallery/illust_torika.webp',
    condition: SPECIAL_CONDITION,
    unlocked: allCharaIllustsUnlocked,
  },
  {
    id: 'movie_compound',
    title: '調合ムービー',
    kind: 'video',
    asset: 'assets/effects/compound_movie.mp4',
    thumb: 'assets/effects/mark_compound_1.png',
    condition: 'はじめてお薬を調合する',
    unlocked: (p) => p.anyCrafted,
  },
]

// ── タブ②: おもいで（イラスト） ──────────────────────
export const GALLERY_MEMORIES: GalleryItem[] = [
  {
    id: 'memory_spring',
    title: '春のおもいで',
    kind: 'image',
    asset: 'assets/gallery/memory_spring.webp',
    thumb: 'assets/gallery/memory_spring.webp',
    condition: 'はじめてお薬をとどける',
    unlocked: (p) => p.delivered.size > 0,
  },
  {
    id: 'memory_summer',
    title: '夏のおもいで',
    kind: 'image',
    asset: 'assets/gallery/memory_summer.webp',
    thumb: 'assets/gallery/memory_summer.webp',
    condition: '夏の里への道をひらく',
    unlocked: (p) => eachCharaOnce(p, QUESTS),
  },
  {
    id: 'memory_autumn',
    title: '秋のおもいで',
    kind: 'image',
    asset: 'assets/gallery/memory_autumn.webp',
    thumb: 'assets/gallery/memory_autumn.webp',
    condition: '秋の里への道をひらく',
    unlocked: (p) => eachCharaOnce(p, QUESTS_STAGE2),
  },
  {
    id: 'memory_winter',
    title: '冬のおもいで',
    kind: 'image',
    asset: 'assets/gallery/memory_winter.webp',
    thumb: 'assets/gallery/memory_winter.webp',
    condition: '冬の里への道をひらく',
    unlocked: (p) => eachCharaOnce(p, QUESTS_STAGE3),
  },
  {
    id: 'gate_summer',
    title: '夏の門',
    kind: 'image',
    asset: 'assets/effects/gate_summer.webp',
    thumb: 'assets/effects/gate_summer.webp',
    condition: '夏の里への道をひらく',
    unlocked: (p) => eachCharaOnce(p, QUESTS),
  },
  {
    id: 'gate_autumn',
    title: '秋の門',
    kind: 'image',
    asset: 'assets/effects/gate_autumn.webp',
    thumb: 'assets/effects/gate_autumn.webp',
    condition: '秋の里への道をひらく',
    unlocked: (p) => eachCharaOnce(p, QUESTS_STAGE2),
  },
  {
    id: 'gate_winter',
    title: '冬の門',
    kind: 'image',
    asset: 'assets/effects/gate_winter.webp',
    thumb: 'assets/effects/gate_winter.webp',
    condition: '冬の里への道をひらく',
    unlocked: (p) => eachCharaOnce(p, QUESTS_STAGE3),
  },
  {
    id: 'finale_torika',
    title: 'すべての依頼を達成！',
    kind: 'image',
    asset: 'assets/effects/finale_torika.webp',
    thumb: 'assets/effects/finale_torika.webp',
    condition: 'すべての依頼（全42件）を達成する',
    unlocked: (p) => p.finaleCutinSeen || allQuestsDone(p),
  },
  {
    id: 'finale_last',
    title: '感謝をこめて',
    kind: 'image',
    asset: 'assets/effects/finale_last.webp',
    thumb: 'assets/effects/finale_last.webp',
    condition: 'すべての依頼を達成して、イズナに報告する',
    unlocked: (p) => p.finaleSeen,
  },
]

// ── タブ③: サウンド（BGM試聴・2026-08-03本人指示「聴く要素」） ──────────────
// SUNO制作のBGM7曲を、そのステージへ到達したプレイヤーだけが聴き返せる音楽室。
// 実ファイルは public/assets/bgm/<key>.ogg（フォールバックに .m4a）
export interface SoundEntry {
  key: string
  title: string
  note: string // 曲の場所・場面の説明
  condition: string
  unlocked: (p: GalleryProgress) => boolean
}

// 並び順は本人指示（2026-08-04）: タイトル → 春・夏・秋・冬 → 工房 → 採取。
// 解放はいずれも「そこへ実際に到達したか」で判定する（セーブの有無では開かない）
export const GALLERY_SOUNDS: SoundEntry[] = [
  { key: 'title', title: 'はじまりの唄', note: 'タイトル画面', condition: '', unlocked: () => true },
  { key: 'stage1', title: '春の里', note: '甲賀の里', condition: 'ゲームをはじめる', unlocked: (p) => p.hasSave },
  { key: 'stage2', title: '夏の里', note: '風魔の里', condition: '夏の里への道をひらく', unlocked: (p) => p.seasons.summer },
  { key: 'stage3', title: '秋の里', note: '雑賀の里', condition: '秋の里への道をひらく', unlocked: (p) => p.seasons.autumn },
  { key: 'stage4', title: '冬の里', note: '伊賀の里', condition: '冬の里への道をひらく', unlocked: (p) => p.seasons.winter },
  { key: 'koubou', title: '工房', note: 'お薬を調合する場所', condition: 'はじめてお薬を調合する', unlocked: (p) => p.anyCrafted },
  { key: 'seed', title: '種の聖域', note: '種を採りにいく場所', condition: '種の聖域で 種をあつめる', unlocked: (p) => p.collectedSeed },
]

// ── タブ④: にんじゃ図鑑（顔グラ） ──────────────────────
export interface ZukanEntry {
  chara: string
  name: string
  unlocked: (p: GalleryProgress) => boolean
}

export const ZUKAN_LIST: ZukanEntry[] = [
  { chara: 'torika', name: '酉花（トリカ）', unlocked: () => true }, // 主人公は最初から
  { chara: 'izuna', name: 'イズナ', unlocked: (p) => p.talked.has('izuna') },
  ...MOVIE_CHARS.map(({ chara, name }) => ({
    chara,
    name,
    unlocked: (p: GalleryProgress) => p.talked.has(chara),
  })),
]

// タイトルメニューの表記切り替え用: 1点でも解放済みなら「？？？」→「ギャラリー」になる
export function anyGalleryUnlocked(p: GalleryProgress): boolean {
  return [...GALLERY_ILLUSTS, ...GALLERY_MEMORIES].some((i) => i.unlocked(p))
}
