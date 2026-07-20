// isnet-anime（ローカル背景除去サーバー）で事前に透過済みのシートから
// ゲーム用アセットを書き出す一回限りのスクリプト。
// 対象: アウンの表情シート(C_Aum (2)_cutout.png・3x3)、イブキの待機モーション(C_Ibuki (3)_cutout.png・4x3)
//
// extract-faces.mjs / extract-idle.mjs との違い: 入力が既に透過済みなので
// removeBackground/shaveBackgroundFringe/clearEnclosedPockets(Below)は一切実行しない
// （白背景前提のBFSをかけると、既に透明なフチのRGBを誤って背景色と誤認するリスクがあるため）。
// ノイズ対策のkeepLargestComponentのみ残し、あとはunion位置合わせ〜書き出しを各元スクリプトと同じロジックで行う。

import sharp from 'sharp'
import { join } from 'node:path'

const SRC_DIR = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2'
const OUT = new URL('../public/assets/chara', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

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

async function loadCells(srcPath, cols, rows) {
  const meta = await sharp(srcPath).metadata()
  const cellW = Math.floor(meta.width / cols)
  const cellH = Math.floor(meta.height / rows)
  console.log(`${srcPath}: ${meta.width}x${meta.height}, cell ${cellW}x${cellH}`)
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { data, info } = await sharp(srcPath)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      keepLargestComponent(data, info.width, info.height)
      const b = contentBounds(data, info.width, info.height)
      if (!b) throw new Error(`empty cell: ${srcPath} row=${r} col=${c}`)
      cells.push({ data, info, b, cellH })
    }
  }
  return cells
}

// --- アウン 表情シート（3x3・extract-faces.mjsと同じunion揃え） ---
async function rebuildFace() {
  const PAD = 2
  const cells = await loadCells(join(SRC_DIR, 'C_Aum (2)_cutout.png'), 3, 3)
  const cellH = cells[0].cellH

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
    const outName = `aum_face_${i + 1}.png`
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: frame, raw: { width: contentW, height: canvasH, channels: 4 }, left: Math.round((canvasW - contentW) / 2), top: 0 }])
      .png()
      .toFile(join(OUT, outName))
    console.log(`OK: ${outName} (${canvasW}x${canvasH})`)
  }
}

// --- イブキ 待機モーション（4x3・extract-idle.mjsと同じ足元(maxY)アンカー揃え） ---
async function rebuildIdle() {
  const PAD = 2
  const cells = await loadCells(join(SRC_DIR, 'C_Ibuki (3)_cutout.png'), 4, 3)
  const cellH = cells[0].cellH

  const canvasH = Math.max(...cells.map((c) => c.b.maxY - c.b.minY + 1)) + PAD * 2
  const canvasW = Math.max(...cells.map((c) => c.b.maxX - c.b.minX + 1)) + PAD * 2

  for (let i = 0; i < cells.length; i++) {
    const { data, info, b } = cells[i]
    const contentW = b.maxX - b.minX + 1
    let top = b.maxY - (canvasH - 1 - PAD)
    top = Math.max(0, Math.min(top, cellH - canvasH))
    const frame = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: b.minX, top, width: contentW, height: canvasH })
      .toBuffer()
    const outName = `ibuki_idle_${i + 1}.png`
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: frame, raw: { width: contentW, height: canvasH, channels: 4 }, left: Math.round((canvasW - contentW) / 2), top: 0 }])
      .png()
      .toFile(join(OUT, outName))
    console.log(`OK: ${outName} (${canvasW}x${canvasH})`)
  }
}

await rebuildFace()
await rebuildIdle()
console.log('done')
