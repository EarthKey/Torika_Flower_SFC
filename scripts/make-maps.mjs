// 仮タイルセットPNGと、Tiled形式のマップJSONを生成するスクリプト。
// 使い方: node scripts/make-maps.mjs
//
// タイルの絵柄はまだ仮（単色＋控えめな斑点テクスチャ）。本物のマップチップが
// できたら public/assets/tileset.png を同じ並び順で差し替えるだけでよい。
// 出力するJSONはTiled標準形式なので、後からTiled GUIで開いて編集もできる。

import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── タイル定義（並び順がそのままタイルID。ゲーム側のBLOCKED判定と対応）──
const TILE = 32
const TILES = [
  { ch: 'G', name: 'grass', color: [0x3f, 0x6b, 0x3a], walk: true },
  { ch: 'P', name: 'path', color: [0x8a, 0x6a, 0x42], walk: true },
  { ch: 'D', name: 'soil', color: [0x5a, 0x3d, 0x20], walk: true },
  { ch: 'W', name: 'water', color: [0x2b, 0x5f, 0x7e], walk: false },
  { ch: 'T', name: 'tree', color: [0x24, 0x40, 0x1f], walk: false },
  { ch: 'F', name: 'floor', color: [0x6b, 0x4b, 0x2f], walk: true },
  { ch: 'L', name: 'wall', color: [0x3d, 0x2f, 0x22], walk: false },
  { ch: 'H', name: 'shelf', color: [0x6a, 0x5a, 0x3a], walk: true },
]

// ── マップ定義（ASCIIアート。1文字=1タイル、20×14）──────────────

const MAPS = {
  home: [
    'TTTTTTTTTTTTTTTTTTTT',
    'TGGGGGGGGGGGGGGGGGGT',
    'TGGGGGGGGGGGGGGGGGGT',
    'TGGGGGGGGGGGGGGGGGGT',
    'TGGGGGDGGGDGGGDGGGGT', // 畑3区画（col 6/10/14）
    'TGGGGGPGGGPGGGPGGGGT',
    'TGGGGGPPPPPPPPPGGGGT',
    'PPPPPPPPPPPPPPPPPPPP', // 横断路。左端=種の聖域、右端=工房への出口
    'TGGGGGGGGPPGGGGGGGGT',
    'TGGGGGGGGPPGGGGGGGGT',
    'TGGGGGGGGPPGGGGGGGGT',
    'TGGGGGGGGPPGGGGGGGGT',
    'TGGGGGGGGPPGGGGGGGGT',
    'TTTTTTTTTTTTTTTTTTTT',
  ],
  seedfield: [
    'TTTTTTTTTTTTTTTTTTTT',
    'TGGGGGGGGGGGGGGGGGGT',
    'TGWWGGGGGGGGGGGWWGGT', // 小川（装飾・通行不可）
    'TGGGGGGGGGGGGGGGGGGT',
    'TGGGGGGGGGGGGGGGGGGT',
    'TGGGGGGGGGGGGGGGGGGT',
    'TGGGPGGGGGPGGGGGPGGT', // 採取スポット前の立ち位置（col 4/10/16）
    'TGGGGGGGPPPPGGGGGGGT',
    'TGGGGGGGPPPPGGGGGGGT', // 中央広場
    'TGGGGGGGGPPGGGGGGGGT',
    'TGGGGGGGGPPGGGGGGGGT',
    'TGGGGGGGGPPGGGGGGGGT',
    'TGGGGGGGGPPGGGGGGGGT',
    'TTTTTTTTTTPTTTTTTTTT', // 下端中央=自宅への出口
  ],
  workshop: [
    'LLLLLLLLLLLLLLLLLLLL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFHFFL', // 右中央=完成薬置き場（col 15、置物の木皿）
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LFFFFFFFFFFFFFFFFFFL',
    'LLLLLLLLLLFLLLLLLLLL', // 下端中央=自宅への出口
  ],
}

// ── 仮タイルセットPNGの生成 ──────────────────────────────

function makeTilesetBuffer() {
  const w = TILE * TILES.length
  const h = TILE
  const data = Buffer.alloc(w * h * 4)
  TILES.forEach((tile, t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const gx = t * TILE + x
        const i = (y * w + gx) * 4
        let [r, g, b] = tile.color
        // 控えめな斑点テクスチャ（決定的パターン）で単色ののっぺり感を減らす
        if ((x * 7 + y * 13) % 29 === 0) {
          r = Math.max(0, r - 14); g = Math.max(0, g - 14); b = Math.max(0, b - 14)
        }
        // タイル境界がうっすら分かる程度の縁
        if (x === 0 || y === 0) {
          r = Math.max(0, r - 8); g = Math.max(0, g - 8); b = Math.max(0, b - 8)
        }
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
      }
    }
  })
  return { data, w, h }
}

// ── Tiled形式JSONの生成 ─────────────────────────────────

function toTiledJson(rows) {
  const height = rows.length
  const width = rows[0].length
  const charToId = Object.fromEntries(TILES.map((t, i) => [t.ch, i + 1])) // Tiledのgidは1始まり
  const data = []
  for (const row of rows) {
    if (row.length !== width) throw new Error(`row length mismatch: ${row}`)
    for (const ch of row) {
      const gid = charToId[ch]
      if (!gid) throw new Error(`unknown tile char: ${ch}`)
      data.push(gid)
    }
  }
  return {
    type: 'map',
    version: '1.10',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width,
    height,
    tilewidth: TILE,
    tileheight: TILE,
    infinite: false,
    nextlayerid: 2,
    nextobjectid: 1,
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width, height, opacity: 1, visible: true, x: 0, y: 0, data },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'tiles',
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: TILES.length,
        columns: TILES.length,
        image: '../assets/tileset.png',
        imagewidth: TILE * TILES.length,
        imageheight: TILE,
        margin: 0,
        spacing: 0,
      },
    ],
  }
}

// ── 実行 ────────────────────────────────────────────────

const { data, w, h } = makeTilesetBuffer()
mkdirSync(join(ROOT, 'public/assets'), { recursive: true })
await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(ROOT, 'public/assets/tileset.png'))
console.log(`OK: assets/tileset.png (${w}x${h}, ${TILES.length} tiles)`)

mkdirSync(join(ROOT, 'public/maps'), { recursive: true })
for (const [name, rows] of Object.entries(MAPS)) {
  const json = toTiledJson(rows)
  writeFileSync(join(ROOT, `public/maps/${name}.json`), JSON.stringify(json))
  console.log(`OK: maps/${name}.json (${json.width}x${json.height})`)
}

// ゲーム側が通行判定に使う「歩けないタイルID」一覧を出力しておく（確認用）
const blocked = TILES.map((t, i) => (!t.walk ? i : null)).filter((v) => v !== null)
console.log('blocked tile ids (0-based):', blocked.join(', '))
console.log('done')
