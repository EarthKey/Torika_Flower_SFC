// 切り出し済みPNGの「閉じ込められた透明の穴」を埋める後処理スクリプト。
// 背景除去（extract-*.mjs系）の副作用で、耳の内側の白い毛柄など「背景色に近いが実は
// キャラの一部」の領域が誤って透明化されることがある（画像の外周とつながっていない
//孤立した透明ピクセル塊）。これを検出し、周囲の不透明ピクセルの色を使って塗り戻す。
// 画像の外周とつながっている透明（＝本物の背景）には一切触れない。
//
// 使い方: node scripts/fix-enclosed-holes.mjs <file1.png> <file2.png> ...

import sharp from 'sharp'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/fix-enclosed-holes.mjs <file1.png> [file2.png ...]')
  process.exit(1)
}

for (const file of files) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info

  // 外周とつながっている透明ピクセルをBFSでマーク＝本物の背景
  const isOuterBg = new Uint8Array(width * height)
  const queue = []
  for (let x = 0; x < width; x++) queue.push([x, 0], [x, height - 1])
  for (let y = 0; y < height; y++) queue.push([0, y], [width - 1, y])
  while (queue.length > 0) {
    const [x, y] = queue.pop()
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    const p = y * width + x
    if (isOuterBg[p]) continue
    if (data[p * 4 + 3] !== 0) continue
    isOuterBg[p] = 1
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  // 外周とつながっていない透明ピクセル＝穴。数が0になるまで、不透明な隣接ピクセルの
  // 色平均で1周ずつ埋めていく（内側からじわじわ塗り戻すので自然になじむ）
  let holeCount = 0
  for (let p = 0; p < width * height; p++) {
    if (data[p * 4 + 3] === 0 && !isOuterBg[p]) holeCount++
  }
  if (holeCount === 0) {
    console.log(`skip (no holes): ${file}`)
    continue
  }

  let remaining = holeCount
  for (let pass = 0; pass < 60 && remaining > 0; pass++) {
    const fills = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (data[p * 4 + 3] !== 0 || isOuterBg[p]) continue
        let r = 0, g = 0, b = 0, n = 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const np = ny * width + nx
          if (data[np * 4 + 3] === 0) continue
          r += data[np * 4]; g += data[np * 4 + 1]; b += data[np * 4 + 2]; n++
        }
        if (n > 0) fills.push([p, Math.round(r / n), Math.round(g / n), Math.round(b / n)])
      }
    }
    for (const [p, r, g, b] of fills) {
      data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = 255
    }
    remaining -= fills.length
    if (fills.length === 0) break // 隣接に不透明が無い孤立ピクセル（理論上ほぼ無い）は諦める
  }

  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(file)
  console.log(`fixed: ${file} (${holeCount} hole px)`)
}
