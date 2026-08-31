// スマホ対応（2026-08-06）: タッチ端末判定と、画面上ボタン→ゲームロジックへの橋渡し。
// キーボードの無い端末では種まき・収穫・調合・話しかけ（Space系）が一切できなかったため、
// hud.ts が置く画面上ボタンの押下をここのフラグで受け、GridScene.update() が
// Phaser.Input.Keyboard.JustDown と同じタイミングで消費する（ポーリング方式。
// イベントリスナー方式だとシーン再入場のたびに解除漏れが起きるため採らない）
// 🔴 2026-09-01: **`navigator.maxTouchPoints > 0` で判定してはいけない**。
// Windowsのブラウザは、タッチパネルの無いデスクトップでもデジタイザ等が登録されているだけで
// maxTouchPoints に 10 を返す（実測10・pointer:coarse は false）。そのため
// **PCでも isTouchDevice が true になり、十字キー・荷物ボタン化・15秒の放置ヒント・
// 「十字キー／タップ」表記といったスマホ用UIがPCへ出ていた**（2026-08-06〜09-01）。
// 公式サイト側の同じ誤判定でゲーム埋め込み自体が消えていたため、26日間表面化しなかった。
//
// 判定は `(hover: none) and (pointer: coarse)` の1本にする。
// 「マウスが無く、指が主ポインタ」＝本物のスマホ・タブレットだけが true になり、
// タッチ対応PCは false、横持ちスマホは true のまま（4環境で実測確認済み）。
// 判定文は公式サイト側 index.html のタッチ判定と必ず同じものを使う。
export const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches

// 案内文の出し分け用。キーボード前提の「Spaceキー」をタッチ端末では「Aボタン」と読み替える
// （2026-08-06: 🌸アイコンだと決定ボタンだと気づきにくいという実機評を受け、SFC/N64風の
//  立体的なピンクの「A」ボタンへ変更。呼称も家庭用ゲーム機に揃える）
export const ACTION_LABEL = isTouchDevice ? 'Aボタン' : 'Spaceキー'

// 案内メッセージ・会話文の「Spaceキー」表記をタッチ端末向けに読み替える一括フィルター。
// 個々のシーンの文言を書き換えて回ると漏れが出るため、表示直前の1点（showMessage/openDialogue/
// 遊び方ビューア）で置換する
export function adaptActionText(text: string): string {
  if (!isTouchDevice) return text
  return (
    text
      // 長い組み合わせから順に置換する（先に「矢印キー/WASD」を消すと残りが壊れるため）
      .replace(/矢印キー\/WASD\/クリック/g, '十字キー／タップ')
      .replace(/矢印キー\/WASD/g, '十字キー')
      .replace(/矢印キーかWASD/g, '十字キー')
      .replace(/矢印キー か WASD/g, '十字キー')
      .replace(/Spaceキー/g, 'Aボタン')
      .replace(/Space/g, 'Aボタン')
      .replace(/クリック/g, 'タップ')
  )
}

// 畑に乗ったときの操作ヒント（2026-08-10新設・本人指示）。
// 「ここは〇〇を植える場所」の一段下に出す。ブラウザは画面のAボタンとスペースキーの両方が
// 効くので併記し、スマホはAボタンだけを案内する
export const PLANT_ACTION_HINT = isTouchDevice
  ? 'Aで 植える・収穫'
  : 'A または スペースで 植える・収穫'

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
