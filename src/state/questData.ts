// 薬依頼システム（仕様書§9-8・薬依頼割当表.md 2026-07-19本人サイン済み）。
// 発動条件: 薬を累計1個でも調合すると、各キャラが「欲しい薬の症状」を語り始める。
// キャラは薬名を言わず、症状ヒント2つ（割当表の検証済み文言をそのまま織り込む）から
// プレイヤーが処方を推理して渡す。正解で好感度ボーナス、不正解は薬を消費しない（再挑戦自由）。
// 24時間ループ（§9-8・2026-07-19実装）: 達成から24時間経つと同じ依頼が再び発動する。
// 実時間で判定するため、ブラウザを閉じていても復活が進む（種の採取クールダウンと同じ考え方）。

import { gameState, questDeliveredAt } from './gameState'

// 薬プレゼントの好感度ボーナス（話しかけ+1に対する二段構え。§9-8）
export const GIFT_TRUST_BONUS = 2

// 依頼の再発動までの実時間（§9-8確定仕様どおり24時間。テスト短縮はしない＝収穫等の
// プロトタイプ短縮とは違い、日課の間隔そのものが仕様の核なので実時間のまま扱う）
export const QUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000

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

// ステージ2（夏・風魔）の3依頼。症状ヒント①②・必須トーク要素（兄アトザ／相棒オロチ／相棒ヤーマ）は
// 薬依頼割当表.mdの本人サイン済み文言に準拠
export const QUESTS_STAGE2: Quest[] = [
  {
    id: 'aum_shakuyakukanzoto',
    chara: 'aum',
    name: 'アウン',
    recipeId: 'shakuyakukanzoto',
    requestLines: [
      { face: 5, text: '……トリカ、ちょうどいいところに。実はさ、夜中に足がつって飛び起きるんだ。ここ最近、毎晩みたいに。' },
      { face: 8, text: '急にふくらはぎがぎゅっと痛くなってさ……夏の走り込み、ちょっとやりすぎたかもしれない。' },
      { face: 1, text: '兄貴のアトザは、これくらい平気な顔してこなしてたけどな……。俺には、まだ早かったみたいだ。' },
      { face: 6, text: 'な、トリカ。こういうときに効くお薬、なんとかならないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'おお、マジか！　もう作ってくれたのか！' },
      { face: 2, text: 'ありがとな、トリカ！　これで夜中に飛び起きずに済みそうだ。……兄貴にも自慢しとくわ！' },
    ],
    wrongLines: [
      { face: 4, text: 'ん……悪いお薬じゃないんだろうけど、俺の足のつりには合わなそうだな。' },
      { face: 1, text: 'もう一回、さっきの話思い出してくれよ！' },
    ],
  },
  {
    id: 'janome_keishito',
    chara: 'janome',
    name: '蛇ノ目（ジャノメ）',
    recipeId: 'keishito',
    requestLines: [
      { face: 1, text: '……トリカか。ちょうどいい、聞いてくれ。かぜのひき始めみたいに、ゾクゾクするんだ。' },
      { face: 6, text: 'じんわり汗は出てるのに、寒気がとれない。……夕立に打たれたのが、まずかったな。' },
      { face: 2, text: '相棒のオロチにも心配された。……俺にしては珍しいことだ。' },
      { face: 1, text: '何か、合う薬があれば……くれると助かる。' },
    ],
    thanksLines: [
      { face: 2, text: '……ああ、悪いな。助かった。' },
      { face: 6, text: 'お前、ちゃんと薬師してるじゃないか。……見直した。' },
    ],
    wrongLines: [
      { face: 1, text: '……いや、それは違う気がするな。' },
      { face: 6, text: 'もう一度、俺の話を聞いてから選んでくれ。' },
    ],
  },
  {
    id: 'ibuki_keishikashakuyakuto',
    chara: 'ibuki',
    name: 'イブキ',
    recipeId: 'keishikashakuyakuto',
    requestLines: [
      { face: 4, text: 'トリカさん……少し、相談してもいいですか。おなかが張って、しくしく痛むんです。' },
      { face: 8, text: '調子も不安定で……ゆるくなったり、止まったり。冷たいものを食べすぎたのが、いけなかったみたいです。' },
      { face: 1, text: '相棒のヤーマにも、そんなに食べるからだと呆れられました。……返す言葉もありません。' },
      { face: 6, text: 'もし、合うお薬があれば……分けていただけますか。' },
    ],
    thanksLines: [
      { face: 3, text: 'これを、僕に……ありがとうございます。' },
      { face: 2, text: '少し、楽になった気がします。……大切に頂きますね。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですが、今の僕には、少し合わない気がします。' },
      { face: 6, text: 'もう一度、僕の話を聞いてもらえますか。' },
    ],
  },
]

// ステージ1・2をまとめた全依頼（activeQuestFor等はこちらを見る）
const ALL_QUESTS: Quest[] = [...QUESTS, ...QUESTS_STAGE2]

// このキャラに今アクティブな依頼があれば返す。
// 発動条件=薬を累計1個以上調合していること（渡して手持ち0になっても発動は維持）。
// 未達成なら常にアクティブ。達成済みでも24時間（QUEST_COOLDOWN_MS）経過していれば再びアクティブになる
export function activeQuestFor(chara: string, nowMs = Date.now()): Quest | null {
  if (gameState.totalKusuriCrafted < 1) return null
  const quest = ALL_QUESTS.find((q) => q.chara === chara)
  if (!quest) return null
  const deliveredAt = questDeliveredAt[quest.id]
  if (deliveredAt !== undefined && nowMs - deliveredAt < QUEST_COOLDOWN_MS) return null
  return quest
}

// ステージ1の全依頼が「現時点で」達成済み（=クールダウン中）か。イズナの深い会話の開放条件（§9-8）。
// 24時間ループで依頼が復活すると再びfalseに戻るが、開放自体は一度きり（gameState.unlockIzunaStage1Dialogueが保持）
export function allStage1QuestsDelivered(nowMs = Date.now()): boolean {
  return QUESTS.every((q) => {
    const deliveredAt = questDeliveredAt[q.id]
    return deliveredAt !== undefined && nowMs - deliveredAt < QUEST_COOLDOWN_MS
  })
}

// ステージ1の全依頼を「過去に一度でも」渡し終えているか（24時間の期限なし）。
// 季節の門の解放（§2・一度きり）用。allStage1QuestsDelivered（24時間以内）だと、
// 実装より前に達成済みだった旧セーブや、達成から24時間過ぎたセーブで解放されないため分離
export function allStage1QuestsEverDelivered(): boolean {
  return QUESTS.every((q) => questDeliveredAt[q.id] !== undefined)
}

// 手持ちに1個でも薬があるか（依頼会話のあと薬渡しウインドウを開くかの判定）
export function hasAnyKusuri(): boolean {
  return Object.values(gameState.kusuriCounts).some((n) => n > 0)
}
