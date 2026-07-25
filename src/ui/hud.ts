// UIはCanvasの上にHTML/CSSで重ねる方針（仕様書§7）。プロトタイプ段階の簡易HUD。
// 薬の表示は§9-9（2026-07-19確定）: 薬名テキストは常時表示せずアイコンのみ。
// クリックで解説カード（薬名＋ふりがな＋番号＋構成生薬＋短い解説）＝簡易図鑑を兼ねる。
import { gameState, RECIPES, KIND_LABELS_RUBY, KIND_STAGE, stageUnlocks, canCompound, type Recipe, type SeedKind } from '../state/gameState'
import { options, saveOptions, notifyVolumeChanged } from '../state/options'

let hudEl: HTMLDivElement | null = null
let messageEl: HTMLDivElement | null = null
let messageTimer: number | undefined
let toastContainer: HTMLDivElement | null = null
let soundBtn: HTMLButtonElement | null = null
let cardEl: HTMLDivElement | null = null

export function mountHud() {
  hudEl = document.createElement('div')
  hudEl.id = 'hud'
  hudEl.style.cssText = `
    position: fixed; top: 8px; left: 8px;
    font-family: monospace; font-size: 28px;
    background: rgba(20,15,10,0.75); color: #f2e6c8;
    padding: 12px 18px; border: 2px solid #8a6a3a; border-radius: 4px;
    line-height: 1.6; pointer-events: none;
    transform: scale(0.8); transform-origin: top left;
  `
  document.body.appendChild(hudEl)

  messageEl = document.createElement('div')
  messageEl.id = 'message'
  messageEl.style.cssText = `
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    font-family: monospace; font-size: 28px;
    background: rgba(20,15,10,0.85); color: #ffffff;
    padding: 16px 32px; border: 2px solid #8a6a3a; border-radius: 4px;
    pointer-events: none; max-width: 80vw; text-align: center;
  `
  document.body.appendChild(messageEl)

  // 獲得トーストの置き場（画面上部中央。新しいものが下に積まれる）
  toastContainer = document.createElement('div')
  toastContainer.id = 'toasts'
  toastContainer.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; gap: 8px; align-items: center;
    pointer-events: none; z-index: 30;
  `
  document.body.appendChild(toastContainer)

  // 右上の音量ボタン（クリックで 100% → 50% → ミュート を循環）。
  // このボタンの状態は一時的なもので、再起動後は常に100%から始まる（options.tsで復元対象外）
  soundBtn = document.createElement('button')
  soundBtn.id = 'sound-toggle'
  soundBtn.style.cssText = `
    position: fixed; top: 10px; right: 12px;
    font-size: 26px; line-height: 1;
    background: rgba(20,15,10,0.75); color: #f2e6c8;
    padding: 8px 12px; border: 2px solid #8a6a3a; border-radius: 8px;
    cursor: pointer; z-index: 25;
  `
  soundBtn.addEventListener('click', () => {
    options.masterVolume = options.masterVolume >= 1 ? 0.5 : options.masterVolume >= 0.5 ? 0 : 1
    saveOptions()
    notifyVolumeChanged()
    refreshSoundButton()
  })
  refreshSoundButton()
  document.body.appendChild(soundBtn)

  // 薬アイコンのクリックで解説カードを開く（HUDはpointer-events:noneだが、
  // 薬アイコンだけauto指定で受ける。innerHTML再構築に耐えるようhudEl側で委譲）
  hudEl.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-recipe]') as HTMLElement | null
    if (!t) return
    const recipe = RECIPES.find((r) => r.id === t.dataset.recipe)
    if (recipe) showKusuriCard(recipe)
  })

  // 解説カード（画面中央のモーダル。どこをクリックしても閉じる）
  cardEl = document.createElement('div')
  cardEl.id = 'kusuri-card'
  cardEl.style.cssText = `
    position: fixed; inset: 0; display: none;
    align-items: center; justify-content: center;
    background: rgba(0,0,0,0.55); z-index: 40; cursor: pointer;
  `
  cardEl.addEventListener('click', () => { if (cardEl) cardEl.style.display = 'none' })
  document.body.appendChild(cardEl)
}

// 解説カードの中身を組み立てて表示する（§9-9: クリックすればいつでも見られる簡易図鑑）。
// settei（見開き2枚の紹介イラスト）が用意されている処方はそちらを、まだ無い処方は
// 従来どおりドット絵アイコン＋テキストのカードを表示する（2026-07-21・段階導入）
function showKusuriCard(r: Recipe) {
  if (!cardEl) return
  if (r.settei) {
    const [page1, page2] = r.settei
    cardEl.innerHTML = `
      <div style="
        display: flex; flex-direction: column; align-items: center; gap: 14px;
        max-width: min(980px, 96vw); max-height: 92vh; overflow-y: auto;
      ">
        <div style="display: flex; flex-wrap: nowrap; justify-content: center; gap: 16px; max-width: 100%; overflow-x: auto;">
          <img src="${page1}" style="width: min(460px, 46vw); border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.6);">
          <img src="${page2}" style="width: min(460px, 46vw); border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.6);">
        </div>
        <div style="
          background: rgba(20,15,10,0.96); color: #f2e6c8; border: 3px solid #c9a24a; border-radius: 10px;
          padding: 12px 22px; font-family: monospace; text-align: center;
        ">
          <div style="font-size: 12px; color: #a89468;">実際に市販されている製品名の一例（参考）</div>
          <div style="margin-top: 4px;">
            <span style="border: 2px solid #c9a24a; border-radius: 999px; padding: 2px 14px; font-size: 18px; color: #ffe9a8;">${r.numberLabel}</span>
          </div>
          <div style="margin-top: 10px; font-size: 13px; color: #a89468;">画面のどこかをクリックでとじる</div>
        </div>
      </div>
    `
    cardEl.style.display = 'flex'
    return
  }
  const costRow = (Object.entries(r.cost) as [SeedKind, number][])
    .map(([kind, n]) => `${icon(`assets/items/medal_${kind}.png`)}${KIND_LABELS_RUBY[kind]}×${n}`)
    .join('　')
  cardEl.innerHTML = `
    <div style="
      display: flex; gap: 22px; align-items: center;
      max-width: min(760px, 92vw);
      background: rgba(20,15,10,0.96); color: #f2e6c8;
      border: 3px solid #c9a24a; border-radius: 10px;
      padding: 24px 30px; font-family: monospace;
      box-shadow: 0 6px 24px rgba(0,0,0,0.6);
    ">
      <img src="${r.icon}" style="height: 190px; image-rendering: pixelated; flex-shrink: 0;">
      <div style="min-width: 0;">
        <div style="font-size: 30px; font-weight: bold; line-height: 1.3;">
          <ruby>${r.name}<rt style="font-size: 13px;">${r.ruby}</rt></ruby>
        </div>
        <div style="margin-top: 8px; font-size: 12px; color: #a89468;">実際に市販されている製品名の一例（参考）</div>
        <div style="margin-top: 4px;">
          <span style="border: 2px solid #c9a24a; border-radius: 999px; padding: 2px 14px; font-size: 18px; color: #ffe9a8;">${r.numberLabel}</span>
        </div>
        <div style="margin-top: 14px; font-size: 18px; color: #d8c8a8;">つかう生薬（しょうやく）: ${costRow}</div>
        <div style="margin-top: 12px; font-size: 20px; line-height: 1.6;">${r.desc}</div>
        <div style="margin-top: 14px; font-size: 14px; color: #a89468;">画面のどこかをクリックでとじる</div>
      </div>
    </div>
  `
  cardEl.style.display = 'flex'
}

// ── モーダル選択ウインドウ共通の入力ロック（2026-07-25追加） ──────────
// レシピ選択・薬渡し・依頼分岐の3つは、DOMを画面に重ねているだけでPhaser側の入力は生きたままだった。
// そのためウインドウを開いている最中にSPACEを押すと、後ろのGridSceneがそのキーを拾って
// 「調合台をもう一度調べる」「NPCにもう一度話しかける」が発火し、選択ウインドウが多重に開いたり
// 会話が巻き戻ったりしていた（2026-07-25本人報告「薬の選択のときにスペースを押すと選択できてしまう」）。
// 調合ムービー（showCompoundMovie）が既に採っていた「開いている間はキー入力を止める」方式に揃える。
//
// GridScene.update()はこのフラグを見て、開いている間の移動・アクションを丸ごとスキップする。
// あわせてキャプチャフェーズでkeydownを食い止め、閉じた瞬間の同じキー入力が
// Phaser側へ抜けて即座に再発火することも防ぐ（ムービー実装と同じ理由）。

let openOverlays = 0
let overlayKeyGuard: ((e: KeyboardEvent) => void) | null = null

// GridScene.update()から参照（選択ウインドウ表示中はSPACE等のゲーム内アクションを無視するため）
export function isOverlayOpen(): boolean {
  return openOverlays > 0
}

function lockGameInput() {
  openOverlays++
  if (overlayKeyGuard) return
  overlayKeyGuard = (e: KeyboardEvent) => {
    // 選択はクリック操作のみ。キー入力はここで握りつぶし、後ろのゲームへ渡さない
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('keydown', overlayKeyGuard, true)
}

function unlockGameInput() {
  openOverlays = Math.max(0, openOverlays - 1)
  if (openOverlays > 0 || !overlayKeyGuard) return
  window.removeEventListener('keydown', overlayKeyGuard, true)
  overlayKeyGuard = null
}

// ── レシピ選択ウインドウ（工房の調合台で開く） ──────────
// 覚えている処方を一覧表示し、クリックで調合を試みる。素材不足の行は薄暗く表示（クリックは可能で、
// 不足内容のメッセージは呼び出し側が出す）。背景クリックでキャンセル

let pickerEl: HTMLDivElement | null = null
let pickerOpen = false

// 二重にunlockしないよう、開いているときだけ閉じる（背景クリックと行クリックの両方から呼ばれる）
function closeRecipePicker() {
  if (!pickerOpen) return
  pickerOpen = false
  if (pickerEl) pickerEl.style.display = 'none'
  unlockGameInput()
}

export function showRecipePicker(onPick: (recipe: Recipe) => void) {
  if (!pickerEl) {
    pickerEl = document.createElement('div')
    pickerEl.id = 'recipe-picker'
    pickerEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55); z-index: 40;
    `
    pickerEl.addEventListener('click', (e) => {
      if (e.target === pickerEl && pickerEl) closeRecipePicker()
    })
    document.body.appendChild(pickerEl)
  }

  const rows = RECIPES.map((r) => {
    const ok = canCompound(r)
    const costRow = (Object.entries(r.cost) as [SeedKind, number][])
      .map(([kind, n]) => `${icon(`assets/items/medal_${kind}.png`)}×${n}`)
      .join('')
    return `
      <div data-pick="${r.id}" style="
        display: flex; align-items: center; gap: 16px;
        padding: 10px 16px; border: 2px solid ${ok ? '#c9a24a' : '#5a4c34'};
        border-radius: 8px; cursor: pointer; opacity: ${ok ? 1 : 0.55};
        background: rgba(40,30,18,0.6);
      ">
        <img src="${r.icon}" style="height: 64px; image-rendering: pixelated;">
        <div>
          <div style="font-size: 22px; font-weight: bold;"><ruby>${r.name}<rt style="font-size: 11px;">${r.ruby}</rt></ruby></div>
          <div style="font-size: 16px; margin-top: 2px;">${costRow}</div>
        </div>
      </div>`
  }).join('')

  pickerEl.innerHTML = `
    <div style="
      display: flex; flex-direction: column; gap: 10px;
      max-width: min(560px, 92vw); max-height: 80vh; overflow-y: auto;
      background: rgba(20,15,10,0.96); color: #f2e6c8;
      border: 3px solid #8a6a3a; border-radius: 10px;
      padding: 18px 20px; font-family: monospace;
    ">
      <div style="font-size: 18px; color: #ffe9a8;">なにを調合する？（背景クリックでやめる）</div>
      ${rows}
    </div>
  `
  pickerEl.querySelectorAll('[data-pick]').forEach((el) => {
    el.addEventListener('click', () => {
      const recipe = RECIPES.find((r) => r.id === (el as HTMLElement).dataset.pick)
      closeRecipePicker()
      if (recipe) onPick(recipe)
    })
  })
  pickerEl.style.display = 'flex'
  if (!pickerOpen) {
    pickerOpen = true
    lockGameInput()
  }
}

// ── 依頼中の話しかけ分岐（薬の話／世間話） ──────────
// 未達成の依頼がある間、話しかけるたび症状ヒントの依頼会話に固定されてしまい、
// 世間話に一切分岐できなかった問題への対応（2026-07-22本人指示）。
// 依頼が残っていても、世間話を選べば通常の会話プールに合流できるようにする

let questChoiceEl: HTMLDivElement | null = null

export function showQuestChoice(onQuest: () => void, onChat: () => void) {
  if (!questChoiceEl) {
    questChoiceEl = document.createElement('div')
    questChoiceEl.id = 'quest-choice'
    questChoiceEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55); z-index: 40;
    `
    document.body.appendChild(questChoiceEl)
  }
  const el = questChoiceEl
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    el.style.display = 'none'
    unlockGameInput()
  }
  el.innerHTML = `
    <div style="
      display: flex; flex-direction: column; gap: 10px;
      max-width: min(420px, 90vw);
      background: rgba(20,15,10,0.96); color: #f2e6c8;
      border: 3px solid #8a6a3a; border-radius: 10px;
      padding: 18px 20px; font-family: monospace;
    ">
      <div data-choice="quest" style="
        padding: 12px 16px; border: 2px solid #c9a24a; border-radius: 8px;
        cursor: pointer; text-align: center; font-size: 20px;
        background: rgba(40,30,18,0.6);
      ">お薬の話をする</div>
      <div data-choice="chat" style="
        padding: 12px 16px; border: 2px solid #5a4c34; border-radius: 8px;
        cursor: pointer; text-align: center; font-size: 20px; color: #d8c8a8;
        background: rgba(40,30,18,0.4);
      ">世間話をする</div>
    </div>
  `
  el.querySelector('[data-choice="quest"]')?.addEventListener('click', () => { close(); onQuest() })
  el.querySelector('[data-choice="chat"]')?.addEventListener('click', () => { close(); onChat() })
  el.style.display = 'flex'
  lockGameInput()
}

// ── 薬渡しウインドウ（薬依頼§9-8。NPCの依頼会話のあとに開く） ──────────
// 手持ちにある薬（所持数1以上）だけを一覧表示し、クリックで渡す薬を選ぶ。
// 「今は渡さない」の行と背景クリックでキャンセル（onCancelは案内メッセージ用）

let giftEl: HTMLDivElement | null = null
let giftCancelCb: (() => void) | undefined
let giftOpen = false

// 二重にunlockしないよう、開いているときだけ閉じる（背景クリック・キャンセル行・薬の行から呼ばれる）
function closeGiftPicker() {
  if (!giftOpen) return
  giftOpen = false
  if (giftEl) giftEl.style.display = 'none'
  unlockGameInput()
}

export function showGiftPicker(onPick: (recipe: Recipe) => void, onCancel?: () => void) {
  if (!giftEl) {
    giftEl = document.createElement('div')
    giftEl.id = 'gift-picker'
    giftEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55); z-index: 40;
    `
    // 背景クリックのキャンセルは生成時に1回だけ登録する（表示のたびに登録すると多重発火する）
    giftEl.addEventListener('click', (e) => {
      if (e.target === giftEl && giftEl) {
        closeGiftPicker()
        giftCancelCb?.()
      }
    })
    document.body.appendChild(giftEl)
  }
  giftCancelCb = onCancel
  const close = () => closeGiftPicker()

  const owned = RECIPES.filter((r) => (gameState.kusuriCounts[r.id] ?? 0) > 0)
  const rows = owned
    .map(
      (r) => `
      <div data-gift="${r.id}" style="
        display: flex; align-items: center; gap: 16px;
        padding: 10px 16px; border: 2px solid #c9a24a;
        border-radius: 8px; cursor: pointer;
        background: rgba(40,30,18,0.6);
      ">
        <img src="${r.icon}" style="height: 64px; image-rendering: pixelated;">
        <div>
          <div style="font-size: 22px; font-weight: bold;"><ruby>${r.name}<rt style="font-size: 11px;">${r.ruby}</rt></ruby></div>
          <div style="font-size: 16px; margin-top: 2px;">もっている数: ${gameState.kusuriCounts[r.id]}</div>
        </div>
      </div>`,
    )
    .join('')

  giftEl.innerHTML = `
    <div style="
      display: flex; flex-direction: column; gap: 10px;
      max-width: min(560px, 92vw); max-height: 80vh; overflow-y: auto;
      background: rgba(20,15,10,0.96); color: #f2e6c8;
      border: 3px solid #8a6a3a; border-radius: 10px;
      padding: 18px 20px; font-family: monospace;
    ">
      <div style="font-size: 18px; color: #ffe9a8;">どのお薬を渡す？</div>
      ${rows}
      <div data-gift-cancel style="
        padding: 8px 16px; border: 2px solid #5a4c34; border-radius: 8px;
        cursor: pointer; text-align: center; font-size: 18px; color: #d8c8a8;
        background: rgba(40,30,18,0.4);
      ">今は渡さない</div>
    </div>
  `
  giftEl.querySelector('[data-gift-cancel]')?.addEventListener('click', () => {
    close()
    onCancel?.()
  })
  giftEl.querySelectorAll('[data-gift]').forEach((el) => {
    el.addEventListener('click', () => {
      const recipe = RECIPES.find((r) => r.id === (el as HTMLElement).dataset.gift)
      close()
      if (recipe) onPick(recipe)
    })
  })
  giftEl.style.display = 'flex'
  if (!giftOpen) {
    giftOpen = true
    lockGameInput()
  }
}

// ── 調合成功のカットインムービー（§9-9・PV素材再利用） ──────────
// 元はPhaserのworld-space動画として実装していたが、カメラズーム（2倍）と一緒に拡大されて
// 画面からはみ出す不具合があった（2026-07-21報告）。他のオーバーレイ（レシピ選択・薬渡し等）と
// 同じくDOM要素で実装し直し、カメラのズーム・スクロールとは独立させた。
// 2026-07-22改修: 通常表示を304×232→456×348（1.5倍）に変更。ズームモード中はもともと
// 456×348だったため、現状は通常時・ズーム時とも同じ大きさで表示する

let compoundEl: HTMLDivElement | null = null
let movieOpen = false

// GridScene.update()から参照（ムービー表示中はSPACE等のゲーム内アクションを無視するため）
export function isCompoundMovieOpen(): boolean {
  return movieOpen
}

export function showCompoundMovie(onEnd: () => void) {
  if (!compoundEl) {
    compoundEl = document.createElement('div')
    compoundEl.id = 'compound-movie'
    compoundEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.65); z-index: 40; cursor: pointer;
    `
    document.body.appendChild(compoundEl)
  }
  const el = compoundEl

  movieOpen = true
  let finished = false
  // キャプチャフェーズで奪い、Phaser側のkeydownリスナー（bubbleフェーズ・windowに登録）へ
  // このイベントが届く前に止める。これをしないとSPACEでスキップした同じキー入力を
  // Phaserの調合台アクションが拾ってしまい、閉じた直後にもう一度調合が始まってしまう
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    finish()
  }
  const finish = () => {
    if (finished) return
    finished = true
    movieOpen = false
    window.removeEventListener('keydown', onKeyDown, true)
    el.style.display = 'none'
    el.innerHTML = ''
    onEnd()
  }

  const width = 456
  const height = 348
  el.innerHTML = `
    <video src="assets/effects/compound_movie.mp4" autoplay playsinline
      style="width: ${width}px; height: ${height}px; border: 4px solid #c9a24a; border-radius: 4px; background: #000;">
    </video>
  `
  el.querySelector('video')?.addEventListener('ended', finish)
  el.addEventListener('click', finish, { once: true })
  window.addEventListener('keydown', onKeyDown, true)
  el.style.display = 'flex'
}

function refreshSoundButton() {
  if (!soundBtn) return
  soundBtn.textContent = options.masterVolume >= 1 ? '🔊' : options.masterVolume >= 0.5 ? '🔉' : '🔇'
  soundBtn.title = `音量: ${Math.round(options.masterVolume * 100)}%`
}

// タイトル画面ではHUDを隠し、ゲーム開始時に表示する
export function setHudVisible(visible: boolean) {
  const display = visible ? '' : 'none'
  if (hudEl) hudEl.style.display = display
  if (messageEl) messageEl.style.display = display
  if (soundBtn) soundBtn.style.display = display // 音量ボタンもゲーム中のみ表示（タイトルはオプションで調整）
  if (!visible && cardEl) cardEl.style.display = 'none' // タイトルへ戻るとき解説カードも閉じる
  if (!visible && pickerEl) pickerEl.style.display = 'none'
  if (!visible && giftEl) giftEl.style.display = 'none'
  if (!visible && questChoiceEl) questChoiceEl.style.display = 'none'
  if (!visible && compoundEl) { compoundEl.style.display = 'none'; compoundEl.innerHTML = ''; movieOpen = false }
}

// 獲得トースト: アイコン＋テキストの小さな通知をふわっと出して自動で消す
export function showToast(text: string, iconSrc?: string) {
  if (!toastContainer) return
  const toast = document.createElement('div')
  toast.style.cssText = `
    display: flex; align-items: center; gap: 10px;
    font-family: monospace; font-size: 24px; color: #ffe9a8;
    background: rgba(20,15,10,0.9); border: 2px solid #c9a24a; border-radius: 8px;
    padding: 8px 22px; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    opacity: 0; transform: translateY(-12px);
    transition: opacity 0.25s ease, transform 0.25s ease;
  `
  if (iconSrc) {
    const img = document.createElement('img')
    img.src = iconSrc
    img.style.cssText = 'height:36px;image-rendering:pixelated;'
    toast.appendChild(img)
  }
  const span = document.createElement('span')
  span.textContent = text
  toast.appendChild(span)
  toastContainer.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateY(0)'
  })
  window.setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(-12px)'
    window.setTimeout(() => toast.remove(), 300)
  }, 1800)
}

const ICON_STYLE = 'height:40px;vertical-align:middle;image-rendering:pixelated;margin:0 4px 0 12px;'

function icon(src: string): string {
  return `<img src="${src}" style="${ICON_STYLE}">`
}

// HUDに出す種類は「到達済みステージぶんだけ」。春は常時、夏は季節の門が開いてから
// 表示が増える（未収集でも0件のアイコンは出す＝所持品欄の存在を先に知らせる方式。
// §2解放条件と連動。2026-07-20確定: 全種類を最初から出す/初回入手まで隠す、の両案のうち
// 「ステージ解放と同時にアイコン欄も増える」を採用。ステージが増えるほどHUDが単調に伸びていく）
function visibleKinds(): SeedKind[] {
  return (Object.keys(KIND_STAGE) as SeedKind[]).filter(
    (k) => KIND_STAGE[k] === 'spring' || stageUnlocks.summer,
  )
}

export function updateHud() {
  if (!hudEl) return
  const s = gameState
  const kinds = visibleKinds()
  const seedRow = kinds.map((k) => `${icon(`assets/items/seed_bag_${k}.png`)}${s.seeds[k]}`).join('')
  const medalRow = kinds.map((k) => `${icon(`assets/items/medal_${k}.png`)}${s.medals[k]}`).join('')
  // 薬はアイコンのみ（§9-9）。一度でも調合したことがあればクリックで解説カード（所持数0でも図鑑として残す・2026-07-21〜）、
  // 未調合=グレーの「?」（収集要素）。所持数の増減はkusuriCountsだが、表示の可否はkusuriEverObtainedで判定する
  const kusuriRow = RECIPES.map((r) => {
    const count = s.kusuriCounts[r.id] ?? 0
    return s.kusuriEverObtained[r.id]
      ? `<img src="${r.icon}" data-recipe="${r.id}" title="クリックで解説" style="${ICON_STYLE}pointer-events:auto;cursor:pointer;">${count}`
      : `<img src="assets/items/kusuri/kusuri_unknown.png" style="${ICON_STYLE}opacity:0.55;">?`
  }).join('')
  hudEl.innerHTML = `
    種:${seedRow}<br>
    メダル:${medalRow}<br>
    薬:${kusuriRow}
  `
}

export function showMessage(text: string) {
  if (!messageEl) return
  messageEl.textContent = text
  messageEl.style.opacity = '1'
  window.clearTimeout(messageTimer)
  messageTimer = window.setTimeout(() => {
    if (messageEl) messageEl.style.opacity = '0'
  }, 2500)
}
