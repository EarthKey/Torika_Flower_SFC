// UIはCanvasの上にHTML/CSSで重ねる方針（仕様書§7）。プロトタイプ段階の簡易HUD。
// 薬の表示は§9-9（2026-07-19確定）: 薬名テキストは常時表示せずアイコンのみ。
// クリックで解説カード（薬名＋ふりがな＋番号＋構成生薬＋短い解説）＝簡易図鑑を兼ねる。
import { gameState, RECIPES, KIND_LABELS_RUBY, KIND_STAGE, stageUnlocks, canCompound, recipeVisibleInUi, takeUrabanashiUnlockNotice, type Recipe, type SeedKind } from '../state/gameState'
import { options, saveOptions, notifyVolumeChanged } from '../state/options'
import { playSfx } from '../state/sfx'

let hudEl: HTMLDivElement | null = null
let messageEl: HTMLDivElement | null = null
let messageTimer: number | undefined
let toastContainer: HTMLDivElement | null = null
let soundBtn: HTMLButtonElement | null = null
let seBtn: HTMLButtonElement | null = null
let titleBtn: HTMLButtonElement | null = null
let titleConfirmEl: HTMLDivElement | null = null
let howtoBtn: HTMLButtonElement | null = null
let authorBtn: HTMLButtonElement | null = null
let authorEl: HTMLDivElement | null = null

// 「タイトルに戻る」の実処理はシーン側（main.ts）が登録する。HUDはDOMだけを持ちPhaserを直接触らない
let returnToTitleHandler: (() => void) | null = null
export function setReturnToTitleHandler(fn: () => void) {
  returnToTitleHandler = fn
}
let cardEl: HTMLDivElement | null = null
let howtoGuideArrowEl: HTMLDivElement | null = null

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

  // 効果音音量ボタン（2026-08-03本人指示）。音量ボタンの真下に置き、
  // クリックで 100% → 50% → ミュート を循環（メイン音量と同じ下げ方）。
  // seVolumeはoptions.tsの復元対象なので、こちらは再起動後も保持される
  seBtn = document.createElement('button')
  seBtn.id = 'se-toggle'
  seBtn.style.cssText = `
    position: fixed; top: 64px; right: 12px;
    font-size: 18px; line-height: 26px; font-family: monospace; font-weight: bold;
    background: rgba(20,15,10,0.75); color: #f2e6c8;
    padding: 8px 10px; border: 2px solid #8a6a3a; border-radius: 8px;
    cursor: pointer; z-index: 25;
  `
  seBtn.addEventListener('click', () => {
    options.seVolume = options.seVolume >= 1 ? 0.5 : options.seVolume >= 0.5 ? 0 : 1
    saveOptions()
    refreshSeButton()
  })
  refreshSeButton()
  document.body.appendChild(seBtn)

  // 「タイトルに戻る」ボタン（2026-08-03本人指示）。SEボタンの真下。
  // セーブはイベント毎の自動セーブ済みなので、確認さえ取れればそのまま戻ってよい
  titleBtn = document.createElement('button')
  titleBtn.id = 'title-return'
  titleBtn.textContent = 'タイトル'
  titleBtn.style.cssText = `
    position: fixed; top: 118px; right: 12px;
    font-size: 15px; line-height: 22px; font-family: monospace; font-weight: bold;
    background: rgba(20,15,10,0.75); color: #f2e6c8;
    padding: 7px 10px; border: 2px solid #8a6a3a; border-radius: 8px;
    cursor: pointer; z-index: 25;
  `
  titleBtn.title = 'タイトル画面に戻る'
  titleBtn.addEventListener('click', () => openTitleConfirm())
  document.body.appendChild(titleBtn)

  // 「遊び方」ボタン（2026-07-25本人指示）。音量ボタンの左隣・横長の枠。
  // 久しぶりに遊ぶ人がデモの説明をいつでも見返せるよう、4:3の紹介イラストのページ送りビューアを開く
  howtoBtn = document.createElement('button')
  howtoBtn.id = 'howto-toggle'
  howtoBtn.textContent = '遊び方'
  howtoBtn.style.cssText = `
    position: fixed; top: 10px; right: 74px;
    font-size: 18px; line-height: 26px; font-family: monospace; font-weight: bold;
    background: rgba(20,15,10,0.75); color: #f2e6c8;
    padding: 8px 18px; border: 2px solid #8a6a3a; border-radius: 8px;
    cursor: pointer; z-index: 25;
  `
  howtoBtn.addEventListener('click', () => openHowto())
  document.body.appendChild(howtoBtn)

  // 「作った人」ボタン（2026-08-04本人指示）。右下に**常時表示**（タイトル画面でも消さない）。
  // ブラウザゲームは作者情報が辿れないまま遊ばれて終わることが多いので、
  // どの画面からでも1クリックで作者紹介（X/Substack/ポートフォリオ）へ行ける導線を常設する。
  // 遊びの邪魔をしないよう普段は半透明で、hoverで金枠が立ち上がる控えめな出方にしている
  authorBtn = document.createElement('button')
  authorBtn.id = 'author-open'
  authorBtn.textContent = '作った人'
  authorBtn.style.cssText = `
    position: fixed; bottom: 12px; right: 12px;
    font-size: 15px; line-height: 22px; font-family: monospace; font-weight: bold;
    background: rgba(20,15,10,0.6); color: #d8c79a;
    padding: 7px 14px; border: 2px solid #6d5630; border-radius: 8px;
    cursor: pointer; z-index: 25; opacity: 0.72;
    transition: opacity 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  `
  authorBtn.title = 'このゲームを作った人について'
  authorBtn.addEventListener('mouseenter', () => {
    if (!authorBtn) return
    authorBtn.style.opacity = '1'
    authorBtn.style.borderColor = '#c9a24a'
    authorBtn.style.color = '#ffe9a8'
  })
  authorBtn.addEventListener('mouseleave', () => {
    if (!authorBtn) return
    authorBtn.style.opacity = '0.72'
    authorBtn.style.borderColor = '#6d5630'
    authorBtn.style.color = '#d8c79a'
  })
  authorBtn.addEventListener('click', () => openAuthorCard())
  document.body.appendChild(authorBtn)

  // 作者紹介カードの器（中身はopenAuthorCardで組む。背景クリックで閉じる）
  authorEl = document.createElement('div')
  authorEl.id = 'author-card'
  authorEl.style.cssText = `
    position: fixed; inset: 0; display: none;
    align-items: center; justify-content: center;
    background: rgba(0,0,0,0.6); z-index: 45;
  `
  authorEl.addEventListener('click', (e) => {
    // カード本体のクリックは閉じない（リンクを押せるようにする）。背景と×だけが閉じる
    const t = e.target as HTMLElement
    if (t === authorEl || t.dataset.authorClose !== undefined) closeAuthorCard()
  })
  document.body.appendChild(authorEl)

  // イントロ最後の案内用「遊び方ボタンを指す上向き矢印」（2026-07-27本人指示）。
  // 「わからなくなったらみんなに聞いて」ではなく「遊び方をいつでも見返せる」ことを教える導線。
  // 種の聖域・畑・工房を指すPhaser側の矢印(guide_arrow・40x46)はワールド座標前提のため、
  // 画面固定のHUDボタンを指すここだけはDOM側で作る。サイズは本人指示で他の矢印の2倍(80x92)
  howtoGuideArrowEl = document.createElement('div')
  howtoGuideArrowEl.id = 'howto-guide-arrow'
  howtoGuideArrowEl.style.cssText = `
    position: fixed; top: 50px; right: 100px; width: 80px; height: 92px;
    z-index: 26; pointer-events: none; display: none;
    animation: howto-arrow-bob 0.42s ease-in-out infinite alternate;
  `
  howtoGuideArrowEl.innerHTML = `
    <div style="position:absolute; left:50%; top:40px; transform:translateX(-50%);
      width:34px; height:48px; background:#e23b2e; border:3px solid #ffffff; box-sizing:border-box;"></div>
    <div style="position:absolute; left:50%; top:0; transform:translateX(-50%);
      width:0; height:0; border-left:24px solid transparent; border-right:24px solid transparent;
      border-bottom:44px solid #ffffff;"></div>
    <div style="position:absolute; left:50%; top:6px; transform:translateX(-50%);
      width:0; height:0; border-left:20px solid transparent; border-right:20px solid transparent;
      border-bottom:36px solid #e23b2e;"></div>
  `
  document.body.appendChild(howtoGuideArrowEl)
  const arrowStyle = document.createElement('style')
  arrowStyle.textContent = `
    @keyframes howto-arrow-bob { from { transform: translateY(0); } to { transform: translateY(10px); } }
    /* 作者カードのリンク行。hoverは擬似クラスが要るのでインラインstyleでは書けずここに置く */
    #author-card .author-link:hover { background: rgba(255,233,168,0.14); border-color: #c9a24a; }
  `
  document.head.appendChild(arrowStyle)

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
  cardEl.addEventListener('click', () => closeKusuriCard())
  document.body.appendChild(cardEl)
}

// 解説カードの開閉（2026-07-25）。他のオーバーレイと同じ入力ロックを掛けるため関数にまとめた。
// 掛けないと、カードを見ている最中のSPACEを後ろのGridSceneが拾い、
// カードが開いたままNPCの話しかけ（お薬の話／世間話の選択）が始まってしまう（本人報告）
let cardOpen = false

function closeKusuriCard() {
  if (!cardOpen) return
  cardOpen = false
  if (cardEl) cardEl.style.display = 'none'
  unlockGameInput()
}

function openKusuriCard() {
  if (!cardEl) return
  cardEl.style.display = 'flex'
  if (cardOpen) return
  cardOpen = true
  // カードは「読むだけ」の画面なので、クリックだけでなくSPACE/Enter/Escでも閉じられるようにする
  lockGameInput((e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
      closeKusuriCard()
    }
  })
}

// ── 作った人カード（2026-08-04本人指示） ──────────────────
// 右下の「作った人」から開く作者紹介。ゲームを遊んだ人が作者の発信へ辿り着ける唯一の導線なので、
// 「誰が・なぜ作ったか」を1画面で読み切れる分量に抑え、リンクは押しやすい大きな行で並べる。
//
// リンクの増やし方: 下のAUTHOR_LINKSに1件足すだけ（並び順＝表示順）。
// CryptoNinjaキャラ再現GPTs／プロンプト教材（Brain）は公開が決まり次第ここへ追加する予定。
// noteのアイコンは絵文字で代用している（画像アセットを増やさず文字だけで完結させるため）
interface AuthorLink {
  icon: string
  label: string
  sub: string
  url: string
}

const AUTHOR_LINKS: AuthorLink[] = [
  {
    icon: '𝕏',
    label: 'X（旧Twitter）',
    sub: '@EarthGigantea ／ ふだんの発信はこちら',
    url: 'https://x.com/EarthGigantea',
  },
  {
    icon: '📮',
    label: 'Substack',
    sub: 'earthkey.substack.com ／ 医療とAIの読みもの',
    url: 'https://earthkey.substack.com/',
  },
  {
    icon: '🌐',
    label: 'ポートフォリオ',
    sub: 'earthkey-portfolio.vercel.app ／ 作ったものの一覧',
    url: 'https://earthkey-portfolio.vercel.app/',
  },
  // 教材が公開できたらこの下へ1件追加する（CryptoNinjaキャラ再現GPTs／プロンプト）
]

let authorOpen = false

function closeAuthorCard() {
  if (!authorOpen) return
  authorOpen = false
  if (authorEl) authorEl.style.display = 'none'
  unlockGameInput()
}

function openAuthorCard() {
  if (!authorEl || authorOpen) return
  const rows = AUTHOR_LINKS.map(
    (l) => `
      <a href="${l.url}" target="_blank" rel="noopener noreferrer" class="author-link" style="
        display: flex; align-items: center; gap: 14px; text-decoration: none;
        background: rgba(255,233,168,0.06); border: 2px solid #6d5630; border-radius: 8px;
        padding: 11px 16px; color: #f2e6c8;
      ">
        <span style="font-size: 22px; width: 28px; text-align: center; flex-shrink: 0;">${l.icon}</span>
        <span style="min-width: 0;">
          <span style="display: block; font-size: 17px; font-weight: bold; color: #ffe9a8;">${l.label}</span>
          <span style="display: block; font-size: 12px; color: #a89468; margin-top: 2px;">${l.sub}</span>
        </span>
        <span style="margin-left: auto; font-size: 15px; color: #a89468; flex-shrink: 0;">↗</span>
      </a>`,
  ).join('')

  authorEl.innerHTML = `
    <div style="
      position: relative; max-width: min(560px, 92vw); max-height: 92vh; overflow-y: auto;
      background: rgba(20,15,10,0.96); color: #f2e6c8;
      border: 3px solid #c9a24a; border-radius: 10px;
      padding: 26px 28px 22px; font-family: monospace;
      box-shadow: 0 6px 24px rgba(0,0,0,0.6);
    ">
      <button data-author-close style="
        position: absolute; top: 8px; right: 10px;
        background: none; border: none; color: #a89468;
        font-size: 22px; line-height: 1; cursor: pointer; font-family: monospace;
      ">×</button>

      <div style="font-size: 12px; color: #a89468; letter-spacing: 0.18em;">CREATED BY</div>
      <div style="font-size: 28px; font-weight: bold; color: #ffe9a8; margin-top: 4px; line-height: 1.3;">
        アースキー
      </div>
      <div style="font-size: 13px; color: #a89468; margin-top: 2px;">EarthKey</div>

      <div style="font-size: 14px; line-height: 1.85; margin-top: 16px;">
        現役の病院薬剤師をしながら、AIで作れるものを作っています。<br>
        このゲームは「生薬と漢方を、遊びながら手ざわりで覚えられたら」という思いつきから、
        NinjaDAOのキャラクターたちに登場してもらって形にしました。
      </div>

      <div style="height: 1px; background: #6d5630; margin: 18px 0 14px;"></div>

      <div style="display: flex; flex-direction: column; gap: 9px;">${rows}</div>

      <div style="font-size: 12px; color: #a89468; margin-top: 16px; line-height: 1.7;">
        キャラクターは CryptoNinja / CryptoNinja Partners の二次創作です。<br>
        カードの外側・×・ESCキーで閉じます。
      </div>
    </div>
  `
  authorEl.style.display = 'flex'
  authorOpen = true
  lockGameInput((e) => {
    if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      closeAuthorCard()
    }
  })
}

// ── 遊び方ビューア（2026-07-25本人指示） ──────────────────
// デモ（はじめからのチュートリアル）の内容を、いつでも見返せるページ送りビューア。
// 各ページは4:3の色鉛筆風イラスト（public/assets/howto/howto_1.webp〜）＋短い説明文。
// イラスト未生成の間は説明文だけのプレースホルダーで動く（img.onerrorで非表示に切り替え）。
// 開く=lock / 閉じる=unlock を必ず対にする（引継ぎ注意点3。直書きするとSPACE誤爆する）
//
// 文字の載せ方（2026-07-25変更・本人指示）: 説明文はイラストの「下」ではなく**イラストの上に重ねる**。
// ゲームの紹介画面として1枚の絵に見えるようにしたい、という意図。
// 焼き込み（画像に文字を合成）ではなくCSSで重ねる方式を採った理由:
//   - 文字が常に鮮明（拡大縮小でぼけない）／AI生成の日本語崩れが起きない
//   - 文面の修正がHOWTO_PAGESの1行編集で済み、画像を作り直さなくてよい
//   - イラストは生成済みの6枚をそのまま使える
// 引き換えに「画像ファイル単体では説明が完結しない」ため、SNS共有用の1枚絵が必要になったときは
// 別途 ffmpeg drawtext（UDDigiKyokashoN-B.ttc が標準搭載・動作確認済み）で焼き込み版を作る
const HOWTO_PAGES = [
  {
    title: '操作方法',
    body: 'パソコン: 矢印キー か WASD で移動。行きたい場所をクリックしてもOK。Spaceキーで調べる・話す。\nスマホ: 行きたい場所をタップすると歩いていきます。',
  },
  {
    title: '種を採りに行こう',
    body: '里の上にある鳥居をくぐると「種の聖域」へ。キラキラ光る採取スポットの前で Space！',
  },
  {
    title: '種を植えよう',
    body: '採ってきた種は、里の畑に植えよう。育ったら収穫して、生薬（しょうやく）メダルを集めてね。',
  },
  {
    title: 'お薬を作って渡そう',
    body: '工房の調合台でメダルを選んで、お薬を調合！ 咲耶（サクヤ）の症状を聞いて、ぴったりのお薬を届けよう。',
  },
  {
    title: '皆の悩みも聞いてあげよう',
    body: 'シャオランやネムも、体の悩みを抱えているみたい。話を聞いて、合うお薬を渡してあげてね。',
  },
  {
    title: '悩みを解決すると……',
    body: '里の皆を癒やすと、新しいステージへの門が開くかも！',
  },
]

let howtoEl: HTMLDivElement | null = null
let howtoOpen = false
let howtoPage = 0

function closeHowto() {
  if (!howtoOpen) return
  howtoOpen = false
  if (howtoEl) howtoEl.style.display = 'none'
  unlockGameInput()
}

function renderHowtoPage() {
  if (!howtoEl) return
  const page = HOWTO_PAGES[howtoPage]
  const last = howtoPage === HOWTO_PAGES.length - 1
  const img = howtoEl.querySelector('#howto-img') as HTMLImageElement
  const ph = howtoEl.querySelector('#howto-placeholder') as HTMLDivElement
  const title = howtoEl.querySelector('#howto-title') as HTMLDivElement
  const body = howtoEl.querySelector('#howto-body') as HTMLDivElement
  const pager = howtoEl.querySelector('#howto-pager') as HTMLDivElement
  const prev = howtoEl.querySelector('#howto-prev') as HTMLButtonElement
  const next = howtoEl.querySelector('#howto-next') as HTMLButtonElement
  // まず画像を試し、無ければプレースホルダー（説明文のみ）に切り替える
  img.style.display = ''
  ph.style.display = 'none'
  // 画像はwebp（本人の標準フォーマット。PNG比で約1/13のサイズ。2026-07-25にpngから変更）
  img.src = `assets/howto/howto_${howtoPage + 1}.webp`
  title.textContent = `${howtoPage + 1}. ${page.title}`
  body.textContent = page.body
  // ページ数は「何分の何」を右下に大きく（本人指示: 見やすい位置・それなりの大きさ）
  pager.textContent = `${howtoPage + 1} / ${HOWTO_PAGES.length}`
  prev.style.visibility = howtoPage === 0 ? 'hidden' : 'visible'
  // 最終ページは「はじめる」に切り替え、押すとビューアを閉じてゲーム本編へ戻る（本人指示）
  next.textContent = last ? '始める！' : '次へ ▶'
  next.style.background = last ? 'rgba(140,80,30,0.9)' : 'rgba(20,15,10,0.75)'
}

function howtoAdvance() {
  if (howtoPage === HOWTO_PAGES.length - 1) {
    closeHowto() // 最終ページの「はじめる」＝ゲーム本編へ戻る
  } else {
    howtoPage++
    renderHowtoPage()
  }
}

function openHowto() {
  if (!howtoEl) {
    howtoEl = document.createElement('div')
    howtoEl.id = 'howto'
    howtoEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); z-index: 40;
    `
    howtoEl.innerHTML = `
      <div id="howto-panel" style="
        position: relative;
        background: rgba(34,26,18,0.96); border: 3px solid #8a6a3a; border-radius: 12px;
        padding: 18px 22px; width: min(640px, 92vw);
        font-family: monospace; color: #f2e6c8; text-align: center;
      ">
        <button id="howto-close" title="閉じる（ゲームに戻る）" style="
          position: absolute; top: -14px; right: -14px; width: 40px; height: 40px;
          font-size: 20px; line-height: 1; font-family: monospace; font-weight: bold;
          background: rgba(90,24,24,0.95); color: #fff2f0; border: 2px solid #e8b4b4;
          border-radius: 50%; cursor: pointer;">✕</button>
        <div style="position: relative; width: 100%; aspect-ratio: 4 / 3; background: rgba(20,15,10,0.6);
             border: 2px solid #6a4f2a; border-radius: 8px; overflow: hidden; margin-bottom: 12px;">
          <img id="howto-img" style="width: 100%; height: 100%; object-fit: cover;" alt="">
          <div id="howto-placeholder" style="display: none; position: absolute; inset: 0;
               align-items: center; justify-content: center; font-size: 15px; color: #b8a888;">
            （イラストじゅんびちゅう）
          </div>
          <!-- イラストの上に重ねるタイトル帯（左上・木札風） -->
          <div id="howto-title" style="position: absolute; top: 0; left: 0;
               max-width: 78%; padding: 8px 20px 10px 16px;
               background: linear-gradient(105deg, rgba(58,34,18,0.92) 82%, rgba(58,34,18,0) 100%);
               border-bottom: 2px solid rgba(255,214,150,0.5);
               font-size: 22px; font-weight: bold; color: #ffe9c0; text-align: left;
               text-shadow: 0 2px 4px rgba(0,0,0,0.8);"></div>
          <!-- イラストの上に重ねる説明文（下部・半透明帯） -->
          <div id="howto-body" style="position: absolute; bottom: 0; left: 0; right: 0;
               padding: 14px 18px 16px;
               background: linear-gradient(to top, rgba(18,12,6,0.92) 0%, rgba(18,12,6,0.82) 62%, rgba(18,12,6,0) 100%);
               font-size: 16px; line-height: 1.7; text-align: left; color: #fff4e0;
               white-space: pre-wrap; text-shadow: 0 2px 4px rgba(0,0,0,0.9);"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <button id="howto-prev" style="font-size: 18px; font-family: monospace; padding: 8px 18px;
            background: rgba(20,15,10,0.75); color: #f2e6c8; border: 2px solid #8a6a3a;
            border-radius: 8px; cursor: pointer;">◀ 前へ</button>
          <button id="howto-next" style="font-size: 18px; font-family: monospace; font-weight: bold;
            padding: 8px 22px; background: rgba(20,15,10,0.75); color: #f2e6c8;
            border: 2px solid #8a6a3a; border-radius: 8px; cursor: pointer;">次へ ▶</button>
          <span id="howto-pager" style="margin-left: auto; font-size: 28px; font-weight: bold;
            color: #ffd9a0; letter-spacing: 2px;"></span>
        </div>
      </div>
    `
    document.body.appendChild(howtoEl)
    const img = howtoEl.querySelector('#howto-img') as HTMLImageElement
    img.addEventListener('error', () => {
      img.style.display = 'none'
      const ph = howtoEl!.querySelector('#howto-placeholder') as HTMLDivElement
      ph.style.display = 'flex'
    })
    howtoEl.querySelector('#howto-prev')!.addEventListener('click', () => {
      if (howtoPage > 0) { howtoPage--; renderHowtoPage() }
    })
    howtoEl.querySelector('#howto-next')!.addEventListener('click', () => howtoAdvance())
    howtoEl.querySelector('#howto-close')!.addEventListener('click', () => closeHowto())
  }
  howtoEl.style.display = 'flex'
  if (!howtoOpen) {
    howtoOpen = true
    howtoPage = 0
    // 表示中は移動・他ボタンのキー入力を全部ここで握る（lockGameInputが後ろのゲームへ渡さない）。
    // ←→でページ送り、Space/Enterは「つぎ／はじめる」と同じ、Escは✕と同じ
    lockGameInput((e) => {
      if (e.code === 'Escape') closeHowto()
      else if (e.code === 'ArrowLeft') {
        if (howtoPage > 0) { howtoPage--; renderHowtoPage() }
      } else if (e.code === 'ArrowRight' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        howtoAdvance()
      }
    })
  }
  renderHowtoPage()
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
          <div style="margin-top: 10px; font-size: 13px; color: #a89468;">画面のどこかをクリック／SPACEキーで閉じる</div>
        </div>
      </div>
    `
    openKusuriCard()
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
        <div style="margin-top: 14px; font-size: 18px; color: #d8c8a8;">使う生薬（しょうやく）: ${costRow}</div>
        <div style="margin-top: 12px; font-size: 20px; line-height: 1.6;">${r.desc}</div>
        <div style="margin-top: 14px; font-size: 14px; color: #a89468;">画面のどこかをクリック／SPACEキーで閉じる</div>
      </div>
    </div>
  `
  openKusuriCard()
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

let overlayKeyGuard: ((e: KeyboardEvent) => void) | null = null
// 開いているオーバーレイのスタック。各要素は「そのオーバーレイがキー入力で閉じたい場合の処理」
// （不要ならnull）。入れ子になったときは一番上（最後に開いたもの）だけがキーを受け取る
const overlayKeyHandlers: (((e: KeyboardEvent) => void) | null)[] = []

// GridScene.update()から参照（オーバーレイ表示中はSPACE等のゲーム内アクションを無視するため）
export function isOverlayOpen(): boolean {
  return overlayKeyHandlers.length > 0
}

function lockGameInput(onKey?: (e: KeyboardEvent) => void) {
  overlayKeyHandlers.push(onKey ?? null)
  if (overlayKeyGuard) return
  overlayKeyGuard = (e: KeyboardEvent) => {
    // キー入力はここで握りつぶし、後ろのゲームへ渡さない。
    // そのうえで、キーで閉じたいオーバーレイ（解説カードなど）にだけ処理を回す
    e.stopPropagation()
    e.preventDefault()
    overlayKeyHandlers[overlayKeyHandlers.length - 1]?.(e)
  }
  window.addEventListener('keydown', overlayKeyGuard, true)
}

function unlockGameInput() {
  overlayKeyHandlers.pop()
  if (overlayKeyHandlers.length > 0 || !overlayKeyGuard) return
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
  playSfx('confirm') // 調合台を調べた決定音
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

  // 未解放ステージの生薬を使う処方はネタバレになるため、名前も材料も明かさず「？」の
  // シークレット枠として表示する（2026-07-27本人指示）。一度でも調合済みならそれ以降は解放扱い
  const rows = RECIPES.map((r) => {
    if (!recipeVisibleInUi(r)) {
      return `
        <div style="
          display: flex; align-items: center; gap: 16px;
          padding: 10px 16px; border: 2px solid #5a4c34;
          border-radius: 8px; opacity: 0.55;
          background: rgba(40,30,18,0.6);
        ">
          <img src="assets/items/kusuri/kusuri_unknown.png" style="height: 64px; image-rendering: pixelated;">
          <div style="font-size: 22px; font-weight: bold;">？？？？？</div>
        </div>`
    }
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
let questChoiceOpen = false

// 二重にunlockしないよう、開いているときだけ閉じる（2つの選択肢とタイトル復帰の両方から呼ばれる）
function closeQuestChoice() {
  if (!questChoiceOpen) return
  questChoiceOpen = false
  if (questChoiceEl) questChoiceEl.style.display = 'none'
  unlockGameInput()
}

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
  const close = () => closeQuestChoice()
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
  if (!questChoiceOpen) {
    questChoiceOpen = true
    lockGameInput()
  }
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
    playSfx('compound') // 調合成功のファンファーレ（ムービー終了・スキップの両方で鳴る）
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

// ── 季節の門解放カットイン（2026-07-27本人指示） ──────────
// 門の解放を下部メッセージだけで伝えると見落とされやすいため、開いた門の向こうに次の季節の
// ステージが見える横長イラスト（3:2・人物なし）をフェードインで挟む。クリック/キーでスキップ可、
// 操作がなくても一定時間で自動終了。画像が未配置（読み込み失敗）のときはカットインを
// スキップして従来どおりの遷移だけを行う（プロンプト正本: assets_prompts/演出_季節の門解放.md）
let gateCutinEl: HTMLDivElement | null = null
let gateCutinOpen = false

export function isGateCutinOpen(): boolean {
  return gateCutinOpen
}

export function showSeasonGateCutin(season: 'summer' | 'autumn' | 'winter', onEnd: () => void) {
  if (!gateCutinEl) {
    gateCutinEl = document.createElement('div')
    gateCutinEl.id = 'gate-cutin'
    gateCutinEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.85); z-index: 40; cursor: pointer;
      opacity: 0; transition: opacity 0.45s ease;
    `
    document.body.appendChild(gateCutinEl)
  }
  const el = gateCutinEl

  gateCutinOpen = true
  let finished = false
  let autoTimer: number | undefined
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    finish()
  }
  const finish = () => {
    if (finished) return
    finished = true
    gateCutinOpen = false
    window.clearTimeout(autoTimer)
    window.removeEventListener('keydown', onKeyDown, true)
    el.style.opacity = '0'
    window.setTimeout(() => {
      el.style.display = 'none'
      el.innerHTML = ''
      onEnd()
    }, 450)
  }

  const labels = { summer: '夏の里への道がひらけた！', autumn: '秋の里への道がひらけた！', winter: '冬の里への道がひらけた！' }
  el.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 14px;">
      <img src="assets/effects/gate_${season}.webp" style="
        width: min(720px, 88vw); aspect-ratio: 3/2; object-fit: cover;
        border: 4px solid #c9a24a; border-radius: 6px; background: #000;
      ">
      <div style="font-family: monospace; font-size: 26px; font-weight: bold; color: #ffe9a8;
        text-shadow: 0 2px 6px rgba(0,0,0,0.8);">${labels[season]}</div>
    </div>
  `
  const img = el.querySelector('img')!
  // 画像がまだ用意されていない間はカットイン自体を出さずに即遷移する
  img.addEventListener('error', () => finish())
  el.addEventListener('click', finish, { once: true })
  window.addEventListener('keydown', onKeyDown, true)
  el.style.display = 'flex'
  playSfx('gate') // 重い門のゴゴゴ（カットインの表示と同時）
  requestAnimationFrame(() => { el.style.opacity = '1' })
  autoTimer = window.setTimeout(finish, 3200)
}

// フィナーレ冒頭のガッツポーズカットイン（2026-08-01追加）。全依頼完遂のファンファーレと同時に、
// 青空バックで両手を突き上げるトリカの3:2一枚絵（assets/effects/finale_torika.webp）を挟む。
// 門カットインと同じ挙動（クリック/キーでスキップ・一定時間で自動終了・画像未配置ならスキップ）
export function showFinaleCutin(onEnd: () => void) {
  if (!gateCutinEl) {
    gateCutinEl = document.createElement('div')
    gateCutinEl.id = 'gate-cutin'
    gateCutinEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.85); z-index: 40; cursor: pointer;
      opacity: 0; transition: opacity 0.45s ease;
    `
    document.body.appendChild(gateCutinEl)
  }
  const el = gateCutinEl

  gateCutinOpen = true
  let finished = false
  let autoTimer: number | undefined
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    finish()
  }
  const finish = () => {
    if (finished) return
    finished = true
    gateCutinOpen = false
    window.clearTimeout(autoTimer)
    window.removeEventListener('keydown', onKeyDown, true)
    el.style.opacity = '0'
    window.setTimeout(() => {
      el.style.display = 'none'
      el.innerHTML = ''
      onEnd()
    }, 450)
  }

  el.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 14px;">
      <img src="assets/effects/finale_torika.webp" style="
        width: min(720px, 88vw); aspect-ratio: 3/2; object-fit: cover;
        border: 4px solid #c9a24a; border-radius: 6px; background: #000;
      ">
      <div style="font-family: monospace; font-size: 26px; font-weight: bold; color: #ffe9a8;
        text-shadow: 0 2px 6px rgba(0,0,0,0.8);">すべての依頼を達成した！</div>
    </div>
  `
  const img = el.querySelector('img')!
  img.addEventListener('error', () => finish())
  el.addEventListener('click', finish, { once: true })
  window.addEventListener('keydown', onKeyDown, true)
  el.style.display = 'flex'
  requestAnimationFrame(() => { el.style.opacity = '1' })
  autoTimer = window.setTimeout(finish, 3600)
}

// フィナーレ一枚絵（2026-08-01追加）。全依頼完遂のフィナーレ会話が閉じた直後に、
// 作者からの感謝イラスト（3:4縦・assets/effects/finale_last.webp）を全画面で表示する。
// 門カットインと同じオーバーレイ要素・入力ロックを使い回すが、こちらは自動では閉じない
// （一度しか見られない一枚なので、プレイヤーが好きなだけ眺めてクリック/キーで閉じる）。
// 画像未配置（読み込み失敗）のときは何も出さずに終了する
export function showFinaleIllust(onEnd?: () => void) {
  if (!gateCutinEl) {
    gateCutinEl = document.createElement('div')
    gateCutinEl.id = 'gate-cutin'
    gateCutinEl.style.cssText = `
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.85); z-index: 40; cursor: pointer;
      opacity: 0; transition: opacity 0.45s ease;
    `
    document.body.appendChild(gateCutinEl)
  }
  const el = gateCutinEl

  gateCutinOpen = true
  let finished = false
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    finish()
  }
  const finish = () => {
    if (finished) return
    finished = true
    gateCutinOpen = false
    window.removeEventListener('keydown', onKeyDown, true)
    el.style.opacity = '0'
    window.setTimeout(() => {
      el.style.display = 'none'
      el.innerHTML = ''
      onEnd?.()
    }, 450)
  }

  el.innerHTML = `
    <img src="assets/effects/finale_last.webp" style="
      height: min(88vh, 1100px); max-width: 92vw; object-fit: contain;
      border: 4px solid #c9a24a; border-radius: 6px; background: #000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    ">
  `
  const img = el.querySelector('img')!
  img.addEventListener('error', () => finish())
  el.addEventListener('click', finish, { once: true })
  window.addEventListener('keydown', onKeyDown, true)
  el.style.display = 'flex'
  requestAnimationFrame(() => { el.style.opacity = '1' })
}

// イントロで「遊び方」ボタンを指す上向き矢印の表示切り替え
export function setHowtoGuideArrow(show: boolean) {
  if (howtoGuideArrowEl) howtoGuideArrowEl.style.display = show ? 'block' : 'none'
}

// タイトルに戻る確認（2026-08-03本人指示）。誤操作でプレイ中断しないよう必ず一度確認する。
// 初期フォーカスは「やめる」側（タイトルのスロット削除確認と同じ流儀）
function openTitleConfirm() {
  if (titleConfirmEl) return
  const el = document.createElement('div')
  titleConfirmEl = el
  el.id = 'title-confirm'
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 45; display: flex;
    align-items: center; justify-content: center;
    background: rgba(0,0,0,0.7); font-family: monospace;
  `
  el.innerHTML = `
    <div style="
      background: rgba(38,24,12,0.96); border: 3px solid #c9a24a; border-radius: 12px;
      padding: 24px 30px; display: flex; flex-direction: column; gap: 16px;
      align-items: center; max-width: min(460px, 90vw); text-align: center;
    ">
      <div style="font-size: 22px; color: #f2e6c8; line-height: 1.6;">本当に戻りますか？</div>
      <div style="font-size: 14px; color: #c8b088;">ここまでの記録は自動で保存されています</div>
      <div style="display: flex; gap: 14px; flex-wrap: wrap; justify-content: center;">
        <button data-cancel style="
          font-family: monospace; font-size: 19px; color: #f2e6c8;
          background: transparent; border: 2px solid #e8c86a; border-radius: 8px;
          padding: 8px 24px; cursor: pointer;">やめる</button>
        <button data-ok style="
          font-family: monospace; font-size: 19px; color: #f2e6c8;
          background: transparent; border: 2px solid #8a6a3a; border-radius: 8px;
          padding: 8px 24px; cursor: pointer;">タイトルに戻る</button>
      </div>
    </div>
  `
  const close = () => {
    el.remove()
    titleConfirmEl = null
    window.removeEventListener('keydown', onKey, true)
  }
  // キー入力はキャプチャで奪い、裏のゲーム操作へ通さない
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.key === 'Escape') close()
  }
  el.querySelector('[data-cancel]')?.addEventListener('click', close)
  el.querySelector('[data-ok]')?.addEventListener('click', () => {
    close()
    returnToTitleHandler?.()
  })
  el.addEventListener('click', (e) => {
    if (e.target === el) close() // 背景クリックは「やめる」扱い
  })
  window.addEventListener('keydown', onKey, true)
  document.body.appendChild(el)
}

function closeTitleConfirm() {
  titleConfirmEl?.remove()
  titleConfirmEl = null
}

function refreshSoundButton() {
  if (!soundBtn) return
  soundBtn.textContent = options.masterVolume >= 1 ? '🔊' : options.masterVolume >= 0.5 ? '🔉' : '🔇'
  soundBtn.title = `音量: ${Math.round(options.masterVolume * 100)}%`
}

function refreshSeButton() {
  if (!seBtn) return
  seBtn.textContent = options.seVolume >= 1 ? 'SE🔊' : options.seVolume >= 0.5 ? 'SE🔉' : 'SE🔇'
  seBtn.title = `効果音: ${Math.round(options.seVolume * 100)}%`
}

// タイトル画面ではHUDを隠し、ゲーム開始時に表示する
export function setHudVisible(visible: boolean) {
  const display = visible ? '' : 'none'
  if (hudEl) hudEl.style.display = display
  if (messageEl) messageEl.style.display = display
  if (soundBtn) soundBtn.style.display = display // 音量ボタンもゲーム中のみ表示（タイトルはオプションで調整）
  if (seBtn) seBtn.style.display = display // 効果音ボタンも同様
  if (titleBtn) titleBtn.style.display = display // タイトルに戻るボタンも同様
  if (howtoBtn) howtoBtn.style.display = display // 遊び方ボタンも同様
  // 「作った人」ボタンだけはタイトル画面でも消さない（2026-08-04本人指示・常時表示の導線）。
  // ただしカードは閉じる。開いたままタイトルへ戻ると入力ロックが残り、キーが一切効かなくなる
  if (!visible) closeAuthorCard()
  if (!visible) closeTitleConfirm() // タイトルへ戻るとき確認ダイアログの取り残しも防ぐ
  if (!visible) setHowtoGuideArrow(false) // タイトルへ戻るとき矢印も消す
  if (!visible) showTalkHint(null) // タイトルへ戻るとき話しかけヒントも消す
  if (!visible) closeKusuriCard() // タイトルへ戻るとき解説カードも閉じる（入力ロックも解除する）
  if (!visible) closeHowto() // 遊び方ビューアも同様（lockの取り残し防止）
  // タイトルへ戻るときは各ウインドウも閉じる。display操作を直書きすると入力ロックが
  // 解除されないまま残り、以後キーボードが一切効かなくなるので必ず専用のclose関数を通す
  if (!visible) {
    closeRecipePicker()
    closeGiftPicker()
    closeQuestChoice()
  }
  if (!visible && compoundEl) { compoundEl.style.display = 'none'; compoundEl.innerHTML = ''; movieOpen = false }
  if (!visible && gateCutinEl) { gateCutinEl.style.display = 'none'; gateCutinEl.innerHTML = ''; gateCutinOpen = false }
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
  // 2026-07-27修正: 従来は「夏が開いたら春以外を全種表示」になっており、夏解放の時点で
  // 秋・冬の生薬までHUDに並んでしまっていた。種類ごとに自分のステージの解放状態を見る
  return (Object.keys(KIND_STAGE) as SeedKind[]).filter(
    (k) => KIND_STAGE[k] === 'spring' || stageUnlocks[KIND_STAGE[k] as 'summer' | 'autumn' | 'winter'],
  )
}

export function updateHud() {
  if (!hudEl) return
  // 全処方コンプ＝裏話の解放を、到達した調合の直後に一度だけ知らせる（2026-07-26）。
  // 何も言わずに解放すると、ランダムな世間話に混ざって気づかれないまま終わる
  if (takeUrabanashiUnlockNotice()) {
    showToast('すべての処方を覚えた！', 'assets/items/kusuri/kusuri_kanbakutaisouto.png')
    showMessage('里のみんなが、あなたに聞かせたい話があるようだ……。もう一度、みんなに話しかけてみよう！')
  }
  const s = gameState
  const kinds = visibleKinds()
  const seedRow = kinds.map((k) => `${icon(`assets/items/seed_bag_${k}.png`)}${s.seeds[k]}`).join('')
  const medalRow = kinds.map((k) => `${icon(`assets/items/medal_${k}.png`)}${s.medals[k]}`).join('')
  // 薬はアイコンのみ（§9-9）。一度でも調合したことがあればクリックで解説カード（所持数0でも図鑑として残す・2026-07-21〜）、
  // 未調合=グレーの「?」（収集要素）。所持数の増減はkusuriCountsだが、表示の可否はkusuriEverObtainedで判定する。
  // 未到達の季節の処方は「?」枠ごと出さない（2026-07-27修正。種・メダル欄と同じく到達に応じて伸びる）
  const kusuriRow = RECIPES.filter(recipeVisibleInUi).map((r) => {
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

// 話しかけヒント（2026-08-03本人指示）: NPCの隣のマスに来たら「〇〇と話す（Space）」を
// 画面下部に常時表示する（離れたら消える）。下端の一時メッセージ（showMessage）と
// 重ならないよう、少し上に置く。表示のON/OFFはGridScene側が毎フレーム判定して呼ぶ。
// 配色は季節の魔法陣に合わせる（同日本人指示: 春=ピンク・夏=青・秋=黄・冬=緑。イズナだけ白黒）
export type TalkHintTheme = 'spring' | 'summer' | 'autumn' | 'winter' | 'mono'
const TALK_HINT_THEMES: Record<TalkHintTheme, { bg: string; border: string; text: string }> = {
  spring: { bg: 'rgba(88, 24, 40, 0.88)', border: '#ff9ed0', text: '#ffd9e2' },
  summer: { bg: 'rgba(14, 42, 78, 0.88)', border: '#7fd4ff', text: '#dff4ff' },
  autumn: { bg: 'rgba(84, 54, 10, 0.88)', border: '#ffd97a', text: '#ffedc0' },
  winter: { bg: 'rgba(12, 62, 44, 0.88)', border: '#8ff0c8', text: '#dcffee' },
  mono: { bg: 'rgba(28, 28, 28, 0.9)', border: '#e8e8e8', text: '#f5f5f5' },
}
let talkHintEl: HTMLDivElement | null = null

export function showTalkHint(name: string | null, theme: TalkHintTheme = 'spring') {
  if (!talkHintEl) {
    talkHintEl = document.createElement('div')
    talkHintEl.id = 'talk-hint'
    talkHintEl.style.cssText = `
      position: fixed; bottom: 84px; left: 50%; transform: translateX(-50%);
      font-family: monospace; font-size: 22px; font-weight: bold;
      padding: 6px 22px; border-radius: 18px; border: 2px solid;
      pointer-events: none; display: none; white-space: nowrap;
    `
    document.body.appendChild(talkHintEl)
  }
  if (!name) {
    talkHintEl.style.display = 'none'
    return
  }
  const t = TALK_HINT_THEMES[theme]
  talkHintEl.style.background = t.bg
  talkHintEl.style.borderColor = t.border
  talkHintEl.style.color = t.text
  talkHintEl.textContent = `💬 ${name}と話す（Space）`
  talkHintEl.style.display = 'block'
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
