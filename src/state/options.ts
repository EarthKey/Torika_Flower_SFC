// ゲーム設定（オプション画面の内容）。仕様書§7セーブ設計A-4e準拠:
// セーブスロットとは別キーで端末共通保存（どのスロットで遊んでも同じ設定が効く）。
// 現状は「文字送り速度」「画面表示（全体/ズーム）」の2項目。音量はBGM実装時に追加する。

export type TypeSpeed = 'slow' | 'normal' | 'fast'

export interface GameOptions {
  typeSpeed: TypeSpeed
  zoomDefault: boolean // trueならゲーム開始時から2倍ズーム＋トリカ追従
  masterVolume: number // 全体音量 1/0.5/0（ゲーム中右上のボタンで切替）
  bgmVolume: number // BGM音量 0〜1（0.25刻み。BGM実装時に適用）
  seVolume: number // SE音量 0〜1（0.25刻み。SE実装時に適用）
}

const OPTIONS_KEY = 'torikka-flower-options-v1'

export const options: GameOptions = {
  typeSpeed: 'normal',
  zoomDefault: false,
  masterVolume: 1,
  bgmVolume: 0.75,
  seVolume: 0.75,
}

// 音量変更をPhaser側（main.ts）へ通知する。BGM/SE実装後もこの1本で反映される
export function notifyVolumeChanged() {
  window.dispatchEvent(new CustomEvent('torikka-volume-changed'))
}

export function saveOptions() {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options))
  } catch {
    // 保存できない環境では黙って無視（セーブ設計と同方針）
  }
}

// 会話ウインドウのタイプライター速度（1文字あたりms）
export function typeMsPerChar(): number {
  return { slow: 45, normal: 30, fast: 12 }[options.typeSpeed]
}

function restoreOptions() {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Partial<GameOptions>
    if (data.typeSpeed === 'slow' || data.typeSpeed === 'normal' || data.typeSpeed === 'fast') {
      options.typeSpeed = data.typeSpeed
    }
    if (typeof data.zoomDefault === 'boolean') options.zoomDefault = data.zoomDefault
    // masterVolume（右上ボタン）は「その場の一時消音」扱いで復元しない。
    // 復元するとミュートのまま再起動→タイトルから無音になるため（2026-07-18本人指摘）。
    // 恒久的な音量調整はオプションのBGM/SE個別音量（こちらは復元する）で行う
    if (typeof data.bgmVolume === 'number') options.bgmVolume = data.bgmVolume
    if (typeof data.seVolume === 'number') options.seVolume = data.seVolume
  } catch {
    // 壊れた設定は初期値のまま
  }
}

restoreOptions()
