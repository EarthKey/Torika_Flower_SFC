// NPC待機モーションシート（C_Sakuya3.webp / C_Izuna3.webp）からアニメ用フレームを切り出すスクリプト。
// 使い方: node scripts/extract-idle.mjs
//
// 第4版シート（2026-07-17）: 4列×3行=12コマすべてが「1つの待機モーション」の連続フレーム。
// 読み順（上段1〜4→中段5〜8→下段9〜12）どおりに idle_1..12 として書き出す。
// ※旧3モーション版から切り出した greet/kiai/think のPNGは会話リアクション用に残す（上書きしない）。
//
// ── コマの切り分け方式（2026-07-25全面変更） ──────────────────
// 旧方式は「シートを幅/4・高さ/3の等分セルに割って各セルを1コマとみなす」前提だった。
// これは**AI生成シートでは成立しない**。実測（本人報告の不具合2件の原因調査）:
//   柴  … 4列目のキャラがx1050から始まるのにセル4の左端はx1086。左36px＝左腕がセル外に出ており、
//          4・8・12コマ目だけ腕が丸ごと落ちて「左腕が出たり消えたり」する
//   結  … 3行目のキャラがy706から始まるのにセル3の上端はy724。上18px＝頭がセル外に出ており、
//          9〜12コマ目で頭が見切れる（さらに旧'foot'方式のクランプで体が16px浮いていた）
// 現方式は等分セルを使わず、**シート全面の背景を抜いてから連結成分で12体を検出し、各体の
// 外接矩形をそのままコマにする**。キャラがどこにどれだけ寄っていても欠けない。境界をまたいで
// 隣のコマに写り込んでいた画素も、成分ラベルで自分の体だけを拾うので混入しない。
// 検出数が12でなければ（体が分断された/ゴミが残った）その場でエラーにして黙って壊さない。
//
// 既知の副作用（2026-07-20発見）: clearEnclosedPocketsBelow()は「頭部ガード帯に掛からない
// 背景色の塊」を消す設計のため、手甲の鋲・目のハイライトなど「背景色に近いキャラの一部」も
// 誤って透明化することがある（extract-faces.mjsと同じ問題。アウンの待機モーション全12コマで
// 手甲の鋲が消えていたのを本人指摘で発見）。再実行後は必ず
// `node scripts/fix-enclosed-holes.mjs public/assets/chara/<prefix>_idle_*.png` を通して、
// 外周とつながっていない孤立した透明ピクセル（＝穴）を塗り戻すこと。

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'D:/AIillust/CriptNinja/2026/Game/TorkaFlower/V2'
const OUT = new URL('../public/assets/chara', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// 位置合わせ方式（2026-07-25追加）:
//   'foot' = 各コマの足元(maxY)を基準に縦を揃え、横はバウンディングボックス中心に置く（従来方式）
//   'core' = 頭〜胴の重心を基準に縦横とも揃える
// 従来の'foot'は「シルエット全体の外接矩形」に依存するため、尻尾・袖・髪など**体の外に大きく振れる
// パーツがあるキャラで破綻する**。振れたぶんだけ外接矩形が広がり、中心合わせの結果として
// 胴体が逆方向へ押し出されて、キャラ全体がガクガク横滑りして見える
// （2026-07-25本人報告「柴の動きがカクカク・弁天も動きが激しい」。実測で柴は重心Xが28.8px、
// 弁天は重心X 8.7px/Y 9.6px も振れていた）。
// 'core'は外接矩形ではなく「上から45%＝頭と胴」の重心を錨にするため、尻尾や袖が動いても
// 体幹の位置は固定される。尻尾の揺れ・耳のぴくつきといった**中身のアニメーションはそのまま残る**
const ALIGN_MODE = {
  shiba: 'core',
  benten: 'core',
}
const CORE_RATIO = 0.45 // 錨に使う範囲（キャラ上端から高さの何割までを「頭〜胴」とみなすか）

const SHEETS = [
  // 切り出し済みキャラは再実行時に有効化する。
  // ※イズナは白い衣が背景色に近く、ポケット除去の誤爆リスクがあるため強化版で再処理しないこと
  // { src: 'C_Sakuya3.webp', prefix: 'sakuya' },
  // { src: 'C_Izuna3.webp', prefix: 'izuna' },
  // { src: 'C_Xiaoran (3).webp', prefix: 'xiaolan' },
  // { src: 'C_Nemu (3).webp', prefix: 'nemu' },
  // { src: 'C_Janome (3).webp', prefix: 'janome' }, // 蛇ノ目（ジャノメ）
  // { src: 'C_Aum (3).webp', prefix: 'aum' }, // アウン
  // { src: 'C_Ibuki (3).webp', prefix: 'ibuki' }, // イブキ
  { src: 'C_Shiba_idle.webp', prefix: 'shiba' }, // 柴（2026-07-25 成分検出方式で再切り出し・左腕の欠けを修正）
  // { src: 'C_Nekomata_idle.webp', prefix: 'nekomata' }, // 猫又
  // { src: 'C_Benten_idle.webp', prefix: 'benten' }, // 弁天（2026-07-25 'core'方式で切り出し済み）
  // { src: 'C_Anne3.webp', prefix: 'anne' }, // 餡音（旧命名規則の"3"=待機モーション。C_Sakuya3.webp等と同じ並び）
  { src: 'C_Yui_Idle.webp', prefix: 'yui' }, // 結（2026-07-25 成分検出方式で再切り出し・頭の見切れを修正）
  // { src: 'C_Hayate_idle.webp', prefix: 'hayate' }, // ハヤテ
]

const COLS = 4
const ROWS = 3
const PAD = 2

// 特定コマの差し替え（1始まりのコマ番号 → 差し替え元コマ番号）。
// アウンの元シートは12コマ中9コマが「腕を下ろした自然体」の微差（3コマ×3セット）で、
// 残り4・8・12コマ目だけが「両拳を胸元に引き寄せる」全く別ポーズになっていた
// （本人が元シート画像を確認して指摘・2026-07-20）。AIが12コマを独立生成したことで
// 起きた表記ゆれで、意図した呼吸アニメではないため、そのままループさせると
// 117ms×1コマだけ別ポーズに「スナップ」して戻る＝腕が一瞬消えたように見える不具合になる。
// 差分行列で実測（3-4間diff=810万 vs 通常コマ間diff=120〜150万・約6倍）した上で、
// 該当3コマを直前の安定コマで置き換えることでスナップを解消する
const FRAME_OVERRIDE = {
  aum: { 4: 3, 8: 7, 12: 11 },
}

// 背景色の推定は「外周4隅の平均」だと、たまたま四隅の1つにキャラの足や影が
// かかっているコマ（アウンの待機モーションで発生・2026-07-20発見）で平均が大きく
// 歪み、背景除去がほぼ効かなくなる（白背景が丸ごと残る）事故につながる。
// 外周全ピクセルの中央値（median）を使えば、外周の一部にキャラがかかっていても
// 大多数を占める本来の背景色が中央値として残るため頑健になる。
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

// シート全面から「12体ぶんの連結成分」を読み順（上段左→右、上段→下段）に取り出す。
// 等分セルを使わないため、キャラがセル境界をまたいでいても欠けない（2026-07-25新設）
function findCharacterBlobs(data, width, height, expected) {
  const label = new Int32Array(width * height).fill(-1)
  const blobs = []
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] === 0) continue
    const id = blobs.length
    let n = 0, minX = width, maxX = -1, minY = height, maxY = -1
    const stack = [start]
    label[start] = id
    while (stack.length > 0) {
      const p = stack.pop()
      n++
      const x = p % width, y = (p / width) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
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
    blobs.push({ id, n, minX, maxX, minY, maxY })
  }

  // 体の1/5未満の成分はゴミ（背景の残り・分離した小片）として捨てる
  const maxN = Math.max(...blobs.map((b) => b.n))
  const kept = blobs.filter((b) => b.n > maxN / 5)
  if (kept.length !== expected) {
    const report = kept.map((b) => `px=${b.n} x${b.minX}-${b.maxX} y${b.minY}-${b.maxY}`).join('\n  ')
    throw new Error(
      `検出したキャラが${kept.length}体で、期待する${expected}体と違います。` +
        `体が分断された、またはゴミが残っています:\n  ${report}`,
    )
  }

  // 読み順に並べる: 縦位置で行ごとにまとめ、行内は横位置でソート
  kept.sort((a, b) => (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2)
  const ordered = []
  for (let r = 0; r < ROWS; r++) {
    const row = kept.slice(r * COLS, (r + 1) * COLS)
    row.sort((a, b) => (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2)
    ordered.push(...row)
  }
  return { ordered, label }
}

mkdirSync(OUT, { recursive: true })

for (const sheet of SHEETS) {
  const srcPath = join(SRC_DIR, sheet.src)
  const { data: sheetData, info: sheetInfo } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const SW = sheetInfo.width, SH = sheetInfo.height
  console.log(`${sheet.src}: ${SW}x${SH}`)

  // 背景抜きはシート全面で一度だけ行う（外周からの塗りつぶしなので、
  // セル単位でやるより背景色の推定も安定する）
  const bg = removeBackground(sheetData, SW, SH)
  shaveBackgroundFringe(sheetData, SW, SH, bg)
  const { ordered, label } = findCharacterBlobs(sheetData, SW, SH, COLS * ROWS)

  // 各体を「自分の成分ラベルの画素だけ」を写した個別バッファに切り出す。
  // 隣のコマから写り込んだ画素はラベルが違うので自然に落ちる（旧方式のkeepLargestComponent相当）
  const cells = []
  ordered.forEach((blob, i) => {
    const w = blob.maxX - blob.minX + 1
    const h = blob.maxY - blob.minY + 1
    const buf = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sp = (y + blob.minY) * SW + (x + blob.minX)
        if (label[sp] !== blob.id) continue
        buf.set(sheetData.subarray(sp * 4, sp * 4 + 4), (y * w + x) * 4)
      }
    }
    const info = { width: w, height: h }
    clearEnclosedPocketsBelow(buf, w, h, bg)
    erodeEdge(buf, w, h)
    const b = contentBounds(buf, w, h)
    if (!b) throw new Error(`empty frame: ${sheet.src} #${i + 1}`)
    console.log(`  frame${i + 1}: ${w}x${h} at (${blob.minX},${blob.minY}) px=${blob.n}`)
    cells.push({ data: buf, info, b })
  })

  const override = FRAME_OVERRIDE[sheet.prefix] ?? {}
  const order = cells.map((_, i) => (override[i + 1] ?? i + 1) - 1)

  // ── 位置合わせ（2026-07-25に'core'/'foot'共通化） ──────────
  // モードの違いは「錨（アンカー）をどこに取るか」だけ。錨を重ねて和集合のキャンバスへ
  // 切り出す手順は共通にした。旧'foot'方式はセル内で切り出し位置をクランプしていたため、
  // キャラがセル上端に寄ったコマだけ足元が揃わず体が浮いた（結の9〜12コマ目が16px浮いていた）。
  // 透明余白を足してから切るこの方式ならクランプが不要で、どのコマも錨がぴったり重なる
  const mode = ALIGN_MODE[sheet.prefix] ?? 'foot'
  const anchors = order.map((idx) => {
    const { data, info, b } = cells[idx]
    if (mode === 'core') {
      // 'core': キャラ上端からCORE_RATIO分の帯（頭〜胴）の重心。
      // 尻尾・袖・裾など体の外で大きく振れるパーツはこの帯に入らないので錨が振り回されない
      const coreBottom = b.minY + Math.round((b.maxY - b.minY) * CORE_RATIO)
      let sx = 0, sy = 0, n = 0
      for (let y = b.minY; y <= coreBottom; y++) {
        for (let x = b.minX; x <= b.maxX; x++) {
          if (data[(y * info.width + x) * 4 + 3] > 0) { sx += x; sy += y; n++ }
        }
      }
      return { x: sx / n, y: sy / n }
    }
    // 'foot': 縦は足元(maxY)、横は外接矩形の中心。呼吸の上下動だけを消して接地を固定する
    return { x: (b.minX + b.maxX) / 2, y: b.maxY }
  })

  // 1コマ目を基準に、各コマの錨のズレ量（この分だけ切り出し位置をずらせば錨が重なる）
  const offs = anchors.map((a) => ({ dx: Math.round(a.x - anchors[0].x), dy: Math.round(a.y - anchors[0].y) }))

  // キャンバスは「ズレ補正後の外接矩形の和集合」。尻尾が大きく振れてもはみ出して欠けない
  let uMinX = Infinity, uMaxX = -Infinity, uMinY = Infinity, uMaxY = -Infinity
  order.forEach((idx, i) => {
    const b = cells[idx].b
    uMinX = Math.min(uMinX, b.minX - offs[i].dx)
    uMaxX = Math.max(uMaxX, b.maxX - offs[i].dx)
    uMinY = Math.min(uMinY, b.minY - offs[i].dy)
    uMaxY = Math.max(uMaxY, b.maxY - offs[i].dy)
  })
  const rawW = uMaxX - uMinX + 1 + PAD * 2
  const canvasH = uMaxY - uMinY + 1 + PAD * 2

  // キャンバス幅は「尻尾が振れる範囲」まで含んだ和集合なので、そのままだと体幹が中央からずれる
  // （柴は尻尾が右に振れるぶんキャンバスが右へ伸び、体が左に12px寄っていた）。
  // ゲーム側はスプライトを中心原点でマスに置くため、そのぶんNPCがマスからずれて見える。
  // 体幹が必ずキャンバスの左右中央に来るよう、足りない側へ余白を足して対称にする
  const anchorOut = Math.round(anchors[0].x) - uMinX + PAD // 1コマ目の錨がキャンバス内で来る位置
  const canvasW = Math.max(anchorOut, rawW - anchorOut) * 2
  const padLeft = Math.round(canvasW / 2 - anchorOut)

  // 切り出し枠は元画像の外へはみ出すことがある（キャラの外接矩形ぴったりで切っているため、
  // 錨をずらすと必ずはみ出る）。四方に透明の余白を足してから切ることで、はみ出しても欠けない
  const M = 200
  for (let i = 0; i < order.length; i++) {
    const { data, info } = cells[order[i]]
    const pw = info.width + M * 2
    const ph = info.height + M * 2
    const padded = new Uint8Array(pw * ph * 4) // 全画素 alpha=0 の透明で初期化
    for (let y = 0; y < info.height; y++) {
      const src = y * info.width * 4
      const dst = ((y + M) * pw + M) * 4
      padded.set(data.subarray(src, src + info.width * 4), dst)
    }
    const left = uMinX + M - PAD + offs[i].dx - padLeft
    const top = uMinY + M - PAD + offs[i].dy
    const outName = `${sheet.prefix}_idle_${i + 1}.png`
    await sharp(Buffer.from(padded), { raw: { width: pw, height: ph, channels: 4 } })
      .extract({ left, top, width: canvasW, height: canvasH })
      .png()
      .toFile(join(OUT, outName))
    console.log(`OK: ${outName} (${canvasW}x${canvasH}) ${mode}-aligned dx=${offs[i].dx} dy=${offs[i].dy}`)
  }
}

console.log('done')
