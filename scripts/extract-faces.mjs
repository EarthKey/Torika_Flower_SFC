// 会話ウインドウ用の顔グラ（バストアップ）切り出しスクリプト。
// 使い方: node scripts/extract-faces.mjs
// 表情シート（C_Torika2 / C_Izuna2 / C_Sakuya2、3×3の9表情）から読み順に
// {prefix}_face_1..9.png を書き出す。方式は extract-idle.mjs と同じ:
// 背景除去（角の色からBFS）→最大連結成分のみ→輪郭1px削り→9コマunionで位置合わせ。
//
// 表情の読み順マッピング（3キャラ共通の並び）:
// 1=通常 2=にっこり(目閉じ) 3=驚き 4=困り/沈み 5=怒り/むっ 6=真剣/照れ笑い
// 7=白目ショック 8=青ざめ 9=目回し
// ※キャラごとに5と6のニュアンスが少し違う（トリカ5=ぷんすか,6=真剣 / イズナ5=心配,6=微笑 / 咲耶5=真剣,6=照れ笑い）

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2'
const OUT = new URL('../public/assets/chara', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const SHEETS = [
  // トリカ・イズナ・咲耶は切り出し済み。再実行時は下の3行を有効化する
  // { src: 'C_Torika2.webp', prefix: 'torika' },
  // { src: 'C_Izuna2.webp', prefix: 'izuna' },
  // { src: 'C_Sakuya2.webp', prefix: 'sakuya' },
  { src: 'C_Xiaoran (2).webp', prefix: 'xiaolan' },
  { src: 'C_Nemu (2).webp', prefix: 'nemu' },
]

const COLS = 3
const ROWS = 3
const PAD = 2

// 背景色に近い残留ピクセル（髪の毛の隙間などBFSが届かなかった白フチ）を、
// 透明部分に接しているものだけ外側から段階的に削る。白目・ハイライトなど
// キャラ内部の白は透明部分に接していないため削られない。
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
          data[(p - 1) * 4 + 3] === 0 ||
          data[(p + 1) * 4 + 3] === 0 ||
          data[(p - width) * 4 + 3] === 0 ||
          data[(p + width) * 4 + 3] === 0
        if (nearTransparent) toClear.push(p)
      }
    }
    if (toClear.length === 0) break
    for (const p of toClear) data[p * 4 + 3] = 0
  }
}

// 髪と体の間などに閉じ込められた背景色ポケット（外側BFSが届かない白抜き残り）を消す。
// 白目・ハイライトと背景はほぼ同色（実測: 背景251,247,244 / 白目252,249,243）で色では
// 区別できないため、構図が共通なことを利用して「顔の中央領域（目・口がある帯）に
// 掛からない背景色の塊」だけを消す。中央領域に少しでも掛かる塊は白目とみなして残す。
function clearEnclosedPockets(data, width, height, bg, tolerance = 14) {
  const guard = {
    minX: Math.floor(width * 0.26),
    maxX: Math.ceil(width * 0.74),
    minY: Math.floor(height * 0.16),
    maxY: Math.ceil(height * 0.64),
  }
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
    let touchesGuard = false
    const stack = [start]
    label[start] = id
    while (stack.length > 0) {
      const p = stack.pop()
      pixels.push(p)
      const x = p % width, y = (p / width) | 0
      if (x >= guard.minX && x <= guard.maxX && y >= guard.minY && y <= guard.maxY) touchesGuard = true
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
    if (!touchesGuard) {
      for (const p of pixels) data[p * 4 + 3] = 0
    }
  }
}

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
  return bg // フチ削り（shaveBackgroundFringe）で同じ背景色を使う
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

function erodeEdge(data, width, height) {
  const toClear = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (data[p * 4 + 3] === 0) continue
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
      clearEnclosedPockets(data, info.width, info.height, bg)
      keepLargestComponent(data, info.width, info.height)
      erodeEdge(data, info.width, info.height)
      const b = contentBounds(data, info.width, info.height)
      if (!b) throw new Error(`empty cell: ${sheet.src} row=${r} col=${c}`)
      cells.push({ data, info, b })
    }
  }

  // 会話ウインドウで表情が切り替わってもガタつかないよう、9コマunionで枠を共通化。
  // 顔は下端（胸元）で切れているデザインなので下端アンカー＝unionの下端に揃える
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
    const outName = `${sheet.prefix}_face_${i + 1}.png`
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
