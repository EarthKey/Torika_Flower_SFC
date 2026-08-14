import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { TitleScene } from './scenes/TitleScene'
import { HomeScene } from './scenes/HomeScene'
import { SeedFieldScene } from './scenes/SeedFieldScene'
import { WorkshopScene } from './scenes/WorkshopScene'
import { SummerHomeScene } from './scenes/SummerHomeScene'
import { SummerSeedFieldScene } from './scenes/SummerSeedFieldScene'
import { SummerWorkshopScene } from './scenes/SummerWorkshopScene'
import { AutumnHomeScene } from './scenes/AutumnHomeScene'
import { AutumnSeedFieldScene } from './scenes/AutumnSeedFieldScene'
import { AutumnWorkshopScene } from './scenes/AutumnWorkshopScene'
import { WinterHomeScene } from './scenes/WinterHomeScene'
import { WinterSeedFieldScene } from './scenes/WinterSeedFieldScene'
import { WinterWorkshopScene } from './scenes/WinterWorkshopScene'
import { mountHud, setHudVisible, setReturnToTitleHandler } from './ui/hud'
import { mountDialogue, preloadFace } from './ui/dialogue'

mountHud()
setHudVisible(false) // タイトル画面の間は隠す（ゲーム開始時にTitleSceneが表示する）
mountDialogue()

// 顔グラの全量先読み（2026-08-05）。会話を開いた瞬間の顔グラ表示ラグ対策の第二段。
// ページの読み込みが落ち着いてから、空き時間に全キャラ×全表情をHTTPキャッシュへ乗せる。
// 柴・猫又だけ変化（人間形態）ぶんの10〜12番まである
window.addEventListener('load', () => {
  window.setTimeout(() => {
    const charas = [
      'torika', 'izuna', 'sakuya', 'xiaolan', 'nemu', 'janome', 'aum',
      'ibuki', 'shiba', 'nekomata', 'benten', 'anne', 'yui', 'hayate',
    ]
    for (const c of charas) {
      const max = c === 'shiba' || c === 'nekomata' ? 12 : 9
      for (let f = 1; f <= max; f++) preloadFace(c, f)
    }
  }, 1500)
})

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960, // 春の里（30×22マス）が1画面に収まるサイズ
  height: 704,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    TitleScene,
    HomeScene,
    SeedFieldScene,
    WorkshopScene,
    SummerHomeScene,
    SummerSeedFieldScene,
    SummerWorkshopScene,
    AutumnHomeScene,
    AutumnSeedFieldScene,
    AutumnWorkshopScene,
    WinterHomeScene,
    WinterSeedFieldScene,
    WinterWorkshopScene,
  ],
})

// HUDの「タイトルに戻る」（2026-08-03）。今動いているシーンを止めてTitleSceneへ。
// HUDはDOMだけを持つ設計なので、Phaser側の処理はここで注入する
setReturnToTitleHandler(() => {
  setHudVisible(false)
  const active = game.scene.getScenes(true).filter((s) => s.scene.key !== 'TitleScene')
  for (const s of active) s.scene.stop()
  game.scene.start('TitleScene')
})

// 音量設定をPhaserのサウンドマネージャへ反映。master=SoundManager全体、BGM=再生中の曲個別
import { options } from './state/options'
import { applyBgmVolume } from './state/bgm'
const applyVolume = () => {
  game.sound.volume = options.masterVolume
  game.sound.mute = options.masterVolume === 0
  applyBgmVolume()
}
applyVolume()
window.addEventListener('torikka-volume-changed', applyVolume)

// ── 表示領域の変化にゲーム画面を追随させる（2026-08-14・本人の実機評で追加）─────────
// 症状: スマホでURLバーを出すと、ゲーム画面の上が見切れた。
// 原因: bodyは 100dvh なのでCSS側の高さはURLバーの出入りで変わるが、
//       そのときブラウザが window の resize を発火しないことがある（特にiOS Safari）。
//       Phaser.Scale.FIT は resize を受けて測り直す仕組みなので、実測値が古いまま残り、
//       canvas が実際の表示領域より大きいまま中央寄せされて上下がはみ出す。
// 対処: visualViewport（実際に見えている領域）の変化を拾って scale.refresh() を呼び、測り直させる。
//       スクロール中に毎回走らせると重いので requestAnimationFrame で1フレームに1回へ間引く。
let refreshQueued = false
const refreshScale = () => {
  if (refreshQueued) return
  refreshQueued = true
  requestAnimationFrame(() => {
    refreshQueued = false
    game.scale.refresh()
  })
}
const vv = window.visualViewport
if (vv) {
  vv.addEventListener('resize', refreshScale)
  vv.addEventListener('scroll', refreshScale) // URLバーの出入りはscroll側で来ることがある
}
window.addEventListener('orientationchange', () => setTimeout(refreshScale, 200)) // 回転は確定まで待つ
