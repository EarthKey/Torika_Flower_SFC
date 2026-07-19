// 薬依頼システム（仕様書§9-8・薬依頼割当表.md 2026-07-19本人サイン済み）。
// 発動条件: 薬を累計1個でも調合すると、各キャラが「欲しい薬の症状」を語り始める。
// キャラは薬名を言わず、症状ヒント2つ（割当表の検証済み文言をそのまま織り込む）から
// プレイヤーが処方を推理して渡す。正解で好感度ボーナス、不正解は薬を消費しない（再挑戦自由）。
// 24時間ループ（渡してから24時間で再依頼）は questDeliveredAt の時刻を使って後日実装する。

import { gameState, questDeliveredAt } from './gameState'

// 薬プレゼントの好感度ボーナス（話しかけ+1に対する二段構え。§9-8）
export const GIFT_TRUST_BONUS = 2

interface QuestLine {
  face: number
  text: string
}

export interface Quest {
  id: string
  chara: string
  name: string // 会話ウインドウの表示名（dialogues.jsonと同じ表記）
  recipeId: string // 正解の処方（RECIPESのid）
  requestLines: QuestLine[] // 症状ヒント2つを織り込んだ依頼会話（薬名は言わない）
  thanksLines: QuestLine[] // 正解を渡したときのお礼
  wrongLines: QuestLine[] // 違う薬を渡したとき（薬は消費しない）
}

// ステージ1（春・甲賀）の3依頼。症状ヒント①②は割当表の文言そのまま
export const QUESTS: Quest[] = [
  {
    id: 'sakuya_kanzoto',
    chara: 'sakuya',
    name: '咲耶（サクヤ）',
    recipeId: 'kanzoto',
    requestLines: [
      { face: 4, text: 'あ……トリカ、ちょうどよかった。実はさ、修行で号令をかけすぎちゃって……喉がイガイガして声が出しにくいんだ。' },
      { face: 5, text: 'しかも咳き込むと喉にひびいて痛くて……。このままじゃ、明日の修行に差しつかえるよ〜。' },
      { face: 1, text: 'ねえトリカ、こういうときに合うお薬って、作れたりしない？' },
    ],
    thanksLines: [
      { face: 3, text: 'えっ、もう作ってくれたの！？' },
      { face: 2, text: 'ありがと、トリカ！これで思いっきり声が出せるよ。しばらく喉は大事にするね！' },
    ],
    wrongLines: [
      { face: 4, text: 'うーん……それも良いお薬なんだろうけど、あたしの今の症状に合うのかな？' },
      { face: 1, text: 'もう一回、あたしの話を思い出してみて！' },
    ],
  },
  {
    id: 'xiaolan_kanbakutaisouto',
    chara: 'xiaolan',
    name: 'シャオラン',
    recipeId: 'kanbakutaisouto',
    requestLines: [
      { face: 4, text: '……あ、トリカ。あのね……最近、夜、布団に入ってもなかなか寝つけなくて……。' },
      { face: 8, text: 'この里に来たばかりで、気持ちが追いつかないのかな……。ささいなことで、涙が出そうになるんだ……。' },
      { face: 6, text: '……こういうとき、心をやわらげてくれるお薬って……あるのかな……？' },
    ],
    thanksLines: [
      { face: 3, text: 'これ……あたしに……？' },
      { face: 2, text: '……ありがとう、トリカ。……今夜は、ゆっくり眠れる気がする……。えへへ。' },
    ],
    wrongLines: [
      { face: 4, text: '……えっと、その……気持ちだけで、うれしいんだけど……。' },
      { face: 6, text: '……あたしの症状には、別のお薬が合う気がする……。ご、ごめんね……？' },
    ],
  },
  {
    id: 'nemu_kanbakutaisouto',
    chara: 'nemu',
    name: 'ネム',
    recipeId: 'kanbakutaisouto',
    requestLines: [
      { face: 4, text: 'ん、トリカちゃん……。実はさ、気持ちが昂ぶって、そわそわ落ち着かないんだよね。' },
      { face: 5, text: '弟のイチヤのことが心配でさ。胸がざわざわして、ため息ばかり増えるの。……らしくないでしょ？' },
      { face: 1, text: 'あんたのお薬で、少し楽になったりしないかな。' },
    ],
    thanksLines: [
      { face: 2, text: 'お、気が利くじゃない。……ありがと。これで少し、心が落ち着きそう。' },
      { face: 6, text: 'あんた、いい薬師になるよ。……はい、この話おしまい！' },
    ],
    wrongLines: [
      { face: 1, text: 'ん〜、それじゃない気がするなあ。' },
      { face: 6, text: 'あたしの話、ちゃんと聞いてた？　もう一回だけチャンスをあげる。' },
    ],
  },
]

// このキャラに今アクティブな依頼があれば返す。
// 発動条件=薬を累計1個以上調合していること（渡して手持ち0になっても発動は維持）。達成済みは対象外
export function activeQuestFor(chara: string): Quest | null {
  if (gameState.totalKusuriCrafted < 1) return null
  const quest = QUESTS.find((q) => q.chara === chara)
  if (!quest) return null
  if (questDeliveredAt[quest.id] !== undefined) return null
  return quest
}

// ステージ1の全依頼が達成済みか（イズナの深い会話の開放条件§9-8。開放処理は好感度開放とあわせて後日実装）
export function allStage1QuestsDelivered(): boolean {
  return QUESTS.every((q) => questDeliveredAt[q.id] !== undefined)
}

// 手持ちに1個でも薬があるか（依頼会話のあと薬渡しウインドウを開くかの判定）
export function hasAnyKusuri(): boolean {
  return Object.values(gameState.kusuriCounts).some((n) => n > 0)
}
