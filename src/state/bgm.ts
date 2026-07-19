import Phaser from 'phaser'
import { options } from './options'

// BGM管理（2026-07-18実装）。曲はSUNO制作、元WAVはDドライブ正本から
// ogg/m4aへ変換して public/assets/bgm/ に収録。
//
// サウンドはPhaserのグローバルSoundManagerに属してシーンをまたいで生き続けるため、
// 「同じ曲がすでに再生中なら何もしない」だけで、工房⇔工房のワープ
// （同一シーンへの再入場・将来の季節工房間転送）でもBGMが途切れない。

let current: Phaser.Sound.BaseSound | null = null
let currentKey: string | null = null

export function playBgm(scene: Phaser.Scene, key: string) {
  if (currentKey === key && current?.isPlaying) return // 同じ曲は流しっぱなし（ワープ対応の要）
  stopBgm()
  const sound = scene.sound.add(key, { loop: true, volume: options.bgmVolume })
  current = sound
  currentKey = key
  // ブラウザの自動再生制限: 最初のクリック/キー入力（unlock）後に再生を開始する
  if (scene.sound.locked) {
    scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
      if (current === sound) sound.play()
    })
  } else {
    sound.play()
  }
}

export function stopBgm() {
  if (current) {
    current.stop()
    current.destroy()
  }
  current = null
  currentKey = null
}

// オプションのBGM音量を再生中の曲へ即時反映する（master音量はmain.tsがSoundManager全体に掛ける）
export function applyBgmVolume() {
  if (current && 'setVolume' in current) {
    ;(current as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume(options.bgmVolume)
  }
}
