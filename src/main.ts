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
import { mountHud, setHudVisible } from './ui/hud'
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
  ],
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
