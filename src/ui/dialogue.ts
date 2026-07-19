// 会話ウインドウ（仕様書§9-2 最優先項目）。HUDと同じくCanvasの上にHTML/CSSで重ねる。
// SFC風: 画面下部にウインドウ、左に顔グラ（バストアップ9表情）、名前欄、本文、▼送りマーク。
// 配色はトリカの色に寄せたワインレッド＋軽い背景透過（2026-07-17決定）。
// 通常会話はNPC一方向。掛け合い形式は依頼イベント実装時に speaker 切り替えで対応できる構造にしてある。

export interface DialogueLine {
  speaker: string // 'izuna' | 'sakuya' | 'torika' — 顔グラのファイル接頭辞
  name: string // 表示名。漢字名のキャラは「漢字（読み）」形式（例: 酉花（トリカ）／咲耶（サクヤ）。2026-07-19ルール）
  face: number // 表情番号1〜9（1=通常 2=にっこり 3=驚き 4=困り 5=怒り/心配 6=真剣/微笑 7=白目 8=青ざめ 9=目回し）
  text: string
  onShow?: () => void // この行が表示された瞬間に呼ばれる（チュートリアルの案内矢印などの演出フック）
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
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    width: min(880px, 92vw); min-height: 150px;
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
    height: 150px; image-rendering: pixelated; flex-shrink: 0;
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
    if (textEl) textEl.textContent = lines[lineIndex].text
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

  // タイプライター表示。1文字ずつ進め、完了したら▼を出す
  window.clearInterval(typingTimer)
  typingPos = 0
  textEl.textContent = ''
  cursorEl.style.visibility = 'hidden'
  typingTimer = window.setInterval(() => {
    typingPos++
    textEl!.textContent = line.text.slice(0, typingPos)
    if (typingPos >= line.text.length) {
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
