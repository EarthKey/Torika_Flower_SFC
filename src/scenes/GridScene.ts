import Phaser from 'phaser'
import { isDialogueOpen, advanceDialogue, openDialogue } from '../ui/dialogue'
import { pickTalk } from '../state/dialogueData'
import { recordTalk, recordGift, giveKusuri, markQuestDelivered, unlockIzunaStage1Dialogue, type Recipe } from '../state/gameState'
import { activeQuestFor, allStage1QuestsDelivered, hasAnyKusuri, GIFT_TRUST_BONUS, type Quest } from '../state/questData'
import { showMessage, showToast, showGiftPicker, updateHud } from '../ui/hud'
import { options } from '../state/options'

// 3エリア共通の土台。Tiled形式のマップJSON（scripts/make-maps.mjs が生成、
// 将来はTiled GUIで編集）を読み込んで地形を描画し、通行判定つきの
// 4方向グリッド移動と、マス単位の特殊効果（出口・畑・調合台など）を提供する。
// プレイヤーは主人公トリカ（三面図から切り出したスプライト、向き切り替えあり）。

export const TILE = 32

// キャラ（トリカ・NPC共通）の表示高さ。64pxでは少し小さい評だったため1.1倍に（2026-07-17）
const CHAR_HEIGHT = 64 * 1.1

// scripts/make-maps.mjs のタイル並び順と対応（0始まり）。水・木・壁は通行不可
const BLOCKED_TILE_IDS = new Set([3, 4, 6])

export interface CellSpec {
  exit?: { targetScene: string; spawnCol: number; spawnRow: number }
  data?: unknown
  marker?: number // マスに重ねる目印の色（調合台・出口など）
  strokeColor?: number // マスの枠線色（畑の担当作物表示など）
}

// 地形の持ち方は2通り:
// - tiled: Tiled形式JSON（タイルの絵柄はtileset.png）
// - image: コンセプト画をそのまま床に敷き、通行判定はASCIIマスク（'#'=通行不可）で定義
export type Terrain =
  | { type: 'tiled'; mapKey: string }
  | { type: 'image'; textureKey: string; cols: number; rows: number; walkMask: string[] }

export abstract class GridScene extends Phaser.Scene {
  protected cols = 0
  protected rows = 0
  private terrain: Terrain
  private spawnCol: number
  private spawnRow: number

  private player!: Phaser.GameObjects.Image
  protected playerCol = 0 // 派生シーンがNPCとの隣接判定などに使う
  protected playerRow = 0
  private isMoving = false
  // 歩行アニメーション用: 向き・左右反転・歩数の偶奇（接地ポーズ1/3を交互に出す）
  private facingDir: 'front' | 'side' | 'back' = 'front'
  private facingFlip = false
  private stepParity = false

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
  private actionKey!: Phaser.Input.Keyboard.Key

  private walkable: boolean[][] = []
  private specs: Map<string, CellSpec> = new Map()
  // NPC共通処理（待機12コマループ・当たり判定・話しかけ）。addNpc()で登録する
  private npcs: { img: Phaser.GameObjects.Image; chara: string; row: number; col: number; reacting: boolean }[] = []
  private npcFrame = 1
  private npcTimerStarted = false
  private path: { row: number; col: number }[] = []
  // クリック可能なUI要素（本棚の本など）が同じクリックを移動として処理しないための抑制フラグ
  protected suppressClickMove = false
  // Zキーで切り替えるお試しズームモード（2倍・プレイヤー追従）
  private zoomed = false

  constructor(key: string, terrain: Terrain, defaultSpawnCol: number, defaultSpawnRow: number) {
    super(key)
    this.terrain = terrain
    this.spawnCol = defaultSpawnCol
    this.spawnRow = defaultSpawnRow
  }

  // 各シーンが特殊マスを定義する。キーは 'row,col'
  protected abstract specials(): Record<string, CellSpec>
  // プレイヤーが特殊マスに入った瞬間（採取など）
  protected onEnter(_spec: CellSpec, _row: number, _col: number) {}
  // アクションキーを押した瞬間（植える・収穫・調合など）
  protected onAction(_spec: CellSpec | undefined, _row: number, _col: number) {}
  // シーン開始時の案内メッセージなど
  protected onReady() {}

  init(data: { spawnCol?: number; spawnRow?: number }) {
    if (data?.spawnCol !== undefined) this.spawnCol = data.spawnCol
    if (data?.spawnRow !== undefined) this.spawnRow = data.spawnRow
  }

  create() {
    this.cameras.main.setBackgroundColor('#141210')
    this.cameras.main.fadeIn(250, 0, 0, 0) // シーン入場のフェード（§9-2-6）
    this.npcs = [] // シーン再入場時に前回のNPC登録を破棄（タイマーもシーン終了時に破棄済み）
    this.npcTimerStarted = false
    // シーンインスタンスは再利用されるため、遷移時に残った状態を必ずリセットする
    // （フェード遷移でisMoving=trueのまま出るようにした結果、再入場後に動けなくなるバグの対策。2026-07-18）
    this.isMoving = false
    this.path = []
    this.suppressClickMove = false
    this.zoomed = false
    this.buildMap()
    this.buildSpecials()

    this.playerCol = this.spawnCol
    this.playerRow = this.spawnRow
    this.buildPlayer()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.actionKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handleClick(pointer))

    // Zキーでズームモード切り替え（2026-07-18）。2倍ズームでトリカを追従。
    // オプション「画面表示: ズーム」ならシーン開始時からズーム状態にする
    const zoomKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    zoomKey.on('down', () => this.setZoomMode(!this.zoomed, true))
    if (options.zoomDefault) this.setZoomMode(true, false)

    this.onReady()
  }

  // ズームモードの適用（animate=falseなら即時切り替え。シーン開始時用）
  private setZoomMode(on: boolean, animate: boolean) {
    this.zoomed = on
    const cam = this.cameras.main
    if (on) {
      cam.setBounds(0, 0, this.cols * TILE, this.rows * TILE)
      if (animate) cam.zoomTo(2, 250)
      else cam.setZoom(2)
      cam.startFollow(this.player, true, 0.12, 0.12)
    } else {
      cam.stopFollow()
      cam.removeBounds()
      if (animate) {
        cam.zoomTo(1, 250)
        cam.pan((this.cols * TILE) / 2, (this.rows * TILE) / 2, 250)
      } else {
        cam.setZoom(1)
        cam.centerOn((this.cols * TILE) / 2, (this.rows * TILE) / 2)
      }
    }
  }

  private buildMap() {
    if (this.terrain.type === 'tiled') {
      const map = this.cache.json.get(this.terrain.mapKey) as {
        width: number
        height: number
        layers: { data: number[] }[]
      }
      this.cols = map.width
      this.rows = map.height
      const data = map.layers[0].data

      this.walkable = []
      for (let r = 0; r < this.rows; r++) {
        this.walkable[r] = []
        for (let c = 0; c < this.cols; c++) {
          const tileId = data[r * this.cols + c] - 1 // Tiledのgidは1始まり
          this.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2, 'tiles', tileId).setDepth(0)
          this.walkable[r][c] = !BLOCKED_TILE_IDS.has(tileId)
        }
      }
    } else {
      // 一枚絵背景モード: コンセプト画をマップ全域に敷き、通行判定はASCIIマスク
      this.cols = this.terrain.cols
      this.rows = this.terrain.rows
      this.add
        .image(0, 0, this.terrain.textureKey)
        .setOrigin(0, 0)
        .setDisplaySize(this.cols * TILE, this.rows * TILE)
        .setDepth(0)

      const mask = this.terrain.walkMask
      if (mask.length !== this.rows || mask.some((row) => row.length !== this.cols)) {
        throw new Error(`walkMask size mismatch: expected ${this.cols}x${this.rows}`)
      }
      this.walkable = []
      for (let r = 0; r < this.rows; r++) {
        this.walkable[r] = []
        for (let c = 0; c < this.cols; c++) {
          this.walkable[r][c] = mask[r][c] !== '#'
        }
      }
    }

    // マップがキャンバスより小さい場合は中央に表示する
    this.cameras.main.centerOn((this.cols * TILE) / 2, (this.rows * TILE) / 2)
  }

  private buildSpecials() {
    this.specs = new Map(Object.entries(this.specials()))
    for (const [key, spec] of this.specs) {
      const [r, c] = key.split(',').map(Number)
      const x = c * TILE + TILE / 2
      const y = r * TILE + TILE / 2
      if (spec.marker !== undefined) {
        this.add.rectangle(x, y, TILE - 4, TILE - 4, spec.marker, 0.9).setDepth(2)
      }
      if (spec.strokeColor !== undefined) {
        this.add.rectangle(x, y, TILE - 2, TILE - 2).setStrokeStyle(2, spec.strokeColor).setDepth(2)
      }
    }
  }

  protected specAt(row: number, col: number): CellSpec | undefined {
    return this.specs.get(`${row},${col}`)
  }

  // マス上にアイテム画像を重ねる（既定は2×2マス＝64px相当の表示。マス中心に重なる）
  // 指定マスを通行不可にする（NPCなど、マスクの塗りとは別に立ち塞がるものに使う）
  protected blockCell(row: number, col: number) {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      this.walkable[row][col] = false
    }
  }

  // NPCを配置する。待機12コマループ・立ちマスの通行不可・クリック/隣接Spaceでの話しかけ込み
  protected addNpc(chara: string, row: number, col: number) {
    const img = this.add.image(col * TILE + TILE / 2, row * TILE + 2, `${chara}_idle_1`)
    img.setScale(CHAR_HEIGHT / img.height)
    img.setDepth(9)
    img.setInteractive()
    img.on('pointerdown', () => {
      this.suppressClickMove = true
      this.tryTalkTo(chara)
    })
    this.npcs.push({ img, chara, row, col, reacting: false })
    this.blockCell(row, col) // トリカがすり抜けないように

    if (!this.npcTimerStarted) {
      this.npcTimerStarted = true
      this.time.addEvent({
        delay: 117, // 12コマ×117ms=約1.4秒で1ループ（2026-07-17決定）
        loop: true,
        callback: () => {
          this.npcFrame = (this.npcFrame % 12) + 1
          for (const npc of this.npcs) {
            if (!npc.reacting) npc.img.setTexture(`${npc.chara}_idle_${this.npcFrame}`)
          }
        },
      })
    }
  }

  // トリカの隣（上下左右1マス）にいるNPCを返す
  private adjacentNpc() {
    return this.npcs.find((n) => Math.abs(n.row - this.playerRow) + Math.abs(n.col - this.playerCol) === 1)
  }

  // NPCクリック時の話しかけ判定。離れているときは案内だけ出す
  private tryTalkTo(chara: string) {
    if (isDialogueOpen()) return
    const npc = this.npcs.find((n) => n.chara === chara)
    if (!npc) return
    const dist = Math.abs(npc.row - this.playerRow) + Math.abs(npc.col - this.playerCol)
    if (dist !== 1) {
      showMessage('もっと近くまで行って話しかけよう')
      return
    }
    this.startTalk(npc)
  }

  private startTalk(npc: { img: Phaser.GameObjects.Image; chara: string; reacting: boolean }) {
    if (isDialogueOpen() || npc.reacting) return

    // 薬依頼（§9-8）: 薬を1個でも調合済みで未達成の依頼があれば、通常会話より優先して
    // 症状ヒントの依頼会話を流す（達成するまで何度でも聞き直せる）
    const quest = activeQuestFor(npc.chara)
    if (quest) {
      this.playGreet(npc)
      openDialogue(
        quest.requestLines.map((l) => ({ speaker: quest.chara, name: quest.name, face: l.face, text: l.text })),
        () => {
          recordTalk(npc.chara)
          if (!hasAnyKusuri()) {
            showMessage('渡せるお薬を持っていない。工房で調合してから、また話しかけよう')
            return
          }
          showGiftPicker(
            (recipe) => this.giveTo(quest, recipe),
            () => showMessage('お薬はいつでも渡せる。もう一度話しかければ、症状も聞き直せる'),
          )
        },
      )
      return
    }

    const talk = pickTalk(npc.chara)
    if (!talk) {
      showMessage('……（今は話すことがないようだ）')
      return
    }

    this.playGreet(npc)

    // 会話終了時に信頼度＋会話回数を記録（次回は別の会話にローテーション）
    openDialogue(talk, () => recordTalk(npc.chara))
  }

  // greetリアクション（旧シートから切り出した4コマ）を1回だけ再生してから待機に戻る。
  // greet素材が無いキャラ（シャオラン・ネム）は待機のまま会話に入る
  private playGreet(npc: { img: Phaser.GameObjects.Image; chara: string; reacting: boolean }) {
    if (!this.textures.exists(`${npc.chara}_greet_1`)) return
    npc.reacting = true
    for (let f = 1; f <= 4; f++) {
      this.time.delayedCall(150 * (f - 1), () => {
        npc.img.setTexture(`${npc.chara}_greet_${f}`)
        npc.img.setScale(CHAR_HEIGHT / npc.img.height) // greetと待機でキャンバス寸法が違うため毎回合わせる
      })
    }
    this.time.delayedCall(150 * 4 + 300, () => {
      npc.reacting = false
      npc.img.setTexture(`${npc.chara}_idle_${this.npcFrame}`)
      npc.img.setScale(CHAR_HEIGHT / npc.img.height)
    })
  }

  // 薬渡し（§9-8）: 正解なら1個消費して達成記録＋好感度ボーナス、
  // 不正解なら薬は消費せず、やんわり断られて再挑戦できる（学習ゲームなのでペナルティなし）
  private giveTo(quest: Quest, recipe: Recipe) {
    const line = (l: { face: number; text: string }) => ({
      speaker: quest.chara,
      name: quest.name,
      face: l.face,
      text: l.text,
    })
    if (recipe.id !== quest.recipeId) {
      openDialogue(quest.wrongLines.map(line))
      return
    }
    if (!giveKusuri(recipe.id)) return // 所持0は一覧に出ないため通常起きない保険
    markQuestDelivered(quest.id)
    recordGift(quest.chara, GIFT_TRUST_BONUS)
    // ステージ1の3依頼が揃った瞬間にイズナの深い会話を開放（§9-8。イズナ本人への依頼は無いので
    // 他キャラへの依頼達成のたびにここで判定する）
    if (allStage1QuestsDelivered()) unlockIzunaStage1Dialogue()
    updateHud()
    showToast(`${quest.name}に${recipe.name}を渡した`, recipe.icon)
    openDialogue(quest.thanksLines.map(line))
  }

  protected addCellImage(row: number, col: number, textureKey: string, size = 60): Phaser.GameObjects.Image {
    const img = this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, textureKey)
    this.fitImage(img, size)
    img.setDepth(5)
    return img
  }

  // 縦横比を保ったまま指定サイズに収める
  protected fitImage(img: Phaser.GameObjects.Image, size: number) {
    const scale = size / Math.max(img.width, img.height)
    img.setScale(scale)
  }

  private buildPlayer() {
    this.player = this.add.image(
      this.playerCol * TILE + TILE / 2,
      this.playerRow * TILE + TILE / 2 - 14, // 足元がマスに乗って見えるよう上げる
      'torika_walk_front_2', // 直立ポーズ
    )
    this.fitPlayer()
    this.player.setDepth(10)
  }

  // トリカは高さ約2マスのSFC風チビキャラの見せ方（春の里コンセプト画の縮尺に合わせる）
  private fitPlayer() {
    this.player.setScale(CHAR_HEIGHT / this.player.height)
  }

  private setFacing(dCol: number, dRow: number) {
    if (dRow > 0) {
      this.facingDir = 'front'
      this.facingFlip = false
    } else if (dRow < 0) {
      this.facingDir = 'back'
      this.facingFlip = false
    } else if (dCol < 0) {
      this.facingDir = 'side'
      this.facingFlip = false
    } else if (dCol > 0) {
      this.facingDir = 'side'
      this.facingFlip = true // モーション資料の側面は左向きなので反転
    }
  }

  // 歩行フレーム: 1=接地 2=直立(通過) 3=接地(反転) 4=直立(通過)
  private setPlayerFrame(frame: number) {
    const key = `torika_walk_${this.facingDir}_${frame}`
    if (this.player.texture.key !== key) {
      this.player.setTexture(key)
      this.fitPlayer()
    }
    this.player.setFlipX(this.facingFlip)
  }

  update() {
    // 会話ウインドウ表示中は移動・アクションを止め、Spaceキーはページ送りに使う
    if (isDialogueOpen()) {
      this.path = []
      if (Phaser.Input.Keyboard.JustDown(this.actionKey)) advanceDialogue()
      return
    }

    if (!this.isMoving) {
      // 押しっぱなしで連続移動（isDown判定）。キー入力があればクリック移動の予約は破棄する
      let dCol = 0
      let dRow = 0
      if (this.cursors.left.isDown || this.wasd.left.isDown) dCol = -1
      else if (this.cursors.right.isDown || this.wasd.right.isDown) dCol = 1
      else if (this.cursors.up.isDown || this.wasd.up.isDown) dRow = -1
      else if (this.cursors.down.isDown || this.wasd.down.isDown) dRow = 1

      if (dCol !== 0 || dRow !== 0) {
        this.path = []
        this.tryMove(dCol, dRow)
      } else if (this.path.length > 0) {
        const next = this.path.shift()!
        this.tryMove(next.col - this.playerCol, next.row - this.playerRow)
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.actionKey)) {
      // 隣のマスにNPCがいればSpaceキーは話しかけを優先する
      const npc = this.adjacentNpc()
      if (npc) {
        this.startTalk(npc)
      } else {
        this.onAction(this.specAt(this.playerRow, this.playerCol), this.playerRow, this.playerCol)
      }
    }
  }

  // クリック/タップした地点までの経路をBFSで求めて予約する
  private handleClick(pointer: Phaser.Input.Pointer) {
    if (isDialogueOpen()) {
      advanceDialogue() // ウインドウ外（キャンバス）のクリックでもページ送りできるようにする
      return
    }
    if (this.suppressClickMove) {
      this.suppressClickMove = false
      return
    }
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    const targetCol = Math.floor(world.x / TILE)
    const targetRow = Math.floor(world.y / TILE)
    if (targetCol < 0 || targetCol >= this.cols || targetRow < 0 || targetRow >= this.rows) return
    if (!this.walkable[targetRow][targetCol]) return

    const found = this.findPath(this.playerRow, this.playerCol, targetRow, targetCol)
    if (found) this.path = found
  }

  private findPath(
    startRow: number,
    startCol: number,
    goalRow: number,
    goalCol: number,
  ): { row: number; col: number }[] | null {
    if (startRow === goalRow && startCol === goalCol) return []

    const visited = new Set<string>([`${startRow},${startCol}`])
    const cameFrom = new Map<string, { row: number; col: number }>()
    const queue: { row: number; col: number }[] = [{ row: startRow, col: startCol }]
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ]

    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const { dr, dc } of dirs) {
        const r = cur.row + dr
        const c = cur.col + dc
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue
        if (!this.walkable[r][c]) continue
        const key = `${r},${c}`
        if (visited.has(key)) continue
        visited.add(key)
        cameFrom.set(key, cur)
        if (r === goalRow && c === goalCol) {
          const path: { row: number; col: number }[] = [{ row: r, col: c }]
          let back = cur
          while (!(back.row === startRow && back.col === startCol)) {
            path.unshift(back)
            back = cameFrom.get(`${back.row},${back.col}`)!
          }
          return path
        }
        queue.push({ row: r, col: c })
      }
    }
    return null // 到達不可能
  }

  private tryMove(dCol: number, dRow: number) {
    this.setFacing(dCol, dRow)

    const nextCol = this.playerCol + dCol
    const nextRow = this.playerRow + dRow
    if (nextCol < 0 || nextCol >= this.cols || nextRow < 0 || nextRow >= this.rows) {
      this.setPlayerFrame(2) // 進めないときは向きだけ変えて直立
      return
    }
    if (!this.walkable[nextRow][nextCol]) {
      this.setPlayerFrame(2)
      return // 木・水・壁は通れない
    }

    this.isMoving = true
    this.playerCol = nextCol
    this.playerRow = nextRow

    // 1マス移動の前半は接地ポーズ（1/3を歩数で交互）、後半は通過ポーズ（2/4）
    this.stepParity = !this.stepParity
    const stride = this.stepParity ? 1 : 3
    const pass = this.stepParity ? 2 : 4
    this.setPlayerFrame(stride)

    this.tweens.add({
      targets: this.player,
      x: nextCol * TILE + TILE / 2,
      y: nextRow * TILE + TILE / 2 - 14,
      duration: 150, // 120msだとコマ送りがカクカクして速い評だったため80%速度に（2026-07-16）

      onUpdate: (tween) => {
        if (tween.progress >= 0.5) this.setPlayerFrame(pass)
      },
      onComplete: () => {
        const spec = this.specAt(nextRow, nextCol)
        if (spec?.exit) {
          // isMovingはtrueのまま入力をロックし、フェードアウトしてから遷移する
          const exit = spec.exit
          this.cameras.main.fadeOut(200, 0, 0, 0)
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start(exit.targetScene, { spawnCol: exit.spawnCol, spawnRow: exit.spawnRow })
          })
          return
        }
        this.isMoving = false
        if (spec) this.onEnter(spec, nextRow, nextCol)
      },
    })
  }
}
