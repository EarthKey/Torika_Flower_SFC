// 会話データ（public/data/dialogues.json）の読み込み結果と会話選択ロジック。
// 仕様書§9-6「信頼度連動の会話プール」の土台。中身（会話本文）はJSON側だけで増やせる。

import type { DialogueLine } from '../ui/dialogue'
import { npcStates } from './gameState'

interface TalkLine {
  face: number
  text: string
}

interface DialoguePool {
  minTrust: number
  talks: TalkLine[][]
}

interface CharaDialogues {
  name: string
  pools: DialoguePool[]
}

let data: Record<string, CharaDialogues> = {}

export function setDialogueData(json: Record<string, CharaDialogues | string>) {
  data = {}
  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== 'string') data[key] = value // "_comment"などの説明キーは除外
  }
}

// 信頼度で解放済みのプール全体から、話しかけた回数でローテーション選択する
export function pickTalk(chara: string): DialogueLine[] | null {
  const charaData = data[chara]
  const state = npcStates[chara]
  if (!charaData || !state) return null

  const unlocked = charaData.pools
    .filter((pool) => state.trust >= pool.minTrust)
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
