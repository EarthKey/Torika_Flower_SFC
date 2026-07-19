// 完成薬アイコンの12バリエーション自動生成（仕様書§9-9・2026-07-19確定の最終対応表準拠）
// ベース: public/assets/items/kusuri_icon.png（甘麦大棗湯・クリーム地に緑アクセント）
// 方式: 緑アクセント画素の色相置換＋ライン（ツムラ実物: 細=10番・太=50番）のSVG合成
//   - tsumura: 一の位の色に置換＋ライン。番号はHUDでは出さない（拡大用の丸囲み番号は解説カード側で表示）
//   - other  : 白基調（アクセント無彩色化）＋角囲み番号（クラシエ401・東洋27）
//   - classic: 無地（アクセント無彩色化）。甘草乾姜湯=エキス製剤の実売なし
//   - unknown: 全体グレー＋「?」（未取得表示）
// 実行: node scripts/make-kusuri-variants.mjs → public/assets/items/kusuri/ に出力

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const SRC = 'public/assets/items/kusuri_icon.png'
const OUT_DIR = 'public/assets/items/kusuri'

// 一の位カラー（ツムラ公式資料の近似HEX。色見本Artifact 2026-07-19版と同値）
const VARIANTS = [
  { id: 'kakkonto', mode: 'tsumura', color: '#14A3C7', lines: '' }, // TJ-1 葛根湯 水色
  { id: 'maoto', mode: 'tsumura', color: '#A97B35', lines: 'hh' }, // TJ-27 麻黄湯 茶
  { id: 'ninjinto', mode: 'tsumura', color: '#147A50', lines: 'hhh' }, // TJ-32 人参湯 緑
  { id: 'keishito', mode: 'tsumura', color: '#F4A21A', lines: 'hhhh' }, // TJ-45 桂枝湯 オレンジ
  { id: 'keishikashakuyakuto', mode: 'tsumura', color: '#21327E', lines: 'Th' }, // TJ-60 濃紺
  { id: 'shakuyakukanzoto', mode: 'tsumura', color: '#C51F41', lines: 'Th' }, // TJ-68 赤
  { id: 'kanbakutaisouto', mode: 'tsumura', color: '#147A50', lines: 'Thh' }, // TJ-72 緑
  { id: 'keishininjinto', mode: 'tsumura', color: '#147A50', lines: 'Thhh' }, // TJ-82 緑
  { id: 'kanzoto', mode: 'other', number: '401' }, // クラシエ KB/EK-401 白基調
  { id: 'keishikakakkonto', mode: 'other', number: '27' }, // 東洋 TY-027 白基調
  { id: 'kanzokankyoto', mode: 'classic' }, // 甘草乾姜湯 無地・古典
  { id: 'unknown', mode: 'unknown' }, // 未取得
]

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToRgb(h, s, l) {
  h /= 360
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255))
}

// 緑アクセント画素の判定（彩度があり、色相が緑域）
const isAccent = (h, s) => s > 0.12 && h >= 60 && h <= 180

function recolor(data, mode, targetHex) {
  const target = targetHex ? rgbToHsl(...hexToRgb(targetHex)) : null
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (mode === 'unknown') {
      // 全体を無彩色化（形は残す）
      const v = Math.round(l * 255)
      data[i] = v; data[i + 1] = v; data[i + 2] = v
      continue
    }
    if (!isAccent(h, s)) continue
    if (mode === 'tsumura') {
      // 色相・彩度を処方色に、明暗（模様の陰影）は元画素を維持
      const [r, g, b] = hslToRgb(target[0], target[1], l)
      data[i] = r; data[i + 1] = g; data[i + 2] = b
    } else {
      // other/classic: 白基調＝アクセントを無彩色化
      const [r, g, b] = hslToRgb(40, 0.08, l)
      data[i] = r; data[i + 1] = g; data[i + 2] = b
    }
  }
  return data
}

// ライン（上部の帯ブロックに積む。太=50番/細=10番・全て処方色）と番号のSVGオーバーレイ
function overlaySvg(W, H, v) {
  const parts = []
  if (v.mode === 'tsumura' && v.lines) {
    const x = Math.round(W * 0.14)
    const w = Math.round(W * 0.72)
    const thin = Math.max(3, Math.round(H * 0.013))
    const thick = thin * 3
    const gap = thin
    let y = Math.round(H * 0.155)
    for (const t of v.lines) {
      const h = t === 'T' ? thick : thin
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${v.color}"/>`)
      y += h + gap
    }
  }
  if (v.mode === 'other') {
    // 角囲み番号（丸囲み=ツムラとの区別）。中央の紋章の上に重ねる
    const bw = Math.round(W * 0.6)
    const bh = Math.round(H * 0.17)
    const bx = Math.round((W - bw) / 2)
    const by = Math.round(H * 0.36)
    const fs = v.number.length >= 3 ? Math.round(bw * 0.42) : Math.round(bw * 0.55)
    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#fffdf5" stroke="#8a7a5c" stroke-width="3"/>`)
    parts.push(`<text x="${W / 2}" y="${by + bh / 2}" font-size="${fs}" fill="#221a10" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="bold">${v.number}</text>`)
  }
  if (v.mode === 'unknown') {
    parts.push(`<text x="${W / 2}" y="${H * 0.45}" font-size="${Math.round(W * 0.5)}" fill="#5a5a5a" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="bold">?</text>`)
  }
  if (parts.length === 0) return null
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`)
}

mkdirSync(OUT_DIR, { recursive: true })
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info

for (const v of VARIANTS) {
  const px = recolor(Buffer.from(data), v.mode, v.color)
  let img = sharp(px, { raw: { width: W, height: H, channels: 4 } })
  const svg = overlaySvg(W, H, v)
  if (svg) img = img.composite([{ input: svg }])
  await img.png().toFile(`${OUT_DIR}/kusuri_${v.id}.png`)
  console.log(`kusuri_${v.id}.png`)
}

// 確認用コンタクトシート（12本横並び・各96px幅）
const thumb = 96
const sheets = []
for (let i = 0; i < VARIANTS.length; i++) {
  const buf = await sharp(`${OUT_DIR}/kusuri_${VARIANTS[i].id}.png`).resize({ width: thumb }).toBuffer()
  sheets.push({ input: buf, left: i * (thumb + 8) + 8, top: 8 })
}
const sheetH = Math.round((thumb / W) * H) + 16
await sharp({ create: { width: VARIANTS.length * (thumb + 8) + 8, height: sheetH, channels: 4, background: '#16110c' } })
  .composite(sheets).png().toFile(`${OUT_DIR}/_contact_sheet.png`)
console.log('_contact_sheet.png')
