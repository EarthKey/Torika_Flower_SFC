// 会話データ（public/data/dialogues.json）の読み込み結果と会話選択ロジック。
// 仕様書§9-6「信頼度連動の会話プール」の土台。中身（会話本文）はJSON側だけで増やせる。

import type { DialogueLine } from '../ui/dialogue'
import { npcStates, type Season } from './gameState'

interface TalkLine {
  face: number
  text: string
}

interface DialoguePool {
  minTrust: number
  // 季節タグ（本人指定・2026-07-20）。省略時は季節を問わず常時対象（イズナの深い会話など、
  // ステージ進行で積み上がっていく特別枠はここを付けない）。付けたプールは、その季節が
  // 「今の季節」でなくなった瞬間に選択対象から外れる＝季節が進むたびに世間話がリニューアルされる
  season?: Season
  talks: TalkLine[][]
}

interface CharaDialogues {
  name: string
  pools: DialoguePool[]
  // クロストーク本文（2026-07-24〜）。tier番号→会話1本。questData.checkCrossTalkUnlockが
  // 返したtierをそのままキーに使う。世間話プール(pools)とは別枠で、依頼完遂の直後に1回だけ再生する
  crossTalk?: Record<number, TalkLine[]>
}

let data: Record<string, CharaDialogues> = {}

export function setDialogueData(json: Record<string, CharaDialogues | string>) {
  data = {}
  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== 'string') data[key] = value // "_comment"などの説明キーは除外
  }
}

// 信頼度で解放済み、かつ季節が合っているプール全体から、話しかけた回数でローテーション選択する。
// seasonは「今どのステージの進行状況か」ではなく「話しかけた相手が今いるマップの季節」（2026-07-21〜）。
// イズナは春マップにも夏マップにも同時に配置されているため、季節の門の解放状況（グローバル）ではなく
// 呼び出し元シーン（GridScene.sceneSeason）が渡す値で判定する。これにより夏解放後に春の里へ戻っても
// 春のイズナは春のセリフのままになる（NPCの立ち位置＝話す内容、という前提に合わせた）
export function pickTalk(chara: string, season: Season): DialogueLine[] | null {
  const charaData = data[chara]
  const state = npcStates[chara]
  if (!charaData || !state) return null

  const unlocked = charaData.pools
    .filter((pool) => state.trust >= pool.minTrust && (!pool.season || pool.season === season))
    .flatMap((pool) => pool.talks)
  if (unlocked.length === 0) return null

  const talk = unlocked[state.talkCount % unlocked.length]
  return talk.map((line) => ({
    speaker: chara,
    name: charaData.name,
    face: line.face,
    text: line.text,
  }))
}

// クロストーク本文を取得する（questData.checkCrossTalkUnlockが新規解放tierを返したときだけ呼ぶ）。
// 該当tierの本文が未執筆ならnull（executed=trueなのに本文が無い場合の保険。次工程で埋める）
export function crossTalkLinesFor(chara: string, tier: number): DialogueLine[] | null {
  const charaData = data[chara]
  const talk = charaData?.crossTalk?.[tier]
  if (!talk) return null
  return talk.map((line) => ({
    speaker: chara,
    name: charaData.name,
    face: line.face,
    text: line.text,
  }))
}
