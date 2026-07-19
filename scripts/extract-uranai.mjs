// 花占いポスト（uranai.webp・4×4=16コマシート）の切り出しスクリプト。
// 使い方: node scripts/extract-uranai.mjs
// extract-effects.mjs（魔法陣用）は各コマの内容物を中央合わせにするが、このシートは
// 浮遊する花びらでコマごとの外形が変わるため、中央合わせだとポスト本体がガタつく。
// そこで全コマ共通の切り出し矩形（各コマのbboxのunion）でグリッド位置のまま切り出し、
// 本体を固定したまま花びらの動きを保存する。

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2/uranai.webp'
const OUT = new URL('../public/assets/effects', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PREFIX = 'hanauranai_post'

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

const meta = await sharp(SRC).metadata()
const cellW = Math.floor(meta.width / COLS)
const cellH = Math.floor(meta.height / ROWS)
console.log(`uranai.webp: ${meta.width}x${meta.height}, cell ${cellW}x${cellH}`)

const cells = []
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const { data, info } = await sharp(SRC)
      .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    removeBackground(data, info.width, info.height)
    const b = contentBounds(data, info.width, info.height)
    if (!b) throw new Error(`empty cell: row=${r} col=${c}`)
    cells.push({ data, info, b })
  }
}

// 全コマ共通の切り出し矩形（union＋余白。コマ外へはみ出さない範囲でクランプ）
const rect = {
  minX: Math.max(0, Math.min(...cells.map((c) => c.b.minX)) - PAD),
  minY: Math.max(0, Math.min(...cells.map((c) => c.b.minY)) - PAD),
  maxX: Math.min(cellW - 1, Math.max(...cells.map((c) => c.b.maxX)) + PAD),
  maxY: Math.min(cellH - 1, Math.max(...cells.map((c) => c.b.maxY)) + PAD),
}
const outW = rect.maxX - rect.minX + 1
const outH = rect.maxY - rect.minY + 1

for (let i = 0; i < cells.length; i++) {
  const { data, info } = cells[i]
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: rect.minX, top: rect.minY, width: outW, height: outH })
    .png()
    .toFile(join(OUT, `${PREFIX}_${i + 1}.png`))
}
console.log(`OK: ${PREFIX}_1..16 (${outW}x${outH})`)
