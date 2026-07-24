// 柴・猫又の会話用顔グラを、専用の表情差分シートではなく待機モーション(idle_1)から作る一回限りのスクリプト。
// 背景: C_Shiba_face (2).webp / C_Nekomata_face (2).webp は「人間の顔＋動物の耳」のデザインで、
// 辞書どおりのno_humansアンスロ姿（待機モーションで使用）と食い違っていた（2026-07-24発見）。
// 本人判断（2026-07-24）: その表情シートは将来の「人間形態」演出用に保留し、通常会話の顔グラは
// アンスロ姿のidle_1（正面ニュートラルポーズ）からバストアップを切り出して代用する。
// 表情バリエーション（9種）は作れないため、同じ切り出しをface_1〜9として複製するプレースホルダー。
// 表情差分を専用生成した場合はこのスクリプトを使わず、extract-faces.mjsのSHEETSに差し替えること。

import sharp from 'sharp'
import { join } from 'node:path'

const OUT = new URL('../public/assets/chara', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// バストアップの範囲は「全身idleの上から何%まで」で指定。頭身が大きいチビキャラのため
// 上40%あたりで頭〜肩口が収まる想定（切り出し後にtrim()で余白を自動調整）
const TARGETS = [
  { chara: 'shiba', topRatio: 0.42 },
  { chara: 'nekomata', topRatio: 0.42 },
]

for (const { chara, topRatio } of TARGETS) {
  const srcPath = join(OUT, `${chara}_idle_1.png`)
  const meta = await sharp(srcPath).metadata()
  const cropH = Math.round(meta.height * topRatio)
  const cropped = await sharp(srcPath)
    .extract({ left: 0, top: 0, width: meta.width, height: cropH })
    .toBuffer()
  // sharpの既知の挙動: extract().trim()を同一パイプラインで繋げるとbad extract areaになるため、
  // 一度バッファ化してから新しいパイプラインでtrimする
  const bust = await sharp(cropped).trim().toBuffer()
  const bustMeta = await sharp(bust).metadata()
  console.log(`${chara}: idle ${meta.width}x${meta.height} -> bust ${bustMeta.width}x${bustMeta.height}`)
  for (let i = 1; i <= 9; i++) {
    const outName = `${chara}_face_${i}.png`
    await sharp(bust).toFile(join(OUT, outName))
  }
  console.log(`OK: ${chara}_face_1..9.png (placeholder, single expression)`)
}

console.log('done')
