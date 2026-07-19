// 日替わり花占い（仕様書§9-11・2026-07-19実装）。
// 各ステージ右下の「花占いのポスト」で、トリカが1人で今日の占いを独白する。
// 結果は日付から決定論的に決まり、同じ日は何度見ても同じ（引き直し不可）。
// 効果は当面フレーバーのみ（§9-10「待っても損しない」原則との干渉を避ける）ため、
// セーブに状態を持たない。ログインボーナス的な効果を付ける場合はここに閲覧記録を足す。
// 文言は花言葉・植物の豆知識のフレーバーに限定し、生薬の効能・医学的内容には踏み込まない
// （踏み込む場合はfact-check→本人サインのフロー対象。§9-11）

import type { DialogueLine } from '../ui/dialogue'

interface FortuneFlower {
  name: string
  face: number
  text: string
}

// 今日のお花（春の里プール）。ステージ追加時は季節プールを分ける想定
const FLOWERS: FortuneFlower[] = [
  { name: 'トリッカフラワー', face: 2, text: '花言葉は『めぐる季節』……って、わたしが決めたんだけどね。えへへ。今日は新しいことを始めるのにぴったりの日！' },
  { name: '桜', face: 2, text: '花言葉は『精神の美』。今日のあなたは、いつもよりちょっと凛としていられそう。背すじを伸ばしていこう！' },
  { name: 'すみれ', face: 1, text: '花言葉は『誠実』。コツコツ積み重ねてきたことが、実を結びやすい日なんだって。' },
  { name: 'たんぽぽ', face: 2, text: '花言葉は『幸福』。綿毛みたいに、小さな幸せがふわふわ舞い込んでくるかも。' },
  { name: '菜の花', face: 2, text: '花言葉は『快活』。今日は体を動かすと運気アップ！　里をぐるっとお散歩してみるのもいいね。' },
  { name: '梅', face: 6, text: '花言葉は『忍耐』。じっくり待つのが吉。畑の薬草も、あわてず見守ろう。' },
  { name: '藤', face: 1, text: '花言葉は『歓迎』。今日は誰かとゆっくりお話しすると、いいことがありそう。' },
  { name: '甘草（かんぞう）の花', face: 3, text: '甘草って、じつは薄紫のかわいい花が咲くんだよ。今日は身近なものの、意外な一面を見つけられる日かも！' },
  { name: '麦の穂', face: 1, text: '小麦は、花より穂が主役のめずらしい子。目立たなくても大事な役目があるってこと。今日は縁の下のがんばりに感謝する日！' },
  { name: '大棗（たいそう）の花', face: 1, text: 'なつめの木には、初夏に小さな淡い黄色の花が咲くんだ。小さくても実はしっかり実る。今日の小さながんばりも、ちゃんと実になるよ。' },
]

interface FortuneLuck {
  face: number
  text: string
}

// 運勢は5段階（凶なし。癒しゲーなので一番下でも前向きに締める）
const LUCKS: FortuneLuck[] = [
  { face: 3, text: 'なんと『大吉』！　今日はなにをやってもうまくいきそう。はりきっていこー！' },
  { face: 2, text: '『中吉』！　いい感じいい感じ。この調子でいこう。' },
  { face: 1, text: '『吉』！　おだやかな一日になりそう。いつもどおりが、いちばんだね。' },
  { face: 1, text: '『小吉』。ちいさな「いいこと」を見逃さないでね、ってことかな。' },
  { face: 4, text: '『末吉』……。で、でもね、末吉は「ここから上がっていく」って意味もあるんだから！　ゆっくりいこう。' },
]

const TORIKA_NAME = '酉花（トリカ）'

// 日付を数値シードにする（例: 2026-07-19 → 20260719）。実行中に日をまたいでも反映される
function todaySeed(now = new Date()): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
}

// 今日の花占いをトリカの独白（会話ウインドウ用の行）として返す。
// 花と運勢は別々の素数で混ぜて、日ごとの組み合わせが単純な循環にならないようにする
export function fortuneLines(): DialogueLine[] {
  const seed = todaySeed()
  const flower = FLOWERS[(seed * 13 + 7) % FLOWERS.length]
  const luck = LUCKS[(seed * 31 + 3) % LUCKS.length]
  const line = (face: number, text: string): DialogueLine => ({
    speaker: 'torika',
    name: TORIKA_NAME,
    face,
    text,
  })
  return [
    line(2, 'よーし、今日の花占い、いってみよう！　水盤にお花を浮かべて……。'),
    line(3, `今日のお花は――『${flower.name}』！`),
    line(flower.face, flower.text),
    line(luck.face, `そして今日の運勢は……${luck.text}`),
  ]
}
