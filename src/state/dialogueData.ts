// 会話データ（public/data/dialogues.json）の読み込み結果と会話選択ロジック。
// 仕様書§9-6「信頼度連動の会話プール」の土台。中身（会話本文）はJSON側だけで増やせる。

import type { DialogueLine } from '../ui/dialogue'
import {
  allRecipesEverCrafted,
  gameState,
  markSpecialSeen,
  markUrabanashiSeen,
  npcCrossTalk,
  npcStates,
  type Season,
} from './gameState'

interface TalkLine {
  face: number
  text: string
  // 掛け合い対応（2026-07-25本人指示）。'torika'を指定するとその行は酉花（トリカ）のセリフ・顔グラで出る。
  // 省略時は従来どおり話しかけた相手（chara）の行。これでNPCの独白ではなく会話として書ける
  speaker?: 'torika'
}

// 掛け合いの行をDialogueLineへ変換する共通処理。speaker:'torika'の行はトリカ側の顔グラ・名前で出す
const TORIKA_NAME = '酉花（トリカ）'
function toDialogueLine(line: TalkLine, chara: string, charaName: string): DialogueLine {
  const isTorika = line.speaker === 'torika'
  return {
    speaker: isTorika ? 'torika' : chara,
    name: isTorika ? TORIKA_NAME : charaName,
    face: line.face,
    text: line.text,
  }
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
  // 返したtierをそのままキーに使う。依頼完遂の瞬間に1回だけ流すほか、
  // 解放後は世間話と同じローテーションに常設される（2026-07-25本人の設計意図どおりに変更）
  crossTalk?: Record<number, TalkLine[]>
  // 裏話（2026-07-26〜・やりこみ報酬）。全11処方を一度でも調合すると解放される、
  // CryptoNinjaのキャラ設定（クラン・忍術・武器・相棒・名前の由来）を掘る特別会話。
  // 未読のうちは世間話より優先して再生し、読み終えたら通常プールへ合流する
  urabanashi?: TalkLine[]
  // 特殊会話（2026-07-26〜）。裏話が「里の中の設定」を掘る枠なのに対し、こちらは
  // **里の外＝現実側の話をするメタ枠**（アニメ・作品・コミュニティでの立ち位置など）。
  // キャラが第四の壁の外を知っている前提で書く。裏話と同じ全処方コンプで解放され、
  // 「裏話を読み終えたキャラ」から順に優先再生される（裏話→特殊会話→通常プールの順）
  special?: TalkLine[]
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

  // 裏話（やりこみ報酬）の優先再生（2026-07-26本人指示）。全11処方コンプで解放され、
  // 未読なら世間話より先に必ず1回流す。ランダムなプールに混ぜるだけだと、
  // せっかくの特別会話が他の世間話に埋もれて気づかれないため、初回だけ優先枠にしている
  const urabanashi = charaData.urabanashi
  const special = charaData.special
  const rewardUnlocked = allRecipesEverCrafted()
  if (urabanashi && !gameState.urabanashiSeen[chara] && rewardUnlocked) {
    markUrabanashiSeen(chara)
    return urabanashi.map((line) => toDialogueLine(line, chara, charaData.name))
  }
  // 特殊会話（里の外の話）は裏話の次に流す。裏話を持たないキャラは解放と同時にこちらが優先枠になる
  if (special && !gameState.specialSeen[chara] && rewardUnlocked) {
    markSpecialSeen(chara)
    return special.map((line) => toDialogueLine(line, chara, charaData.name))
  }

  const unlocked = charaData.pools
    .filter((pool) => state.trust >= pool.minTrust && (!pool.season || pool.season === season))
    .flatMap((pool) => pool.talks)

  // 既読の裏話・特殊会話は通常プールへ合流させ、いつでも読み返せるようにする
  if (urabanashi && gameState.urabanashiSeen[chara]) unlocked.push(urabanashi)
  if (special && gameState.specialSeen[chara]) unlocked.push(special)

  // 解放済みクロストークを常設の会話として同じローテーションに混ぜる（2026-07-25本人指示）。
  // 従来は「解放された瞬間に1回だけ」しか再生されず、解放フラグだけ先に立ったセーブでは
  // 二度と見られなかった（本文は全12キャラ揃っているのに一本も出ない状態になっていた）。
  // クロストークは信頼度ではなく依頼の完遂数で解放される枠なので、minTrustの判定は通さない
  const tier = npcCrossTalk[chara] ?? 0
  for (let t = 1; t <= tier; t++) {
    const talk = charaData.crossTalk?.[t]
    if (talk) unlocked.push(talk)
  }

  if (unlocked.length === 0) return null

  // ランダム選択（2026-07-25本人指示: ローテーションだと会話の流れが単調）。
  // 直前と同じ会話の連続だけは避ける（2本以上あるとき）。lastTalkIndexはセーブ対象外の演出用状態
  let idx = Math.floor(Math.random() * unlocked.length)
  if (unlocked.length > 1 && idx === lastTalkIndex[chara]) {
    idx = (idx + 1 + Math.floor(Math.random() * (unlocked.length - 1))) % unlocked.length
  }
  lastTalkIndex[chara] = idx
  return unlocked[idx].map((line) => toDialogueLine(line, chara, charaData.name))
}

// キャラごとの「直前に選んだ会話」。同じ会話が2連続で出るのを避けるためだけの揮発状態
const lastTalkIndex: Record<string, number> = {}

// クロストーク本文を取得する（questData.checkCrossTalkUnlockが新規解放tierを返したときだけ呼ぶ）。
// 該当tierの本文が未執筆ならnull（executed=trueなのに本文が無い場合の保険。次工程で埋める）
export function crossTalkLinesFor(chara: string, tier: number): DialogueLine[] | null {
  const charaData = data[chara]
  const talk = charaData?.crossTalk?.[tier]
  if (!talk) return null
  return talk.map((line) => toDialogueLine(line, chara, charaData.name))
}
