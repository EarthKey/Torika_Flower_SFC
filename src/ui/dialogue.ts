// 会話ウインドウ（仕様書§9-2 最優先項目）。HUDと同じくCanvasの上にHTML/CSSで重ねる。
// SFC風: 画面下部にウインドウ、左に顔グラ（バストアップ9表情）、名前欄、本文、▼送りマーク。
// 配色はトリカの色に寄せたワインレッド＋軽い背景透過（2026-07-17決定）。
// 通常会話はNPC一方向。掛け合い形式は依頼イベント実装時に speaker 切り替えで対応できる構造にしてある。

export interface DialogueLine {
  speaker: string // 'izuna' | 'sakuya' | 'torika' — 顔グラのファイル接頭辞
  name: string // 表示名。漢字名のキャラは「漢字（読み）」形式（例: 酉花（トリカ）／咲耶（サクヤ）。2026-07-19ルール）
  // 表情番号1〜9。2026-07-25に**新仕様へ統一**した（秋冬キャラのシート生成プロンプトで使っていた並び）:
  //   1=通常 2=微笑み 3=真剣（解説モード） 4=驚き 5=困り 6=苦笑 7=白目 8=青ざめ 9=ぐるぐる目
  // 旧仕様（3=驚き 4=困り 5=怒り/むっ 6=照れ笑い）で生成されたトリカ・咲耶・シャオラン・ネム・アウンの
  // 5体は、PNGファイル自体を 3←旧5 / 4←旧3 / 5←旧4 に並び替えて新仕様へ合わせた（絵は不変）。
  // **怒り/むっの表情は新仕様に枠が無い**ため、該当セリフは苦笑(6)か真剣(3)で表現する
  face: number
  text: string // 「**」で囲んだ部分はemScale倍で拡大表示される（花占いの花名・運勢結果など）
  emScale?: number // **囲み部分の文字拡大率（省略時2倍）。花占いの結果は3倍で使う
  color?: string // 本文の文字色（省略時は通常の#fff2f0）。フィナーレの作者メッセージを金色にする用（2026-08-01〜）
  onShow?: () => void // この行が表示された瞬間に呼ばれる（チュートリアルの案内矢印などの演出フック）
}

// 「**」区切りの強調セグメント。奇数番目（**の内側）が拡大対象
interface TextSegment {
  text: string
  em: boolean
}

function parseSegments(text: string): TextSegment[] {
  return text
    .split('**')
    .map((t, i) => ({ text: t, em: i % 2 === 1 }))
    .filter((s) => s.text.length > 0)
}

function plainLength(segments: TextSegment[]): number {
  return segments.reduce((n, s) => n + s.text.length, 0)
}

// 先頭からupTo文字ぶんだけをスパン構成で描画する（タイプライターと全文表示の共通処理）
function renderSegments(el: HTMLElement, segments: TextSegment[], upTo: number, emScale: number) {
  el.textContent = ''
  let remaining = upTo
  for (const seg of segments) {
    if (remaining <= 0) break
    const take = seg.text.slice(0, remaining)
    remaining -= take.length
    if (seg.em) {
      const span = document.createElement('span')
      span.textContent = take
      span.style.fontSize = `${26 * emScale}px`
      span.style.lineHeight = '1.2'
      el.appendChild(span)
    } else {
      el.appendChild(document.createTextNode(take))
    }
  }
}

let windowEl: HTMLDivElement | null = null
let portraitEl: HTMLImageElement | null = null
let nameEl: HTMLDivElement | null = null
let textEl: HTMLDivElement | null = null
let cursorEl: HTMLDivElement | null = null

let lines: DialogueLine[] = []
let lineIndex = 0
let onEndCallback: (() => void) | undefined

import { typeMsPerChar } from '../state/options'

// タイプライター演出の状態。表示途中に送り操作をすると全文表示に切り替わる。
// 1文字あたりの速度はオプション（文字送りの速さ）に従う
let typingTimer: number | undefined
let typingPos = 0

export function mountDialogue() {
  windowEl = document.createElement('div')
  windowEl.id = 'dialogue'
  windowEl.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) scale(0.8);
    transform-origin: bottom center;
    width: min(880px, 92vw); min-height: 200px;
    display: none; align-items: flex-end; gap: 16px;
    background: rgba(88, 24, 40, 0.86);
    border: 3px solid #e8b4c0; border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(40, 8, 16, 0.6);
    padding: 14px 20px 14px 16px;
    font-family: monospace; color: #fff2f0;
    cursor: pointer; user-select: none; z-index: 20;
  `
  windowEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    advanceDialogue()
  })

  portraitEl = document.createElement('img')
  portraitEl.style.cssText = `
    height: 200px; image-rendering: pixelated; flex-shrink: 0;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
  `

  const body = document.createElement('div')
  body.style.cssText = 'flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column;'

  nameEl = document.createElement('div')
  nameEl.style.cssText = `
    display: inline-block; align-self: flex-start;
    background: rgba(40, 8, 16, 0.9); border: 2px solid #e8b4c0; border-radius: 6px;
    padding: 2px 14px; margin-bottom: 8px;
    font-size: 22px; font-weight: bold; color: #ffd9e2;
  `

  textEl = document.createElement('div')
  textEl.style.cssText = 'font-size: 26px; line-height: 1.55; white-space: pre-wrap; flex: 1;'

  cursorEl = document.createElement('div')
  cursorEl.textContent = '▼'
  cursorEl.style.cssText = `
    align-self: flex-end; font-size: 20px; color: #ffd9e2;
    animation: dialogue-blink 0.9s steps(2) infinite;
  `
  const style = document.createElement('style')
  style.textContent = '@keyframes dialogue-blink { 0% { opacity: 1; } 50% { opacity: 0; } }'
  document.head.appendChild(style)

  body.appendChild(nameEl)
  body.appendChild(textEl)
  body.appendChild(cursorEl)
  windowEl.appendChild(portraitEl)
  windowEl.appendChild(body)
  document.body.appendChild(windowEl)
}

export function isDialogueOpen(): boolean {
  return windowEl !== null && windowEl.style.display !== 'none'
}

export function openDialogue(dialogueLines: DialogueLine[], onEnd?: () => void) {
  if (!windowEl || dialogueLines.length === 0) return
  lines = dialogueLines
  lineIndex = 0
  onEndCallback = onEnd
  windowEl.style.display = 'flex'
  showLine()
}

// 送り操作（クリック/Space共通）。タイプ中なら全文表示、表示済みなら次の行、最終行なら閉じる
export function advanceDialogue() {
  if (!isDialogueOpen()) return
  if (typingTimer !== undefined) {
    window.clearInterval(typingTimer)
    typingTimer = undefined
    if (textEl) {
      const line = lines[lineIndex]
      const segments = parseSegments(line.text)
      renderSegments(textEl, segments, plainLength(segments), line.emScale ?? 2)
    }
    if (cursorEl) cursorEl.style.visibility = 'visible'
    return
  }
  lineIndex++
  if (lineIndex >= lines.length) {
    closeDialogue()
    return
  }
  showLine()
}

function showLine() {
  const line = lines[lineIndex]
  if (!portraitEl || !nameEl || !textEl || !cursorEl) return
  line.onShow?.()
  portraitEl.src = `assets/chara/${line.speaker}_face_${line.face}.png`
  nameEl.textContent = line.name
  textEl.style.color = line.color ?? '#fff2f0' // 行ごとに毎回設定する（色付き行の次の行で戻し忘れないため）

  // タイプライター表示。1文字ずつ進め、完了したら▼を出す（**囲みの拡大部分も1文字ずつ出す）
  const segments = parseSegments(line.text)
  const totalLength = plainLength(segments)
  const emScale = line.emScale ?? 2
  window.clearInterval(typingTimer)
  typingPos = 0
  textEl.textContent = ''
  cursorEl.style.visibility = 'hidden'
  typingTimer = window.setInterval(() => {
    typingPos++
    renderSegments(textEl!, segments, typingPos, emScale)
    if (typingPos >= totalLength) {
      window.clearInterval(typingTimer)
      typingTimer = undefined
      cursorEl!.style.visibility = 'visible'
    }
  }, typeMsPerChar())
}

function closeDialogue() {
  if (!windowEl) return
  window.clearInterval(typingTimer)
  typingTimer = undefined
  windowEl.style.display = 'none'
  const cb = onEndCallback
  onEndCallback = undefined
  cb?.()
}
