// ワープ魔法陣4色＋調合マーク（4×4=16コマシート）の切り出しスクリプト。
// 使い方: node scripts/extract-effects.mjs
// 円形紋様は中心固定で発光が脈動するため、全16コマのunionキャンバスに縦横とも中央合わせで置く。

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2'
const OUT = new URL('../public/assets/effects', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const SHEETS = [
  { src: 'Warp1.webp', prefix: 'warp_pink' }, // 春
  { src: 'Warp2.webp', prefix: 'warp_blue' }, // 夏
  { src: 'Warp3.webp', prefix: 'warp_yellow' }, // 秋
  { src: 'Warp4.webp', prefix: 'warp_green' }, // 冬
  { src: 'tyougou.webp', prefix: 'mark_compound' }, // 調合マーク
]

const COLS = 4
const ROWS = 4
const PAD = 2

function removeBackground(data, width, height, tolerance = 24) {
  const idx = (x, y) => (y * width + x) * 4
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)]
  const bg = [0, 1, 2].map((ch) => corners.reduce((s, i) => s + data[i + ch], 0) / 4)
  const isBg = (i) =>
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance

  const visited = new Uint8Array(width * height)
  const queue = []
  for (let x = 0; x < width; x++) queue.push([x, 0], [x, height - 1])
  for (let y = 0; y < height; y++) queue.push([0, y], [width - 1, y])

  while (queue.length > 0) {
    const [x, y] = queue.pop()
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    const p = y * width + x
    if (visited[p]) continue
    visited[p] = 1
    const i = p * 4
    if (!isBg(i)) continue
    data[i + 3] = 0
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
}

function contentBounds(data, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { minX, minY, maxX, maxY }
}

mkdirSync(OUT, { recursive: true })

for (const sheet of SHEETS) {
  const srcPath = join(SRC_DIR, sheet.src)
  const meta = await sharp(srcPath).metadata()
  const cellW = Math.floor(meta.width / COLS)
  const cellH = Math.floor(meta.height / ROWS)
  console.log(`${sheet.src}: ${meta.width}x${meta.height}, cell ${cellW}x${cellH}`)

  const cells = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { data, info } = await sharp(srcPath)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      removeBackground(data, info.width, info.height)
      const b = contentBounds(data, info.width, info.height)
      if (!b) throw new Error(`empty cell: ${sheet.src} row=${r} col=${c}`)
      cells.push({ data, info, b })
    }
  }

  // 発光の脈動で外形サイズが変わるため、キャンバスは16コマのunion、各コマは縦横とも中央合わせ
  const canvasW = Math.max(...cells.map((c) => c.b.maxX - c.b.minX + 1)) + PAD * 2
  const canvasH = Math.max(...cells.map((c) => c.b.maxY - c.b.minY + 1)) + PAD * 2

  for (let i = 0; i < cells.length; i++) {
    const { data, info, b } = cells[i]
    const contentW = b.maxX - b.minX + 1
    const contentH = b.maxY - b.minY + 1
    const frame = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: b.minX, top: b.minY, width: contentW, height: contentH })
      .toBuffer()
    const outName = `${sheet.prefix}_${i + 1}.png`
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: frame,
        raw: { width: contentW, height: contentH, channels: 4 },
        left: Math.round((canvasW - contentW) / 2),
        top: Math.round((canvasH - contentH) / 2),
      }])
      .png()
      .toFile(join(OUT, outName))
  }
  console.log(`OK: ${sheet.prefix}_1..16 (${canvasW}x${canvasH})`)
}

console.log('done')
