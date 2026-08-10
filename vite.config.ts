import { defineConfig } from 'vite'

// ポートを5173に固定する（2026-08-10本人指示）。
// セーブデータ（localStorage）は「localhost:ポート番号」の単位で保存されるため、
// 別のポートで起動すると同じChromeでもセーブが見えず「はじめから」になる。
// 実際に2026-08-10、5199で起動してセーブが消えたように見えた事故があった。
// strictPort: 5173が塞がっていたら別ポートへ逃げずにエラーで止める
// （黙って5174等で起動すると、まさにその事故が再発するため）
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
})
