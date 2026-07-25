// 会話ウインドウ用の顔グラ（バストアップ）切り出しスクリプト。
// 使い方: node scripts/extract-faces.mjs
// 表情シート（C_Torika2 / C_Izuna2 / C_Sakuya2、3×3の9表情）から読み順に
// {prefix}_face_1..9.png を書き出す。方式は extract-idle.mjs と同じ:
// 背景除去（角の色からBFS）→最大連結成分のみ→輪郭1px削り→9コマunionで位置合わせ。
//
// ── 表情番号の意味（2026-07-25に新仕様へ統一・本人決定） ──────────────────
// 1=通常 2=微笑み 3=真剣（解説モード） 4=驚き 5=困り 6=苦笑 7=白目 8=青ざめ 9=ぐるぐる目
//
// シートの並びは生成時期で2系統ある。**プロンプト正本の【表情9種】の並びが実体**:
//   新仕様（3=真剣・4=驚き・5=困り）… イズナ/蛇ノ目/イブキ/柴/猫又/弁天/餡音/結/ハヤテ（9体）
//   旧仕様（3=驚き・4=困り・5=怒り/むっ）… トリカ/咲耶/シャオラン/ネム/アウン（5体）
// 旧仕様の5体は、生成済みPNGを 3←旧5 / 4←旧3 / 5←旧4 に並び替えて新仕様へ合わせた（絵は不変）。
// **旧仕様のシートを再切り出しするときはFACE_ORDERの並び替えを必ず通すこと**（下記）。
// なお「怒り/むっ」は新仕様に枠が無いので、旧仕様の5番の絵は3番（真剣）として扱っている
//
// 既知の副作用（2026-07-19発見・fix-enclosed-holes.mjsで事後修正済み）: clearEnclosedPockets()は
// 「顔中央のガード枠に掛からない背景色の塊」を全部消す設計のため、耳の内側の毛柄・髪飾り・ヘッドバンドの
// 金具など「ガード枠の外にある、背景色に近いキャラの一部」も誤って透明化することがある。
// 再実行後は必ず `node scripts/fix-enclosed-holes.mjs public/assets/chara/<prefix>_face_*.png` を
// 通して、外周とつながっていない孤立した透明ピクセル（＝穴）を塗り戻すこと。

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2'
const OUT = new URL('../public/assets/chara', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const SHEETS = [
  // トリカ・イズナ・咲耶・シャオラン・ネムは切り出し済み。再実行時は下の5行を有効化する
  // { src: 'C_Torika2.webp', prefix: 'torika' },
  // { src: 'C_Izuna2.webp', prefix: 'izuna' },
  // { src: 'C_Sakuya2.webp', prefix: 'sakuya' },
  // { src: 'C_Xiaoran (2).webp', prefix: 'xiaolan' },
  // { src: 'C_Nemu (2).webp', prefix: 'nemu' },
  // { src: 'C_Janome (2).webp', prefix: 'janome' }, // 蛇ノ目（ジャノメ）
  // { src: 'C_Aum (2).webp', prefix: 'aum' }, // アウン
  // { src: 'C_Ibuki (2).webp', prefix: 'ibuki' }, // イブキ
  // 柴。2026-07-25にC_Shiba_face.webp（アンスロ版・9表情そろい）へ差し替え。
  // 旧 'C_Shiba_face (2).webp' は人間顔＋耳のデザインで辞書のno_humans設計と食い違うため使わない
  // （待機モーションから作った単一表情プレースホルダーを9枚コピーしていた状態を解消）
  { src: 'C_Shiba_face.webp', prefix: 'shiba' },
  // 猫又。2026-07-25にC_Nekomata_face.webp（アンスロ版・9表情そろい）へ差し替え。
  // 旧 'C_Nekomata_face (2).webp' は人間顔＋耳のデザインで辞書のno_humans設計と食い違うため使わない。
  // ※片目に傷跡があり常時閉じているデザインのため、1↔3・2↔6の表情差はかなり小さい（元絵の性質・本人確認済み）
  { src: 'C_Nekomata_face.webp', prefix: 'nekomata' },
  // { src: 'C_Benten_face.webp', prefix: 'benten' }, // 弁天
  { src: 'C_Anne_face (2).webp', prefix: 'anne' }, // 餡音
  { src: 'C_Yui_Face.webp', prefix: 'yui' }, // 結
  { src: 'C_Hayate_face.webp', prefix: 'hayate' }, // ハヤテ
]

// 旧仕様シートの並び替え（2026-07-25）。出力の表情番号 → シート上のコマ番号。
// 旧仕様は 3=驚き / 4=困り / 5=怒り・真剣 の並びなので、新仕様（3=真剣 / 4=驚き / 5=困り）へ
// 揃えるには 3←5・4←3・5←4 と読み替える。ここに載っていないシートは新仕様なのでそのまま
const FACE_ORDER = {
  torika: [1, 2, 5, 3, 4, 6, 7, 8, 9],
  sakuya: [1, 2, 5, 3, 4, 6, 7, 8, 9],
  xiaolan: [1, 2, 5, 3, 4, 6, 7, 8, 9],
  nemu: [1, 2, 5, 3, 4, 6, 7, 8, 9],
  aum: [1, 2, 5, 3, 4, 6, 7, 8, 9],
}

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

// 背景色の推定は「外周4隅の平均」だと、たまたま四隅の1つにキャラの髪や小物が
// かかっているコマで平均が大きく歪み、背景除去がほぼ効かなくなる事故につながる
// （アウンの待機モーションで発生・2026-07-20発見・extract-idle.mjsと同じ対策）。
// 外周全ピクセルの中央値（median）を使えば頑健になる。
function estimateBgMedian(data, width, height) {
  const rs = [], gs = [], bs = []
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const i = (y * width + x) * 4
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2])
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const i = (y * width + x) * 4
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2])
    }
  }
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  return [median(rs), median(gs), median(bs)]
}

function removeBackground(data, width, height, tolerance = 34) {
  const bg = estimateBgMedian(data, width, height)
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

  // 旧仕様シートは並び替えて出力する（FACE_ORDER[出力番号-1] = シート上のコマ番号）
  const order = FACE_ORDER[sheet.prefix] ?? cells.map((_, i) => i + 1)

  for (let i = 0; i < cells.length; i++) {
    const { data, info, b } = cells[order[i] - 1]
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

// ── 追加表情（10番＝人間形態）の単発切り出し（2026-07-26本人指示） ──────────────────
// 柴・猫又は辞書のno_humans設計に合わせてアンスロ（獣顔）版を本採用しているが、
// 人間顔で生成された旧シートも「人間の姿にもなれる」設定の見せ場として使いたい、という指示。
// そこで旧シートから1コマだけを切り出し、10番の追加表情として書き出す。
// 通常の1〜9番とは別シート由来なので、顔の大きさが揃うよう出力枠を1〜9番と同じサイズに合わせる
// （会話ウインドウは顔グラを高さ200pxで表示するため、枠が違うと切り替わりで顔だけ拡縮して見える）。
const EXTRA_FACES = [
  { src: 'C_Shiba_face (2).webp', prefix: 'shiba', cell: 2, out: 10 }, // 柴の人間形態（目を細めた笑顔）
  { src: 'C_Nekomata_face (2).webp', prefix: 'nekomata', cell: 2, out: 10 }, // 猫又の人間形態（同）
]

for (const extra of EXTRA_FACES) {
  const srcPath = join(SRC_DIR, extra.src)
  const meta = await sharp(srcPath).metadata()
  const cellW = Math.floor(meta.width / COLS)
  const cellH = Math.floor(meta.height / ROWS)
  const r = Math.floor((extra.cell - 1) / COLS)
  const c = (extra.cell - 1) % COLS

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
  if (!b) throw new Error(`empty cell: ${extra.src} cell=${extra.cell}`)

  // 1番の出力から枠サイズを借りる（1〜9番と同じ寸法に収める）
  const refPath = join(OUT, `${extra.prefix}_face_1.png`)
  const ref = await sharp(refPath).metadata()
  const contentW = b.maxX - b.minX + 1
  const contentH = b.maxY - b.minY + 1
  const scale = Math.min(ref.width / contentW, ref.height / contentH)
  const drawW = Math.round(contentW * scale)
  const drawH = Math.round(contentH * scale)
  const face = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: b.minX, top: b.minY, width: contentW, height: contentH })
    .resize(drawW, drawH, { kernel: 'nearest' }) // ドット絵なのでnearestで拡縮する
    .png()
    .toBuffer()
  const outName = `${extra.prefix}_face_${extra.out}.png`
  await sharp({
    create: { width: ref.width, height: ref.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: face, left: Math.round((ref.width - drawW) / 2), top: ref.height - drawH }])
    .png()
    .toFile(join(OUT, outName))
  console.log(`OK(extra): ${outName} (${ref.width}x${ref.height}) from ${extra.src} cell${extra.cell}`)
}

console.log('done')
