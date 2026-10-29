# トリッカフラワー Cloudflare運用

新しい紹介サイト: https://torika-flower-site.earthkey.workers.dev/

新しいゲーム: https://torika-flower-sfc.earthkey.workers.dev/

旧Vercelサイトと元のセーブは維持します。旧URLからの自動転送・公開停止は今回行いません。

現在は段階移行中です。旧Vercelへの書出し機能の反映はdraft PRの本人確認待ちです。紹介サイトのCloudflareビルドは既定で準備中の案内を表示します。ゲームPR、紹介サイトPRの順に本番反映し、旧側の書出しと新側の取込みを確認した後だけ、`node build-cloudflare.mjs --legacy-ready` で移行案内を有効にしてください。

## セーブの引継ぎ

- PCの紹介サイト内で遊んでいた場合は、旧紹介サイトの「セーブの引っ越し」からJSONを書き出し、新紹介サイトの引っ越し画面で読み込んでください。
- ゲームを直接開いていた場合は、同じブラウザの旧ゲームのタイトル「セーブの引っ越し」から書き出し、新ゲームの同じ画面で読み込んでください。
- 取り込み先は空きスロットだけです。既存データ・旧形式セーブ・設定は自動で上書きしません。複数スロットは1つずつ取り込みます。
- JSONは本人の端末内で処理します。サーバー送信はありません。元のデータやJSONは、移行後に続きを確認できるまで保管してください。
- ブラウザのストレージ分離により、PCの埋め込みと直接アクセスの保存先が異なる場合があります。いつも遊んでいた場所で書き出してください。

## 公開の更新

両方ともWorkers Static Assetsのみ。DB、R2、Stream、Cron、API、独自ドメイン設定は追加しません。既存の認証アカウントとWorker名を確認し、別の既存Workerへ上書きしないでください。

ゲーム: `npm run build` → `npx wrangler@4.154.0 deploy --dry-run` → 対象と差分確認 → `npx wrangler@4.154.0 deploy`。

紹介サイト: `node build-cloudflare.mjs` → 同じWranglerのdry-runとdeploy。公開対象はdistのindex.html、style.css、assetsのみ。

紹介サイトのソースindex.htmlは旧Vercelでの既存セーブへのアクセスを保つため、旧ゲームのiframeを維持します。Cloudflareビルド時だけ通常のゲームiframe・スマホのプレイURL・OGPを新URLへ置換します。旧セーブの書出しリンクは置換しません。

ゲームのindex.htmlは、PCの直接アクセスを同じ環境の紹介サイトへ戻します。タッチ端末・iframe内・ローカル開発は直接プレイできます。ポート5173の既存固定は変更しません。

本リポジトリへのpushは既存Vercel Git連携で公開に反映される場合があります。Cloudflareのデプロイとは別です。公開後は主要URL・ゲーム開始・続き・セーブ引継ぎを検証してください。

## ロールバック

旧Vercelの公開を維持しているため、利用者は元のURL・元のセーブで遊べます。Cloudflareで取り込んだセーブは旧側に自動同期されません。新側で進めたデータを旧側へ戻す場合もJSONの手動引継ぎと空きスロットが必要です。

Cloudflareのみを戻す場合は、検証済みバージョンへrollbackするか保存済み成果物を再deployします。ソース変更を戻す場合は履歴をrevertし、利用者のlocalStorageを消去しないでください。旧公開の停止・永久削除・DNS変更・課金変更は別判断です。
