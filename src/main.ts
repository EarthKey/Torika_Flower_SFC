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
import { mountDialogue } from './ui/dialogue'

mountHud()
setHudVisible(false) // タイトル画面の間は隠す（ゲーム開始時にTitleSceneが表示する）
mountDialogue()

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
