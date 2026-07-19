// NPC待機モーションシート（C_Sakuya3.webp / C_Izuna3.webp）からアニメ用フレームを切り出すスクリプト。
// 使い方: node scripts/extract-idle.mjs
// 方式は extract-walk.mjs と同じ: union縦位置合わせ＋横は各コマ中心＋最大連結成分のみ残す。
//
// 第4版シート（2026-07-17）: 4列×3行=12コマすべてが「1つの待機モーション」の連続フレーム。
// 読み順（上段1〜4→中段5〜8→下段9〜12）どおりに idle_1..12 として書き出す。
// 縦位置の共通化は全12コマのunionで行う（行ごとだと段の切り替わりでサイズが跳ぶため）。
// ※旧3モーション版から切り出した greet/kiai/think のPNGは会話リアクション用に残す（上書きしない）。

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2'
const OUT = new URL('../public/assets/chara', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const SHEETS = [
  // 切り出し済みキャラは再実行時に有効化する。
  // ※イズナは白い衣が背景色に近く、ポケット除去の誤爆リスクがあるため強化版で再処理しないこと
  // { src: 'C_Sakuya3.webp', prefix: 'sakuya' },
  // { src: 'C_Izuna3.webp', prefix: 'izuna' },
  // { src: 'C_Xiaoran (3).webp', prefix: 'xiaolan' },
  { src: 'C_Nemu (3).webp', prefix: 'nemu' }, // ネム: 白抜き強化版で再切り出し（2026-07-18）
]

const COLS = 4
const ROWS = 3
const PAD = 2

function removeBackground(data, width, height, tolerance = 34) {
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
  return bg
}

// 背景色に近い残留ピクセルのうち透明部分に接しているものを外側から段階的に削る（白フチ対策）
function shaveBackgroundFringe(data, width, height, bg, tolerance = 60) {
  const isBg = (i) =>
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance
  for (let pass = 0; pass < 40; pass++) {
    const toClear = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (data[p * 4 + 3] === 0 || !isBg(p * 4)) continue
        const nearTransparent =
          x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
          data[(p - 1) * 4 + 3] === 0 || data[(p + 1) * 4 + 3] === 0 ||
          data[(p - width) * 4 + 3] === 0 || data[(p + width) * 4 + 3] === 0
        if (nearTransparent) toClear.push(p)
      }
    }
    if (toClear.length === 0) break
    for (const p of toClear) data[p * 4 + 3] = 0
  }
}

// 腕と胴の間などに閉じ込められた背景色ポケットを消す（2026-07-18）。
// 狼耳の内側の白い毛など頭部の白い要素を守るため、画像上部にかかる塊は保護する
function clearEnclosedPocketsBelow(data, width, height, bg, tolerance = 14, guardTopRatio = 0.35) {
  const guardY = Math.floor(height * guardTopRatio)
  const isBg = (i) =>
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance
  const label = new Int32Array(width * height).fill(-1)
  let nextId = 0
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] === 0 || !isBg(start * 4)) continue
    const id = nextId++
    const pixels = []
    let minY = height
    const stack = [start]
    label[start] = id
    while (stack.length > 0) {
      const p = stack.pop()
      pixels.push(p)
      const x = p % width, y = (p / width) | 0
      if (y < minY) minY = y
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const np = ny * width + nx
        if (label[np] === -1 && data[np * 4 + 3] > 0 && isBg(np * 4)) {
          label[np] = id
          stack.push(np)
        }
      }
    }
    if (minY > guardY) {
      for (const p of pixels) data[p * 4 + 3] = 0
    }
  }
}

function keepLargestComponent(data, width, height) {
  const label = new Int32Array(width * height).fill(-1)
  const sizes = []
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] === 0) continue
    const id = sizes.length
    let size = 0
    const stack = [start]
    label[start] = id
    while (stack.length > 0) {
      const p = stack.pop()
      size++
      const x = p % width, y = (p / width) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const np = ny * width + nx
        if (label[np] === -1 && data[np * 4 + 3] > 0) {
          label[np] = id
          stack.push(np)
        }
      }
    }
    sizes.push(size)
  }
  const largest = sizes.indexOf(Math.max(...sizes))
  for (let p = 0; p < width * height; p++) {
    if (label[p] !== -1 && label[p] !== largest) data[p * 4 + 3] = 0
  }
}

// 輪郭を1ピクセル削る（エロージョン）。背景除去で取り切れなかった
// 白いフチ（元背景の名残）をキャラの外周ごと1px分削って目立たなくする。
function erodeEdge(data, width, height) {
  const toClear = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (data[p * 4 + 3] === 0) continue
      // 上下左右いずれかが透明（または画像端）なら輪郭ピクセル
      const edge =
        x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
        data[(p - 1) * 4 + 3] === 0 ||
        data[(p + 1) * 4 + 3] === 0 ||
        data[(p - width) * 4 + 3] === 0 ||
        data[(p + width) * 4 + 3] === 0
      if (edge) toClear.push(p)
    }
  }
  for (const p of toClear) data[p * 4 + 3] = 0
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

  // 全12コマを読み順（左上→右、上段→下段）に処理
  const cells = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { data, info } = await sharp(srcPath)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const bg = removeBackground(data, info.width, info.height)
      shaveBackgroundFringe(data, info.width, info.height, bg)
      clearEnclosedPocketsBelow(data, info.width, info.height, bg)
      keepLargestComponent(data, info.width, info.height)
      erodeEdge(data, info.width, info.height)
      const b = contentBounds(data, info.width, info.height)
      if (!b) throw new Error(`empty cell: ${sheet.src} row=${r} col=${c}`)
      cells.push({ data, info, b })
    }
  }

  // 縦位置は全12コマのunionで共通化（1つの連続モーションなのでシート全体で揃える）
  const top = Math.max(0, Math.min(...cells.map((c) => c.b.minY)) - PAD)
  const bottom = Math.min(cellH - 1, Math.max(...cells.map((c) => c.b.maxY)) + PAD)
  const canvasH = bottom - top + 1
  const canvasW = Math.max(...cells.map((c) => c.b.maxX - c.b.minX + 1)) + PAD * 2

  for (let i = 0; i < cells.length; i++) {
    const { data, info, b } = cells[i]
    const contentW = b.maxX - b.minX + 1
    const frame = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: b.minX, top, width: contentW, height: canvasH })
      .toBuffer()
    const outName = `${sheet.prefix}_idle_${i + 1}.png`
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: frame, raw: { width: contentW, height: canvasH, channels: 4 }, left: Math.round((canvasW - contentW) / 2), top: 0 }])
      .png()
      .toFile(join(OUT, outName))
    console.log(`OK: ${outName} (${canvasW}x${canvasH})`)
  }
}

console.log('done')
