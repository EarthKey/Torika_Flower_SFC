// スマホ対応（2026-08-06）: タッチ端末判定と、画面上ボタン→ゲームロジックへの橋渡し。
// キーボードの無い端末では種まき・収穫・調合・話しかけ（Space系）が一切できなかったため、
// hud.ts が置く画面上ボタンの押下をここのフラグで受け、GridScene.update() が
// Phaser.Input.Keyboard.JustDown と同じタイミングで消費する（ポーリング方式。
// イベントリスナー方式だとシーン再入場のたびに解除漏れが起きるため採らない）
export const isTouchDevice =
  window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0

// 案内文の出し分け用。キーボード前提の「Spaceキー」をタッチ端末では「🌸ボタン」と読み替える
export const ACTION_LABEL = isTouchDevice ? '🌸ボタン' : 'Spaceキー'

// 案内メッセージ・会話文の「Spaceキー」表記をタッチ端末向けに読み替える一括フィルター。
// 個々のシーンの文言を書き換えて回ると漏れが出るため、表示直前の1点（showMessage/openDialogue/
// 遊び方ビューア）で置換する
export function adaptActionText(text: string): string {
  if (!isTouchDevice) return text
  return text.replace(/Spaceキー/g, '🌸ボタン').replace(/Space/g, '🌸ボタン')
}

let virtualActionPressed = false
export function pressVirtualAction() {
  virtualActionPressed = true
}
// 1フレームで1回だけtrueを返す（JustDownと同じ意味論）。呼ばれた時点でフラグは必ず消える
export function consumeVirtualAction(): boolean {
  const v = virtualActionPressed
  virtualActionPressed = false
  return v
}

// 仮想十字キー（2026-08-06実機フィードバック）: タップ移動だけでは細かい位置調整や
// ステージ間移動がしづらいため、右下に上下左右ボタンを常設する。押している間trueを保ち、
// GridScene.updateがキーボードのisDownと同じ扱いで毎フレーム読む
export const dpadState = { up: false, down: false, left: false, right: false }

let zoomTogglePressed = false
export function pressZoomToggle() {
  zoomTogglePressed = true
}
export function consumeZoomToggle(): boolean {
  const v = zoomTogglePressed
  zoomTogglePressed = false
  return v
}
