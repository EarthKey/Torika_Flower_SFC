// 生成済みアセットシート（D:\AIillust\...\V2）から個別スプライトを切り出すスクリプト。
// 使い方: node scripts/extract-assets.mjs
// 各セルを大まかに切り出し → 背景（アイボリー/白）を外周からの塗りつぶし判定で透過 →
// 中身のバウンディングボックスでトリミング → public/assets/ へPNG出力する。
// シートを再生成したら、このスクリプトを再実行するだけで差し替えられる。

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2'
const OUT = new URL('../public/assets', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const KINDS = ['kanzou', 'syoubaku', 'taisou']

// ── 切り出し定義 ─────────────────────────────
// rect: [left, top, width, height]（シート上のおおまかなセル範囲。正確さはトリムが吸収する）

const jobs = []

// 種シート（テキストなし版）: 1448×1086、4列×3行の均等グリッド
{
  const CW = 362
  const cols = ['field', 'bag', 'mini', 'glow']
  KINDS.forEach((kind, r) => {
    cols.forEach((col, c) => {
      jobs.push({
        src: 'seed.webp',
        rect: [c * CW, r * CW, CW, CW],
        out: `items/seed_${col}_${kind}.png`,
      })
    })
  })
}

// 植物の成長4段階（テキストなし版）: 1448×1086、上段=拡大絵、下段=32×32簡略版
{
  const files = { kanzou: 'kanzou (2).webp', syoubaku: 'syoubaku (2).webp', taisou: 'taisou (2).webp' }
  const CW = 362
  for (const kind of KINDS) {
    for (let stage = 1; stage <= 4; stage++) {
      jobs.push({
        src: files[kind],
        rect: [(stage - 1) * CW, 40, CW, 640],
        out: `plants/${kind}_large_stage${stage}.png`,
      })
      jobs.push({
        src: files[kind],
        rect: [(stage - 1) * CW, 680, CW, 400],
        out: `plants/${kind}_stage${stage}.png`,
      })
    }
  }
}

// 生薬メダル（旧テキスト入りシートだが「32×32簡略版」列は文字なしで独立している）: 1086×1448
{
  const rows = { kanzou: [180, 320], syoubaku: [610, 340], taisou: [1040, 330] }
  for (const kind of KINDS) {
    const [top, h] = rows[kind]
    jobs.push({
      src: 'medal1.webp',
      rect: [760, top, 280, h],
      out: `items/medal_${kind}.png`,
    })
  }
}

// 甘麦大棗湯（テキストなし版・スティック分包8パネル）: 1448×1086
// ゲームで使う4パネルのみ切り出す
{
  const panels = {
    kusuri_stick: [20, 90, 280, 470], // スティック正面
    kusuri_bowl: [310, 90, 380, 470], // 木皿の粉薬
    kusuri_icon: [1150, 90, 290, 470], // 32×32簡略版スティック
    kusuri_glow: [670, 570, 275, 420], // 取得演出用の発光スティック
  }
  for (const [name, rect] of Object.entries(panels)) {
    jobs.push({ src: 'd1.webp', rect, out: `items/${name}.png` })
  }
}

// トリカ三面図（C_Torika.webp）: 1448×1086、左から正面・左向き側面・背面
// プレイヤースプライト用（右向きはゲーム側で側面を左右反転して使う）
{
  const views = { front: [0, 0, 483, 1086], side: [483, 0, 483, 1086], back: [966, 0, 482, 1086] }
  for (const [name, rect] of Object.entries(views)) {
    jobs.push({ src: 'C_Torika.webp', rect, out: `chara/torika_${name}.png` })
  }
}

// ── 背景透過処理 ─────────────────────────────
// セルの外周ピクセルから始めて、背景色に近い色を連結領域として透明化する（BFS）。
// スプライト内部の白（花・ハイライト等）は外周と繋がっていないので残る。

function removeBackground(data, width, height, tolerance = 34) {
  const idx = (x, y) => (y * width + x) * 4
  // 四隅の平均を背景色とみなす
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)]
  const bg = [0, 1, 2].map((ch) => corners.reduce((s, i) => s + data[i + ch], 0) / 4)
  const isBg = (i) =>
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance

  const visited = new Uint8Array(width * height)
  const queue = []
  for (let x = 0; x < width; x++) { queue.push([x, 0], [x, height - 1]) }
  for (let y = 0; y < height; y++) { queue.push([0, y], [width - 1, y]) }

  while (queue.length > 0) {
    const [x, y] = queue.pop()
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    const p = y * width + x
    if (visited[p]) continue
    visited[p] = 1
    const i = p * 4
    if (!isBg(i)) continue
    data[i + 3] = 0 // 透明化
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

// ── 実行 ─────────────────────────────────────

for (const job of jobs) {
  const [left, top, width, height] = job.rect
  const cell = await sharp(join(SRC, job.src))
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data, info } = cell
  removeBackground(data, info.width, info.height)
  const b = contentBounds(data, info.width, info.height)
  if (!b) {
    console.warn(`SKIP (empty): ${job.out}`)
    continue
  }

  const pad = 2
  const cropL = Math.max(0, b.minX - pad)
  const cropT = Math.max(0, b.minY - pad)
  const cropW = Math.min(info.width, b.maxX + pad + 1) - cropL
  const cropH = Math.min(info.height, b.maxY + pad + 1) - cropT

  const outPath = join(OUT, job.out)
  mkdirSync(join(OUT, job.out.split('/')[0]), { recursive: true })
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
    .png()
    .toFile(outPath)
  console.log(`OK: ${job.out} (${cropW}x${cropH})`)
}

console.log('done')
