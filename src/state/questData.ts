// 薬依頼システム（仕様書§9-8・薬依頼割当表.md 2026-07-19本人サイン済み）。
// 発動条件: 薬を累計1個でも調合すると、各キャラが「欲しい薬の症状」を語り始める。
// キャラは薬名を言わず、症状ヒント2つ（割当表の検証済み文言をそのまま織り込む）から
// プレイヤーが処方を推理して渡す。正解で好感度ボーナス、不正解は薬を消費しない（再挑戦自由）。
// 一発完結制（2026-07-21・割当表の未決事項を解消）: 依頼は達成したら終わりで、同じ依頼が
// 24時間後に再発動することはない（「毎回同じ薬を求め続ける」違和感を解消）。1キャラが複数の
// 依頼を持つ場合は、QUESTS/QUESTS_STAGE2…に同じcharaのQuestを配列の順番どおり複数並べる。
// activeQuestForはそのキャラの「まだ渡していない最初の依頼」を返すので、渡し終えるたびに
// 自然と次の依頼（ステージ3以降で追加予定の復習枠など）へ進む形になる

import { anySeasonRecipeCrafted, gameState, questDeliveredAt, unlockCrossTalkTier, type Season } from './gameState'

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
  // この依頼が「どの季節相当」か（薬依頼割当表.md 2026-07-23確定分が一次ソース。2026-07-24追加）。
  // クロストーク解禁判定（GridScene.giveTo）で、そのキャラの季節タグ付き依頼を渡し終えたかの判定に使う
  unlockSeason: Season
  recipeId: string // 正解の処方（RECIPESのid）
  requestLines: QuestLine[] // 症状ヒント2つを織り込んだ依頼会話（薬名は言わない）
  thanksLines: QuestLine[] // 正解を渡したときのお礼
  wrongLines: QuestLine[] // 違う薬を渡したとき（薬は消費しない）
}

// ステージ1（春・甲賀）の3依頼。症状ヒント①②は割当表の文言そのまま
export const QUESTS: Quest[] = [
  {
    id: 'sakuya_kanzoto',
    unlockSeason: 'spring',
    chara: 'sakuya',
    name: '咲耶（サクヤ）',
    recipeId: 'kanzoto',
    requestLines: [
      { face: 4, text: 'あ……酉花、ちょうどよかった。実はさ、修行で号令をかけすぎちゃって……喉がイガイガして声が出しにくいんだ。' },
      { face: 5, text: 'しかも咳き込むと喉にひびいて痛くて……。このままじゃ、明日の修行に差しつかえるよ〜。' },
      { face: 1, text: 'ねえ酉花、こういうときに合うお薬って、作れたりしない？' },
    ],
    thanksLines: [
      { face: 3, text: 'えっ、もう作ってくれたの！？' },
      { face: 2, text: 'ありがと、酉花！これで思いっきり声が出せるよ。しばらく喉は大事にするね！' },
    ],
    wrongLines: [
      { face: 4, text: 'うーん……それも良いお薬なんだろうけど、あたしの今の症状に合うのかな？' },
      { face: 1, text: 'もう一回、あたしの話を思い出してみて！' },
    ],
  },
  {
    id: 'xiaolan_kanbakutaisouto',
    unlockSeason: 'spring',
    chara: 'xiaolan',
    name: 'シャオラン',
    recipeId: 'kanbakutaisouto',
    requestLines: [
      { face: 4, text: '……あ、酉花。あのね……最近、夜、布団に入ってもなかなか寝つけなくて……。' },
      { face: 8, text: 'この里に来たばかりで、気持ちが追いつかないのかな……。ささいなことで、涙が出そうになるんだ……。' },
      { face: 6, text: '……こういうとき、心をやわらげてくれるお薬って……あるのかな……？' },
    ],
    thanksLines: [
      { face: 3, text: 'これ……あたしに……？' },
      { face: 2, text: '……ありがとう、酉花。……今夜は、ゆっくり眠れる気がする……。えへへ。' },
    ],
    wrongLines: [
      { face: 4, text: '……えっと、その……気持ちだけで、うれしいんだけど……。' },
      { face: 6, text: '……あたしの症状には、別のお薬が合う気がする……。ご、ごめんね……？' },
    ],
  },
  {
    id: 'nemu_kanbakutaisouto',
    unlockSeason: 'spring',
    chara: 'nemu',
    name: 'ネム',
    recipeId: 'kanbakutaisouto',
    requestLines: [
      { face: 4, text: 'ん、酉花ちゃん……。実はさ、気持ちが昂ぶって、そわそわ落ち着かないんだよね。' },
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
    unlockSeason: 'summer',
    chara: 'aum',
    name: 'アウン',
    recipeId: 'shakuyakukanzoto',
    requestLines: [
      { face: 5, text: '……酉花、ちょうどいいところに。実はさ、夜中に足がつって飛び起きるんだ。ここ最近、毎晩みたいに。' },
      { face: 8, text: '急にふくらはぎがぎゅっと痛くなってさ……夏の走り込み、ちょっとやりすぎたかもしれない。' },
      { face: 1, text: '兄貴のアトザは、これくらい平気な顔してこなしてたけどな……。俺には、まだ早かったみたいだ。' },
      { face: 6, text: 'な、酉花。こういうときに効くお薬、なんとかならないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'おお、マジか！　もう作ってくれたのか！' },
      { face: 2, text: 'ありがとな、酉花！　これで夜中に飛び起きずに済みそうだ。……兄貴にも自慢しとくわ！' },
    ],
    wrongLines: [
      { face: 4, text: 'ん……悪いお薬じゃないんだろうけど、俺の足のつりには合わなそうだな。' },
      { face: 1, text: 'もう一回、さっきの話思い出してくれよ！' },
    ],
  },
  {
    id: 'janome_keishito',
    unlockSeason: 'summer',
    chara: 'janome',
    name: '蛇ノ目（ジャノメ）',
    recipeId: 'keishito',
    requestLines: [
      { face: 1, text: '……酉花か。ちょうどいい、聞いてくれ。かぜのひき始めみたいに、ゾクゾクするんだ。' },
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
    unlockSeason: 'summer',
    chara: 'ibuki',
    name: 'イブキ',
    recipeId: 'keishikashakuyakuto',
    requestLines: [
      { face: 4, text: '酉花さん……少し、相談してもいいですか。おなかが張って、しくしく痛むんです。' },
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

// 春組（咲耶・シャオラン・ネム）の夏・秋・冬の追加依頼（薬依頼割当表.md「秋・冬の追加依頼」節・
// 2026-07-23 fact-checker検証済み・本人サイン済み）。各キャラ「春→夏→秋→冬」の順で並べること
// （activeQuestForは配列の並び順で最初の未達成依頼を返すため）
export const QUESTS_SPRING_SEASONAL: Quest[] = [
  {
    id: 'sakuya_shakuyakukanzoto',
    unlockSeason: 'summer',
    chara: 'sakuya',
    name: '咲耶（サクヤ）',
    recipeId: 'shakuyakukanzoto',
    requestLines: [
      { face: 4, text: '酉花、また相談していい？' },
      { face: 5, text: '稽古のあと、足がつって飛び起きることがあるんだ。' },
      { face: 8, text: 'ふくらはぎが急にぎゅっと痛くなって、たまらないんだよね。' },
      { face: 1, text: '前と同じお薬じゃなくて、今度はこの症状に合うやつ、作れる？' },
    ],
    thanksLines: [
      { face: 3, text: 'お、もう用意してくれてたんだ！' },
      { face: 2, text: 'ありがと、酉花！　これで安心して稽古できるよ。' },
    ],
    wrongLines: [
      { face: 4, text: 'うーん、それだと足のつりには効かなそうだな。' },
      { face: 1, text: 'もう一度、話をよく聞いてみて！' },
    ],
  },
  {
    id: 'sakuya_kanbakutaisouto',
    unlockSeason: 'autumn',
    chara: 'sakuya',
    name: '咲耶（サクヤ）',
    recipeId: 'kanbakutaisouto',
    requestLines: [
      { face: 4, text: '酉花……ちょっとだけ、聞いてほしいことがあって。' },
      { face: 6, text: '最近、なんでもないのに急に泣きそうになるんだ。' },
      { face: 8, text: '夜も何だか気持ちが落ち着かなくて……。' },
      { face: 1, text: 'こういうときに、心を落ち着かせてくれるお薬ってある？' },
    ],
    thanksLines: [
      { face: 3, text: '酉花……ありがとう。' },
      { face: 2, text: 'なんだか、少し肩の力が抜けた気がする。これでまた、頑張れそう！' },
    ],
    wrongLines: [
      { face: 6, text: '……ありがたいけど、今のあたしにはちょっと違う気がするな。' },
      { face: 1, text: 'もう一回、話を聞いてみてくれる？' },
    ],
  },
  {
    id: 'sakuya_keishininjinto',
    unlockSeason: 'winter',
    chara: 'sakuya',
    name: '咲耶（サクヤ）',
    recipeId: 'keishininjinto',
    requestLines: [
      { face: 4, text: '酉花、ちょっと聞いてくれる？' },
      { face: 5, text: '最近、季節外れの冷え込みで体が冷えたのか、頭が痛くて。' },
      { face: 8, text: '動悸もして、みぞおちのあたりがひんやりするんだ。' },
      { face: 1, text: 'こういうときに合うお薬、作れないかな？' },
    ],
    thanksLines: [
      { face: 3, text: 'えっ、もうできたの！？　助かる〜。' },
      { face: 2, text: 'ありがと、酉花！　これで寒さも怖くないよ。' },
    ],
    wrongLines: [
      { face: 4, text: 'うーん……悪くはないんだろうけど、今の症状とはちょっと違う気がするな。' },
      { face: 1, text: 'もう一回、さっきの話思い出してみて！' },
    ],
  },
  {
    id: 'xiaolan_shakuyakukanzoto',
    unlockSeason: 'summer',
    chara: 'xiaolan',
    name: 'シャオラン',
    recipeId: 'shakuyakukanzoto',
    requestLines: [
      { face: 4, text: '……あ、酉花。ちょっといい……？' },
      { face: 8, text: '……このごろ、稽古で急に足がつることが増えて……。' },
      { face: 6, text: '……ふくらはぎが、ぎゅっと痛くなるの……。' },
      { face: 1, text: '……こういうとき、合うお薬……あるかな……？' },
    ],
    thanksLines: [
      { face: 3, text: '……これ、あたしに……？' },
      { face: 2, text: '……ありがとう、酉花。……これで、稽古も怖くないかも……。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいけど……それは、ちょっと違う気がする……。' },
      { face: 6, text: '……もう一回、話を聞いてくれる……？' },
    ],
  },
  {
    id: 'xiaolan_kanzoto',
    unlockSeason: 'autumn',
    chara: 'xiaolan',
    name: 'シャオラン',
    recipeId: 'kanzoto',
    requestLines: [
      { face: 4, text: '……酉花、あの……。' },
      { face: 8, text: '……のど、イガイガして……声が出しにくくて……。' },
      { face: 6, text: '……咳き込むと、喉に響いて痛いの……。' },
      { face: 1, text: '……何か、合うお薬……ないかな……？' },
    ],
    thanksLines: [
      { face: 3, text: '……もう、できたの……？' },
      { face: 2, text: '……ありがとう……。これで、少し楽になりそう……。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいけど……喉には、合わない気がして……。' },
      { face: 6, text: '……もう一度、話を聞いてもらえる……？' },
    ],
  },
  {
    id: 'xiaolan_kanzokankyoto',
    unlockSeason: 'winter',
    chara: 'xiaolan',
    name: 'シャオラン',
    recipeId: 'kanzokankyoto',
    requestLines: [
      { face: 4, text: '……酉花、聞いてくれる……？' },
      { face: 8, text: '……春なのに、手足の先が、ずっと冷えてる気がして……。' },
      { face: 6, text: '……お手洗いが近い気がするの……。' },
      { face: 1, text: '……こういうとき、合うお薬……あるのかな……？' },
    ],
    thanksLines: [
      { face: 3, text: '……これを、あたしに……？' },
      { face: 2, text: '……ありがとう、酉花。……季節外れの冷えも、これで乗り越えられそう……。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいけど……今の冷えには、合わない気がして……。' },
      { face: 6, text: '……もう一回、話を聞いてくれる……？' },
    ],
  },
  {
    id: 'nemu_keishito',
    unlockSeason: 'summer',
    chara: 'nemu',
    name: 'ネム',
    recipeId: 'keishito',
    requestLines: [
      { face: 4, text: 'ん、酉花ちゃん。ちょっと聞いてよ。' },
      { face: 5, text: '季節の変わり目みたいな風邪かね、ゾクゾクする感じがあってさ。' },
      { face: 8, text: '汗はじんわり出てるのに、寒気がとれないんだよね。' },
      { face: 1, text: 'あんたのお薬、こういうときにも効いたりする？' },
    ],
    thanksLines: [
      { face: 2, text: 'お、気が利くじゃない。……ありがと。' },
      { face: 6, text: 'これでゆっくり休めそう。あんた、頼りになるね。' },
    ],
    wrongLines: [
      { face: 1, text: 'ん〜、それはちょっと違う気がするなあ。' },
      { face: 6, text: 'もう一回、あたしの話聞いてた？' },
    ],
  },
  {
    id: 'nemu_keishikakakkonto',
    unlockSeason: 'autumn',
    chara: 'nemu',
    name: 'ネム',
    recipeId: 'keishikakakkonto',
    requestLines: [
      { face: 4, text: '酉花ちゃん、また相談させて。' },
      { face: 5, text: '肩から首にかけて、こわばって回らないんだよね。' },
      { face: 8, text: 'なのに、じっとり汗はかいてるんだ。おかしいでしょ？' },
      { face: 1, text: 'あんたのお薬で、なんとかならない？' },
    ],
    thanksLines: [
      { face: 2, text: 'おお、ちゃんと分かってるじゃない。ありがと。' },
      { face: 6, text: 'これで肩も軽くなりそう。いい薬師になったね。' },
    ],
    wrongLines: [
      { face: 1, text: 'んー、それじゃない気がするな。' },
      { face: 6, text: 'もう一回、話をちゃんと聞いてくれる？' },
    ],
  },
  {
    id: 'nemu_kanzoto',
    unlockSeason: 'winter',
    chara: 'nemu',
    name: 'ネム',
    recipeId: 'kanzoto',
    requestLines: [
      { face: 4, text: '酉花ちゃん、ちょっといい？' },
      { face: 5, text: '喉がイガイガして、声が出しにくいんだよね。' },
      { face: 8, text: '咳き込むと喉に響いて痛くてさ。' },
      { face: 1, text: 'あんたのお薬で、楽になったりしない？' },
    ],
    thanksLines: [
      { face: 2, text: 'ん、ありがと。これで声も出しやすくなりそう。' },
      { face: 6, text: 'あんた、ほんといい薬師だね。' },
    ],
    wrongLines: [
      { face: 1, text: 'んー、それじゃ喉には効かなそうだな。' },
      { face: 6, text: 'もう一回、話を聞いてみてよ。' },
    ],
  },
]

// 夏組（蛇ノ目・アウン・イブキ）の秋・冬の追加依頼（同上）
export const QUESTS_SUMMER_SEASONAL: Quest[] = [
  {
    id: 'janome_keishikakakkonto',
    unlockSeason: 'autumn',
    chara: 'janome',
    name: '蛇ノ目（ジャノメ）',
    recipeId: 'keishikakakkonto',
    requestLines: [
      { face: 1, text: '……酉花か。また聞いてくれ。' },
      { face: 6, text: '……首すじから肩がこわばって回しにくいんだ。' },
      { face: 2, text: '汗ばんでいるのに、首の後ろが重だるい。厄介なもんだな。' },
      { face: 1, text: '何か、合う薬があれば助かる。' },
    ],
    thanksLines: [
      { face: 2, text: '……ああ、助かる。悪いな。' },
      { face: 6, text: 'お前、だんだん薬師らしくなってきたな。' },
    ],
    wrongLines: [
      { face: 1, text: '……いや、それは違う気がするな。' },
      { face: 6, text: 'もう一度、俺の話を聞いてから選んでくれ。' },
    ],
  },
  {
    id: 'janome_maoto',
    unlockSeason: 'winter',
    chara: 'janome',
    name: '蛇ノ目（ジャノメ）',
    recipeId: 'maoto',
    requestLines: [
      { face: 1, text: '……酉花、今度は少し違う話だ。' },
      { face: 6, text: '……今度は、汗がまったく出ないんだ。' },
      { face: 2, text: '節々が痛くて、寒気も強い。夏だというのに、厄介な方だな。' },
      { face: 1, text: '合う薬、頼めるか。' },
    ],
    thanksLines: [
      { face: 2, text: '……ああ、悪いな。これで少し楽になりそうだ。' },
      { face: 6, text: 'お前も、いい薬師になったもんだ。' },
    ],
    wrongLines: [
      { face: 1, text: '……いや、それは違う気がするな。' },
      { face: 6, text: 'もう一度、俺の話をよく聞いてくれ。' },
    ],
  },
  {
    id: 'aum_keishikakakkonto',
    unlockSeason: 'autumn',
    chara: 'aum',
    name: 'アウン',
    recipeId: 'keishikakakkonto',
    requestLines: [
      { face: 5, text: '……酉花、また頼みがあるんだ。' },
      { face: 8, text: '首から肩がこわばって回らないんだよな。' },
      { face: 6, text: '汗はかいてるのに、首の後ろが重だるいんだ。' },
      { face: 1, text: 'な、酉花。合う薬、なんとかならないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'おお、もうできたのか！　さすがだな。' },
      { face: 2, text: 'ありがとな、酉花！　これで肩も軽くなりそうだ。' },
    ],
    wrongLines: [
      { face: 4, text: 'ん……悪くないんだろうけど、俺のこの症状には合わなそうだな。' },
      { face: 1, text: 'もう一回、さっきの話思い出してくれよ！' },
    ],
  },
  {
    id: 'aum_kakkonto',
    unlockSeason: 'winter',
    chara: 'aum',
    name: 'アウン',
    recipeId: 'kakkonto',
    requestLines: [
      { face: 5, text: '酉花、今度はちょっと手強い相談だ。' },
      { face: 8, text: 'かぜのひき始めなのに、全然汗が出ないんだ。' },
      { face: 6, text: '夏だってのに、首の後ろがぞくぞくして、こわばる感じがする。' },
      { face: 1, text: 'な、頼む。合う薬、作れないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'マジか！　もうできてたのか！' },
      { face: 2, text: 'ありがとな、酉花！　これでかぜも吹き飛ばせそうだ。' },
    ],
    wrongLines: [
      { face: 4, text: 'ん……それも良いんだろうけど、俺のこの症状には合わなそうだな。' },
      { face: 1, text: 'もう一回、話思い出してくれよ！' },
    ],
  },
  {
    id: 'ibuki_kanzokankyoto',
    unlockSeason: 'autumn',
    chara: 'ibuki',
    name: 'イブキ',
    recipeId: 'kanzokankyoto',
    requestLines: [
      { face: 4, text: '酉花さん……また相談してもいいですか。' },
      { face: 8, text: '季節外れの冷えでしょうか……体の芯が冷えて、口の中に薄い唾がたまるんです。' },
      { face: 1, text: '冷えると、お手洗いが近くなる気がします。' },
      { face: 6, text: 'もし、合うお薬があれば……分けていただけますか。' },
    ],
    thanksLines: [
      { face: 3, text: 'これを、僕に……ありがとうございます。' },
      { face: 2, text: '少し、体の芯が温まった気がします。大切に頂きますね。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですが、今の僕には、少し合わない気がします。' },
      { face: 6, text: 'もう一度、僕の話を聞いてもらえますか。' },
    ],
  },
  {
    id: 'ibuki_maoto',
    unlockSeason: 'winter',
    chara: 'ibuki',
    name: 'イブキ',
    recipeId: 'maoto',
    requestLines: [
      { face: 4, text: '酉花さん、今度は少し違う相談です。' },
      { face: 8, text: '今度は熱が高くて、節々が痛むんです。' },
      { face: 1, text: '汗はまったく出ていなくて……。' },
      { face: 6, text: 'もし、合うお薬があれば……お願いできますか。' },
    ],
    thanksLines: [
      { face: 3, text: 'ありがとうございます……これで、少し楽になれそうです。' },
      { face: 2, text: '僕にも、こんなに早く用意してくれるなんて。大切に頂きますね。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですが、今の僕には、少し合わない気がします。' },
      { face: 6, text: 'もう一度、僕の話を聞いてもらえますか。' },
    ],
  },
]

// ステージ3（秋・雑賀）新規3体（柴・猫又・弁天）の依頼（秋2種＋冬2種・薬依頼割当表.md準拠）。
// 2026-07-23時点でこの3体はまだどの場面にも配置されていない（ステージ3のマップ・NPC配置は未実装）。
// npcStates・dialogues.jsonへのエントリ追加も未着手（ステージ実装時にあわせて行う）
export const QUESTS_STAGE3: Quest[] = [
  {
    id: 'shiba_maoto',
    unlockSeason: 'autumn',
    chara: 'shiba',
    name: '柴（シバ）',
    recipeId: 'maoto',
    requestLines: [
      { face: 4, text: '酉花、聞いてくれ！' },
      { face: 5, text: '熱が高くて、体のフシブシが痛いんだ。' },
      { face: 8, text: '寒気が強いのに、汗はまったく出ていないんだよ。' },
      { face: 1, text: 'こういうときに効くお薬、作れないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'おお、もうできたのか！' },
      { face: 2, text: 'ありがとな、酉花！　これで動けそうだ！' },
    ],
    wrongLines: [
      { face: 4, text: 'うーん、それだと汗が出ないこの熱には合わなそうだ。' },
      { face: 1, text: 'もう一回、さっきの話思い出してくれよ！' },
    ],
  },
  {
    id: 'shiba_keishikashakuyakuto',
    unlockSeason: 'autumn',
    chara: 'shiba',
    name: '柴（シバ）',
    recipeId: 'keishikashakuyakuto',
    requestLines: [
      { face: 4, text: 'なあ酉花、今度は別の話なんだ。' },
      { face: 5, text: 'おなかが張って、しくしく痛むんだ。' },
      { face: 8, text: 'お腹の調子が不安定で、ゆるくなったり止まったりするんだよ。' },
      { face: 1, text: '合う薬、なんとかならないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'もうできたのか、助かる！' },
      { face: 2, text: 'ありがとな、酉花！　これで安心して任務に行けそうだ。' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それはお腹の張りには合わなそうだな。' },
      { face: 1, text: 'もう一回、話思い出してくれよ！' },
    ],
  },
  {
    id: 'shiba_kanzoto',
    unlockSeason: 'winter',
    chara: 'shiba',
    name: '柴（シバ）',
    recipeId: 'kanzoto',
    requestLines: [
      { face: 4, text: '酉花、また頼みたいことがあるんだ。' },
      { face: 5, text: '喉がイガイガして、声が出しにくいんだ。' },
      { face: 8, text: '咳き込むと喉に響いて痛いんだよ。' },
      { face: 1, text: '合う薬、作れないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'おお、もう用意してくれてたのか！' },
      { face: 2, text: 'ありがとな、酉花！　これで声も出せそうだ。' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それは喉には合わなそうだな。' },
      { face: 1, text: 'もう一回、話思い出してくれよ！' },
    ],
  },
  {
    id: 'shiba_ninjinto',
    unlockSeason: 'winter',
    chara: 'shiba',
    name: '柴（シバ）',
    recipeId: 'ninjinto',
    requestLines: [
      { face: 4, text: '酉花、今度は冷えの話なんだ。' },
      { face: 5, text: '胃腸が冷えて食欲がわかないんだよ。' },
      { face: 8, text: '冷たいものをとると、すぐお腹を壊すんだ。' },
      { face: 1, text: 'こういうときに合う薬、なんとかならないか？' },
    ],
    thanksLines: [
      { face: 3, text: 'もう用意してくれてたのか、助かる！' },
      { face: 2, text: 'ありがとな、酉花！　これで食欲も戻りそうだ。' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それは胃腸の冷えには合わなそうだな。' },
      { face: 1, text: 'もう一回、話思い出してくれよ！' },
    ],
  },
  {
    id: 'nekomata_kanzoto',
    unlockSeason: 'autumn',
    chara: 'nekomata',
    name: '猫又（ねこまた）',
    recipeId: 'kanzoto',
    requestLines: [
      { face: 4, text: '酉花、ちょっと聞いてほしいにゃ。' },
      { face: 5, text: '喉がイガイガして、声が出しにくいにゃ。' },
      { face: 8, text: '咳き込むと喉に響いて痛いにゃ。' },
      { face: 1, text: 'こういうとき、合うお薬あるにゃ？' },
    ],
    thanksLines: [
      { face: 3, text: 'もうできたのかにゃ！？' },
      { face: 2, text: 'ありがとにゃ、酉花。これで喉も楽になりそうにゃ。' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それは喉には合わなそうにゃ。' },
      { face: 1, text: 'もう一回、話聞いてほしいにゃ。' },
    ],
  },
  {
    id: 'nekomata_keishikakakkonto',
    unlockSeason: 'autumn',
    chara: 'nekomata',
    name: '猫又（ねこまた）',
    recipeId: 'keishikakakkonto',
    requestLines: [
      { face: 4, text: '酉花、また相談があるにゃ。' },
      { face: 5, text: '首すじから肩がこわばって回しにくいにゃ。' },
      { face: 8, text: '汗ばんでいるのに首の後ろが重だるいにゃ。' },
      { face: 1, text: '合うお薬、作れるにゃ？' },
    ],
    thanksLines: [
      { face: 3, text: 'もう用意してくれてたのかにゃ！' },
      { face: 2, text: 'ありがとにゃ、酉花。これで肩も軽くなりそうにゃ。' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それは肩のこわばりには合わなそうにゃ。' },
      { face: 1, text: 'もう一回、話聞いてほしいにゃ。' },
    ],
  },
  {
    id: 'nekomata_shakuyakukanzoto',
    unlockSeason: 'winter',
    chara: 'nekomata',
    name: '猫又（ねこまた）',
    recipeId: 'shakuyakukanzoto',
    requestLines: [
      { face: 4, text: '酉花、今度は足の話なんにゃ。' },
      { face: 5, text: '足がつって、飛び起きることがあるにゃ。' },
      { face: 8, text: 'ふくらはぎが急にぎゅっと痛くなるにゃ。' },
      { face: 1, text: '合うお薬、頼めるにゃ？' },
    ],
    thanksLines: [
      { face: 3, text: 'もうできてたのかにゃ！' },
      { face: 2, text: 'ありがとにゃ、酉花。これで安心して眠れそうにゃ。' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それは足のつりには合わなそうにゃ。' },
      { face: 1, text: 'もう一回、話聞いてほしいにゃ。' },
    ],
  },
  {
    id: 'nekomata_maoto',
    unlockSeason: 'winter',
    chara: 'nekomata',
    name: '猫又（ねこまた）',
    recipeId: 'maoto',
    requestLines: [
      { face: 4, text: '酉花、最後にもうひとつ聞いてほしいにゃ。' },
      { face: 5, text: '熱が高くて節々が痛いにゃ。' },
      { face: 8, text: '寒気が強いのに汗はまったく出ないにゃ。' },
      { face: 1, text: '合うお薬、なんとかならないにゃ？' },
    ],
    thanksLines: [
      { face: 3, text: 'もう用意してくれてたのかにゃ！' },
      { face: 2, text: 'ありがとにゃ、酉花。これで動けそうにゃ。' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それはこの熱には合わなそうにゃ。' },
      { face: 1, text: 'もう一回、話聞いてほしいにゃ。' },
    ],
  },
  {
    id: 'benten_kanzoto',
    unlockSeason: 'autumn',
    chara: 'benten',
    name: '弁天（べんてん）',
    recipeId: 'kanzoto',
    requestLines: [
      { face: 4, text: '酉花さん、少しよろしいかしら。' },
      { face: 5, text: '喉がイガイガして、声が出しにくくて。' },
      { face: 8, text: '咳き込むと喉に響いて痛みますの。' },
      { face: 1, text: '合うお薬、作っていただけません？' },
    ],
    thanksLines: [
      { face: 3, text: 'まあ、もう用意してくださったのね。' },
      { face: 2, text: 'ありがとう、酉花さん。三味線も弾きやすくなりそうですわ。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですけれど、喉には少し違う気がしますわ。' },
      { face: 6, text: 'もう一度、お話を聞いていただけまして？' },
    ],
  },
  {
    id: 'benten_kanbakutaisouto',
    unlockSeason: 'autumn',
    chara: 'benten',
    name: '弁天（べんてん）',
    recipeId: 'kanbakutaisouto',
    requestLines: [
      { face: 4, text: '酉花さん、もうひとつ聞いていただける？' },
      { face: 6, text: 'なんでもないのに、涙が出そうになりますの。' },
      { face: 8, text: '気持ちが落ち着かない夜が続いていて。' },
      { face: 1, text: 'こういうときに合うお薬、ありませんこと？' },
    ],
    thanksLines: [
      { face: 3, text: 'まあ……これを、わたくしに？' },
      { face: 2, text: 'ありがとう、酉花さん。今夜はゆっくり眠れそうですわ。' },
    ],
    wrongLines: [
      { face: 6, text: '……ありがたいのですけれど、今のわたくしには少し違う気がしますわ。' },
      { face: 1, text: 'もう一度、お話を聞いていただけまして？' },
    ],
  },
  {
    id: 'benten_kanzokankyoto',
    unlockSeason: 'winter',
    chara: 'benten',
    name: '弁天（べんてん）',
    recipeId: 'kanzokankyoto',
    requestLines: [
      { face: 4, text: '酉花さん、少しご相談してもよろしいかしら。' },
      { face: 5, text: '体の芯が冷えて、口に薄い唾がたまりますわ。' },
      { face: 8, text: '冷えるとお手洗いが近くなりますの。' },
      { face: 1, text: 'こういうときに合うお薬、作っていただけません？' },
    ],
    thanksLines: [
      { face: 3, text: 'まあ、もうご用意くださったの？' },
      { face: 2, text: 'ありがとう、酉花さん。これで体の芯も温まりそうですわ。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですけれど、今のわたくしには少し違う気がしますわ。' },
      { face: 6, text: 'もう一度、お話を聞いていただけまして？' },
    ],
  },
  {
    id: 'benten_keishininjinto',
    unlockSeason: 'winter',
    chara: 'benten',
    name: '弁天（べんてん）',
    recipeId: 'keishininjinto',
    requestLines: [
      { face: 4, text: '酉花さん、最後のご相談ですの。' },
      { face: 5, text: '冷えると頭痛がして、おなかもゆるくなりますわ。' },
      { face: 8, text: '動悸がして、みぞおちのあたりが冷たいんですの。' },
      { face: 1, text: '合うお薬、なんとかなりません？' },
    ],
    thanksLines: [
      { face: 3, text: 'まあ、もうできておりましたの？' },
      { face: 2, text: 'ありがとう、酉花さん。これで頭も軽くなりそうですわ。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですけれど、今の症状には少し違う気がしますわ。' },
      { face: 6, text: 'もう一度、お話を聞いていただけまして？' },
    ],
  },
]

// ステージ4（冬・伊賀）新規3体（餡音・結・ハヤテ）の依頼（冬3種・薬依頼割当表.md準拠）。
// 2026-07-23時点でこの3体はまだどの場面にも配置されていない（ステージ4のマップ・NPC配置は未実装）。
// npcStates・dialogues.jsonへのエントリ追加も未着手（ステージ実装時にあわせて行う）
export const QUESTS_STAGE4: Quest[] = [
  {
    id: 'anne_keishikakakkonto',
    unlockSeason: 'winter',
    chara: 'anne',
    name: '餡音（あんね）',
    recipeId: 'keishikakakkonto',
    requestLines: [
      { face: 4, text: 'ねえ酉花、ちょっと聞いてよ！' },
      { face: 5, text: '首から肩がこわばって回らないよ。' },
      { face: 8, text: '汗ばんでるのに首の後ろが重だるいの。' },
      { face: 1, text: '合うお薬、作ってくれない？' },
    ],
    thanksLines: [
      { face: 3, text: 'わあ、もうできたの！？' },
      { face: 2, text: 'ありがと酉花！　これで肩も軽くなりそう！' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それだとちょっと違う気がするなあ。' },
      { face: 1, text: 'もう一回、さっきの話思い出してよ！' },
    ],
  },
  {
    id: 'anne_maoto',
    unlockSeason: 'winter',
    chara: 'anne',
    name: '餡音（あんね）',
    recipeId: 'maoto',
    requestLines: [
      { face: 4, text: '酉花、今度は別の相談だよ！' },
      { face: 5, text: '熱が高くて節々が痛いんだよね。' },
      { face: 8, text: '寒気が強いのに汗が全然出ないの。' },
      { face: 1, text: '合うお薬、なんとかならない？' },
    ],
    thanksLines: [
      { face: 3, text: 'えっ、もう用意してくれてたの！？' },
      { face: 2, text: 'ありがと酉花！　これで動けそう！' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それだとこの熱には合わなそうだなあ。' },
      { face: 1, text: 'もう一回、話思い出してよ！' },
    ],
  },
  {
    id: 'anne_kanzokankyoto',
    unlockSeason: 'winter',
    chara: 'anne',
    name: '餡音（あんね）',
    recipeId: 'kanzokankyoto',
    requestLines: [
      { face: 4, text: '酉花、最後にもうひとつ聞いてよ！' },
      { face: 5, text: '体の芯から冷えて、口に薄い唾がたまるんだ。' },
      { face: 8, text: '冷えるとお手洗いが近くなっちゃって。' },
      { face: 1, text: '合うお薬、頼める？' },
    ],
    thanksLines: [
      { face: 3, text: 'わあ、もうできてたんだ！' },
      { face: 2, text: 'ありがと酉花！　これで体もぽかぽかになりそう！' },
    ],
    wrongLines: [
      { face: 4, text: 'んー、それだとこの冷えには合わなそうだなあ。' },
      { face: 1, text: 'もう一回、話思い出してよ！' },
    ],
  },
  {
    id: 'yui_kanzokankyoto',
    unlockSeason: 'winter',
    chara: 'yui',
    name: '結（ゆい）',
    recipeId: 'kanzokankyoto',
    requestLines: [
      { face: 4, text: '酉花さん、少しご相談してもいいですか。' },
      { face: 5, text: '体の芯が冷えて、口の中に薄い唾がたまるんです。' },
      { face: 8, text: '冷えると、お手洗いが近くなる気がします。' },
      { face: 1, text: '合うお薬、いただけますか。' },
    ],
    thanksLines: [
      { face: 3, text: 'もう用意してくださったんですね。' },
      { face: 2, text: 'ありがとうございます。これで後方支援も安心してこなせそうです。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですが、今の症状には少し違う気がします。' },
      { face: 6, text: 'もう一度、話を聞いてもらえますか。' },
    ],
  },
  {
    id: 'yui_keishininjinto',
    unlockSeason: 'winter',
    chara: 'yui',
    name: '結（ゆい）',
    recipeId: 'keishininjinto',
    requestLines: [
      { face: 4, text: '酉花さん、また別のご相談です。' },
      { face: 5, text: '冷えると頭痛がして、おなかもゆるくなるんです。' },
      { face: 8, text: '動悸がして、みぞおちのあたりが冷たくて。' },
      { face: 1, text: '合うお薬、作っていただけますか。' },
    ],
    thanksLines: [
      { face: 3, text: 'もうできていたんですね。' },
      { face: 2, text: 'ありがとうございます。これで頭も落ち着きそうです。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですが、今の症状には少し違う気がします。' },
      { face: 6, text: 'もう一度、話を聞いてもらえますか。' },
    ],
  },
  {
    id: 'yui_keishikakakkonto',
    unlockSeason: 'winter',
    chara: 'yui',
    name: '結（ゆい）',
    recipeId: 'keishikakakkonto',
    requestLines: [
      { face: 4, text: '酉花さん、最後にもうひとつよろしいですか。' },
      { face: 5, text: '首すじから肩がこわばって回しにくいんです。' },
      { face: 8, text: '汗ばんでいるのに首の後ろが重だるくて。' },
      { face: 1, text: '合うお薬、いただけますか。' },
    ],
    thanksLines: [
      { face: 3, text: 'もう用意してくださったんですね。' },
      { face: 2, text: 'ありがとうございます。これで肩も軽くなりそうです。' },
    ],
    wrongLines: [
      { face: 4, text: '……ありがたいのですが、今の症状には少し違う気がします。' },
      { face: 6, text: 'もう一度、話を聞いてもらえますか。' },
    ],
  },
  {
    id: 'hayate_maoto',
    unlockSeason: 'winter',
    chara: 'hayate',
    name: 'ハヤテ',
    recipeId: 'maoto',
    requestLines: [
      { face: 1, text: '酉花、少し頼みがあるのだが。' },
      { face: 6, text: '熱が高くて、体のフシブシが痛むんだ。' },
      { face: 2, text: '寒気が強いのに、汗がまったく出ない。' },
      { face: 1, text: '合う薬、なんとかならないか。' },
    ],
    thanksLines: [
      { face: 2, text: '……ああ、助かる。もう用意していたか。' },
      { face: 6, text: 'お前も、いっぱしの薬師になったものだな。' },
    ],
    wrongLines: [
      { face: 1, text: '……いや、それは違う気がするな。' },
      { face: 6, text: 'もう一度、俺の話をよく聞いてくれ。' },
    ],
  },
  {
    id: 'hayate_shakuyakukanzoto',
    unlockSeason: 'winter',
    chara: 'hayate',
    name: 'ハヤテ',
    recipeId: 'shakuyakukanzoto',
    requestLines: [
      { face: 1, text: '酉花、今度は少し情けない話だ。' },
      { face: 6, text: '急に足がつって、飛び起きることがあってな。' },
      { face: 2, text: 'ふくらはぎがぎゅっと痛くなるんだ。' },
      { face: 1, text: '合う薬、頼めるか。' },
    ],
    thanksLines: [
      { face: 2, text: '……ああ、助かった。もう用意していたのか。' },
      { face: 6, text: '歳をとると、こういうものが応えるものだな。' },
    ],
    wrongLines: [
      { face: 1, text: '……いや、それは違う気がするな。' },
      { face: 6, text: 'もう一度、俺の話をよく聞いてくれ。' },
    ],
  },
  {
    id: 'hayate_keishikashakuyakuto',
    unlockSeason: 'winter',
    chara: 'hayate',
    name: 'ハヤテ',
    recipeId: 'keishikashakuyakuto',
    requestLines: [
      { face: 1, text: '酉花、最後にもうひとつ頼みたい。' },
      { face: 6, text: 'おなかが張って、しくしく痛むんだ。' },
      { face: 2, text: '調子が不安定で、ゆるくなったり止まったりする。' },
      { face: 1, text: '合う薬、なんとかならないか。' },
    ],
    thanksLines: [
      { face: 2, text: '……ああ、助かる。これで任務にも集中できそうだ。' },
      { face: 6, text: 'お前には、世話になりっぱなしだな。' },
    ],
    wrongLines: [
      { face: 1, text: '……いや、それは違う気がするな。' },
      { face: 6, text: 'もう一度、俺の話をよく聞いてくれ。' },
    ],
  },
]

// ステージ1〜4をまとめた全依頼（activeQuestFor等はこちらを見る）。各キャラの追加依頼は
// 元の依頼の直後（同じ配列内・後続の追加専用配列）に置き、季節の順で進むようにしてある
const ALL_QUESTS: Quest[] = [
  ...QUESTS,
  ...QUESTS_SPRING_SEASONAL,
  ...QUESTS_STAGE2,
  ...QUESTS_SUMMER_SEASONAL,
  ...QUESTS_STAGE3,
  ...QUESTS_STAGE4,
]

// 2026-07-22 テストプレイ用の一時措置（本人依頼）: 依頼セリフ（症状ヒント・お礼・不正解）だけを
// 繰り返し確認したいため、一発完結制（渡したら二度と発動しない）を一時的にオフにする。
// trueの間は渡し終えた依頼も何度でも再発動する。確認が終わったらfalseに戻すこと
const TEST_ALLOW_QUEST_REPEAT = false

// このキャラに今アクティブな依頼があれば返す（=そのキャラに割り当てられた依頼のうち、
// まだ渡し終えていない最初の1件。配列の並び順どおりに進む）。
// 発動条件（2026-07-27改定・本人指示）: 薬を累計1個以上調合していることに加え、
// **その依頼の季節のレシピをどれか1種類調合済み**であること。新ステージに入った瞬間に
// 全員が症状を語り出す唐突さをなくし、「新しい生薬を集めて調合を体験→依頼が動き出す」の順にする。
// 春組の2巡目（夏タグの追加依頼）も同じゲートに乗るので、夏の薬を1つ作るまでは世間話のまま。
// 全依頼を渡し終えたキャラはnull（＝通常の世間話に戻る。もう「お薬をねだられ続ける」ことはない）
export function activeQuestFor(chara: string): Quest | null {
  if (gameState.totalKusuriCrafted < 1) return null
  const quest = TEST_ALLOW_QUEST_REPEAT
    ? ALL_QUESTS.find((q) => q.chara === chara) ?? null
    : ALL_QUESTS.find((q) => q.chara === chara && questDeliveredAt[q.id] === undefined) ?? null
  if (!quest) return null
  return anySeasonRecipeCrafted(quest.unlockSeason) ? quest : null
}

// ステージ1の全依頼を「渡し終えているか」。イズナの深い会話の開放条件・季節の門の解放条件（§9-8・§2）。
// 一発完結制になったため「渡し終えた」＝「ずっとその状態」で、以前のような時間経過による揺り戻しはない
export function allStage1QuestsEverDelivered(): boolean {
  return QUESTS.every((q) => questDeliveredAt[q.id] !== undefined)
}

// ステージ2の全依頼を「渡し終えているか」。秋の門の解放条件（§2）。仕組みはステージ1と同じ
export function allStage2QuestsEverDelivered(): boolean {
  return QUESTS_STAGE2.every((q) => questDeliveredAt[q.id] !== undefined)
}

// ステージ3（柴・猫又・弁天、各4件）の全依頼を渡し終えているか。イズナの深い会話ステージ3分の解放条件。
// 冬への門はまだ実装対象外（2026-07-24時点でステージ4は解放判定なし・依頼データのみ先行実装）
export function allStage3QuestsEverDelivered(): boolean {
  return QUESTS_STAGE3.every((q) => questDeliveredAt[q.id] !== undefined)
}

// ステージ4（餡音・結・ハヤテ、各3件）の全依頼を渡し終えているか。イズナの深い会話ステージ4分の解放条件
export function allStage4QuestsEverDelivered(): boolean {
  return QUESTS_STAGE4.every((q) => questDeliveredAt[q.id] !== undefined)
}

// ── 季節の門の解放条件（2026-07-25本人指示で明文化・統一） ──────────────────
// 門の条件は「そのステージの担当3キャラに、それぞれ1件でも渡し終えたか」。
// 春(QUESTS)・夏(QUESTS_STAGE2)は各キャラ1件ずつの3件構成なので従来と同じ挙動だが、
// 秋(QUESTS_STAGE3)だけは追加依頼を別配列に分けず12件を1配列に入れていたため、
// 「全依頼」条件だと冬の門だけ実質4倍の難易度になっていた。ここで3ステージとも同じ規則に揃える。
// イズナの深い会話は従来どおり「全依頼」条件のまま（allStageNQuestsEverDelivered）で据え置く
function eachCharaDeliveredOnce(quests: Quest[]): boolean {
  const charas = [...new Set(quests.map((q) => q.chara))]
  if (charas.length === 0) return false
  return charas.every((c) =>
    quests.some((q) => q.chara === c && questDeliveredAt[q.id] !== undefined),
  )
}

// 夏の門（春の里の右上）の解放条件: 咲耶・シャオラン・ネムに各1件
export function summerGateConditionMet(): boolean {
  return eachCharaDeliveredOnce(QUESTS)
}

// 秋への門（夏の里の右上）の解放条件: 蛇ノ目・アウン・イブキに各1件
export function autumnGateConditionMet(): boolean {
  return eachCharaDeliveredOnce(QUESTS_STAGE2)
}

// 冬への門（秋の里の右上）の解放条件: 柴・猫又・弁天に各1件（従来は12件全部だった）
export function winterGateConditionMet(): boolean {
  return eachCharaDeliveredOnce(QUESTS_STAGE3)
}

// ── クロストーク解放（2026-07-24〜） ──────────────────
// 12キャラ（春夏秋冬の担当3体ずつ）共通のクロストーク仕組み。各キャラの季節タグ付き依頼を
// 「その季節ぶん」全部渡し終えるたびに、目標値まで解放数を引き上げる。
// 目標値は本人設計（2026-07-24）: 春組=春夏秋冬で1→2→3→4／夏組=夏(初期2)→秋3→冬4／
// 秋組=秋(初期2)→冬4／冬組=冬で4本まとめて解放。全キャラ最終的に4本で揃う
export const CROSS_TALK_TARGETS: Record<string, Partial<Record<Season, number>>> = {
  sakuya: { spring: 1, summer: 2, autumn: 3, winter: 4 },
  xiaolan: { spring: 1, summer: 2, autumn: 3, winter: 4 },
  nemu: { spring: 1, summer: 2, autumn: 3, winter: 4 },
  janome: { summer: 2, autumn: 3, winter: 4 },
  aum: { summer: 2, autumn: 3, winter: 4 },
  ibuki: { summer: 2, autumn: 3, winter: 4 },
  shiba: { autumn: 2, winter: 4 },
  nekomata: { autumn: 2, winter: 4 },
  benten: { autumn: 2, winter: 4 },
  anne: { winter: 4 },
  yui: { winter: 4 },
  hayate: { winter: 4 },
}

// そのキャラに1件でも薬を渡し終えているか（変化の話の解放条件・2026-07-27）
export function anyQuestDeliveredFor(chara: string): boolean {
  return ALL_QUESTS.some((q) => q.chara === chara && questDeliveredAt[q.id] !== undefined)
}

// そのキャラの「season相当」の依頼を全部渡し終えているか（該当依頼が1件も無ければfalse）
function seasonQuestsDeliveredFor(chara: string, season: Season): boolean {
  const relevant = ALL_QUESTS.filter((q) => q.chara === chara && q.unlockSeason === season)
  if (relevant.length === 0) return false
  return relevant.every((q) => questDeliveredAt[q.id] !== undefined)
}

// 依頼を渡した直後にGridScene.giveTo()から呼ぶ。新規に解放されたクロストークのtier番号を返す
// （dialogues.json側のcrossTalkプールのキーと対応）。何も解放されなければnull
export function checkCrossTalkUnlock(chara: string, season: Season): number | null {
  const target = CROSS_TALK_TARGETS[chara]?.[season]
  if (target === undefined) return null
  if (!seasonQuestsDeliveredFor(chara, season)) return null
  return unlockCrossTalkTier(chara, target) ? target : null
}

// 旧セーブ救済（2026-07-25）: npcCrossTalkは2026-07-24に追加したフィールドなので、それ以前の
// セーブには入っていない。また、本文が未執筆だった時期に依頼を渡し終えたセーブでは解放フラグだけが
// 先に立っている。どちらの場合も納品履歴（questDeliveredAt）が残っているので、そこから
// 解放数を作り直す。クロストークは常設会話になったため、これだけで過去ぶんも会話に並ぶ。
// シーン入場時に毎回呼んでよい（すでに到達済みのtierには何もしない）
export function syncCrossTalkFromDeliveries() {
  for (const [chara, targets] of Object.entries(CROSS_TALK_TARGETS)) {
    for (const [season, target] of Object.entries(targets)) {
      if (seasonQuestsDeliveredFor(chara, season as Season)) unlockCrossTalkTier(chara, target)
    }
  }
}

// 手持ちに1個でも薬があるか（依頼会話のあと薬渡しウインドウを開くかの判定）
export function hasAnyKusuri(): boolean {
  return Object.values(gameState.kusuriCounts).some((n) => n > 0)
}
