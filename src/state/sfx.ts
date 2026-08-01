// 効果音（2026-07-27本人決定・6種の最小セット）。
// 外部音源ファイルを使わず、Web Audio APIの波形合成でチップチューン風のSEをその場で鳴らす。
// SFC風のドット絵世界観に合わせた合成音で、音色の調整はこのファイルの数値だけで済む。
// 音量は options.masterVolume × options.seVolume を再生のたびに読む（事前のノード共有は不要）。
//
// 種類: confirm(決定・話しかけ) / get(種・メダル・薬の獲得) / plant(種植え) /
//       compound(調合成功ファンファーレ) / gate(季節の門の解放) / fortune(花占い) /
//       finale(全依頼完遂のフィナーレ・一度きり)

import { options } from './options'

let ctx: AudioContext | null = null

// AudioContextはユーザー操作起点でないと再生できないブラウザがあるため、初回再生時に遅延生成する
function audioCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // Web Audio非対応環境では黙って無音（ゲーム進行は妨げない）
  }
}

function volume(): number {
  // ×1.1は2026-07-27本人指示「各種SE音は10%ぐらい上げていい」。個別のgainは触らず一括で底上げする
  return options.masterVolume * options.seVolume * 1.1
}

// 単音: 指定波形・周波数（開始→終了へスライド）・長さで、アタック極短＋指数減衰のエンベロープ
function tone(
  ac: AudioContext,
  master: GainNode,
  wave: OscillatorType,
  freqFrom: number,
  freqTo: number,
  startSec: number,
  durSec: number,
  gain: number,
) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  const t0 = ac.currentTime + startSec
  osc.type = wave
  osc.frequency.setValueAtTime(freqFrom, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + durSec)
  env.gain.setValueAtTime(0, t0)
  env.gain.linearRampToValueAtTime(gain, t0 + 0.005)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec)
  osc.connect(env).connect(master)
  osc.start(t0)
  osc.stop(t0 + durSec + 0.02)
}

// ノイズ: ホワイトノイズをフィルタに通して短く鳴らす（土音・紙音・地響き用）
function noise(
  ac: AudioContext,
  master: GainNode,
  filterType: BiquadFilterType,
  filterFreq: number,
  startSec: number,
  durSec: number,
  gain: number,
) {
  const len = Math.ceil(ac.sampleRate * durSec)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = filterFreq
  const env = ac.createGain()
  const t0 = ac.currentTime + startSec
  env.gain.setValueAtTime(0, t0)
  env.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec)
  src.connect(filter).connect(env).connect(master)
  src.start(t0)
}

export type SfxKind = 'confirm' | 'get' | 'plant' | 'compound' | 'gate' | 'fortune' | 'finale' | 'volumeCheck'

export function playSfx(kind: SfxKind) {
  const vol = volume()
  if (vol <= 0) return
  const ac = audioCtx()
  if (!ac) return
  const master = ac.createGain()
  master.gain.value = vol
  master.connect(ac.destination)

  switch (kind) {
    case 'confirm':
      // 短いポン（決定・話しかけ）
      tone(ac, master, 'square', 660, 880, 0, 0.07, 0.16)
      break
    case 'get':
      // キラッとした獲得アルペジオ（C6→E6→G6）
      tone(ac, master, 'square', 1047, 1047, 0, 0.06, 0.14)
      tone(ac, master, 'square', 1319, 1319, 0.055, 0.06, 0.14)
      tone(ac, master, 'square', 1568, 1568, 0.11, 0.1, 0.14)
      tone(ac, master, 'sine', 3136, 3136, 0.11, 0.12, 0.06)
      break
    case 'plant':
      // 土のポスッ（低いノイズ＋沈む音程）
      noise(ac, master, 'lowpass', 500, 0, 0.09, 0.3)
      tone(ac, master, 'sine', 200, 80, 0, 0.12, 0.25)
      break
    case 'compound':
      // 調合成功の短いファンファーレ（C5-E5-G5→C6の和音）
      tone(ac, master, 'square', 523, 523, 0, 0.09, 0.12)
      tone(ac, master, 'square', 659, 659, 0.09, 0.09, 0.12)
      tone(ac, master, 'square', 784, 784, 0.18, 0.09, 0.12)
      tone(ac, master, 'square', 1047, 1047, 0.27, 0.32, 0.13)
      tone(ac, master, 'triangle', 523, 523, 0.27, 0.32, 0.1)
      tone(ac, master, 'triangle', 659, 659, 0.27, 0.32, 0.08)
      break
    case 'gate': {
      // 重い門のゴゴゴゴ（2026-07-27本人指示で作り直し）。共通のtone/noiseはアタックが数msで
      // 短く減衰するため「ブツッ」と聞こえていた。門専用に、ゆっくり立ち上がって1.6秒揺れ続ける
      // 地響き＋石がこすれる中域ノイズ＋最後に「ドン」と閉まる打撃音のエンベロープを組む
      const t0 = ac.currentTime
      const DUR = 1.6
      // 低い地響きノイズ（うなりのLFOで音量を揺らし「ゴゴゴゴ」の粒感を出す）
      const len = Math.ceil(ac.sampleRate * DUR)
      const buf = ac.createBuffer(1, len, ac.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      const rumbleSrc = ac.createBufferSource()
      rumbleSrc.buffer = buf
      const rumbleFilter = ac.createBiquadFilter()
      rumbleFilter.type = 'lowpass'
      rumbleFilter.frequency.value = 140
      const rumbleEnv = ac.createGain()
      rumbleEnv.gain.setValueAtTime(0, t0)
      rumbleEnv.gain.linearRampToValueAtTime(0.7, t0 + 0.25) // ゆっくり立ち上がる
      rumbleEnv.gain.setValueAtTime(0.7, t0 + 1.1)
      rumbleEnv.gain.linearRampToValueAtTime(0.0001, t0 + DUR)
      const lfo = ac.createOscillator() // 8Hzの揺らぎ＝ゴ・ゴ・ゴ・ゴの粒
      lfo.frequency.value = 8
      const lfoDepth = ac.createGain()
      lfoDepth.gain.value = 0.3
      lfo.connect(lfoDepth).connect(rumbleEnv.gain)
      rumbleSrc.connect(rumbleFilter).connect(rumbleEnv).connect(master)
      rumbleSrc.start(t0)
      lfo.start(t0)
      lfo.stop(t0 + DUR)
      // 超低音のうねり（体に響く成分）
      const sub = ac.createOscillator()
      sub.type = 'sine'
      sub.frequency.setValueAtTime(52, t0)
      sub.frequency.linearRampToValueAtTime(38, t0 + DUR)
      const subEnv = ac.createGain()
      subEnv.gain.setValueAtTime(0, t0)
      subEnv.gain.linearRampToValueAtTime(0.4, t0 + 0.3)
      subEnv.gain.setValueAtTime(0.4, t0 + 1.0)
      subEnv.gain.linearRampToValueAtTime(0.0001, t0 + DUR)
      sub.connect(subEnv).connect(master)
      sub.start(t0)
      sub.stop(t0 + DUR + 0.05)
      // 石がこすれる中域のざらつき（薄く重ねる）
      noise(ac, master, 'bandpass', 420, 0.2, 1.0, 0.1)
      // 最後の「ドン」（開き切った打撃音）
      tone(ac, master, 'sine', 110, 40, 1.15, 0.4, 0.5)
      noise(ac, master, 'lowpass', 300, 1.15, 0.25, 0.35)
      // 花が咲き開く華やぎ（2026-07-27本人指示で追加）。門が開き切った直後、
      // ハープのグリッサンドのようにペンタトニックを駆け上がり、頂上で高いキラキラが
      // 花びらのように舞う。3回しか聞けないミッション達成の音として祝祭感を足す
      const BLOOM = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760] // Cペンタ2オクターブ
      BLOOM.forEach((freq, i) => {
        const start = 1.3 + i * 0.055
        tone(ac, master, 'sine', freq, freq, start, 0.45, 0.11)
        tone(ac, master, 'triangle', freq * 2, freq * 2, start, 0.3, 0.04) // 倍音の輝き
      })
      // 頂上で花びらが散るキラキラ（高音の鈴を不規則に散らす）
      const SPARKLE = [2637, 3136, 2093, 3520, 2794]
      SPARKLE.forEach((freq, i) => {
        tone(ac, master, 'sine', freq, freq, 1.95 + i * 0.09, 0.5, 0.05)
      })
      break
    }
    case 'finale': {
      // 全依頼完遂のフィナーレ（2026-08-01追加・セーブごとに一度しか鳴らない祝いの音）。
      // 調合ファンファーレを一段ゆったり鳴らしたあと、門の解放と同じ
      // 「花が咲き開く」ペンタトニックの駆け上がり＋花びらのキラキラを続けて重ねる
      tone(ac, master, 'square', 523, 523, 0, 0.1, 0.12)
      tone(ac, master, 'square', 659, 659, 0.1, 0.1, 0.12)
      tone(ac, master, 'square', 784, 784, 0.2, 0.1, 0.12)
      tone(ac, master, 'square', 1047, 1047, 0.3, 0.35, 0.13)
      tone(ac, master, 'triangle', 523, 523, 0.3, 0.35, 0.1)
      tone(ac, master, 'triangle', 784, 784, 0.3, 0.35, 0.08)
      const FINALE_BLOOM = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760] // Cペンタ2オクターブ
      FINALE_BLOOM.forEach((freq, i) => {
        const start = 0.7 + i * 0.055
        tone(ac, master, 'sine', freq, freq, start, 0.45, 0.11)
        tone(ac, master, 'triangle', freq * 2, freq * 2, start, 0.3, 0.04)
      })
      const FINALE_SPARKLE = [2637, 3136, 2093, 3520, 2794]
      FINALE_SPARKLE.forEach((freq, i) => {
        tone(ac, master, 'sine', freq, freq, 1.35 + i * 0.09, 0.5, 0.05)
      })
      break
    }
    case 'fortune':
      // 風鈴のような澄んだ鈴の音（2026-07-27本人指示で紙めくり音から差し替え）。
      // 正弦波の基音＋高い倍音を重ねて、E6→G6→B6の明るいアルペジオを長めの余韻で鳴らす
      tone(ac, master, 'sine', 1319, 1319, 0, 0.35, 0.14)
      tone(ac, master, 'sine', 2637, 2637, 0, 0.25, 0.05)
      tone(ac, master, 'sine', 1568, 1568, 0.12, 0.35, 0.13)
      tone(ac, master, 'sine', 3136, 3136, 0.12, 0.25, 0.05)
      tone(ac, master, 'sine', 1976, 1976, 0.24, 0.5, 0.13)
      tone(ac, master, 'sine', 3951, 3951, 0.24, 0.35, 0.04)
      break
    case 'volumeCheck':
      // SE音量スライダー確認用の試聴音（タイトル画面のオプションで鳴らす・7つ目）。
      // ゲーム中のどのSEとも紛れない、短い上昇2音のシンプルな音
      tone(ac, master, 'square', 784, 784, 0, 0.08, 0.15)
      tone(ac, master, 'square', 1175, 1175, 0.09, 0.12, 0.15)
      break
  }
}
