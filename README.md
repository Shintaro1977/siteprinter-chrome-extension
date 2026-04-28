# SitePrinter for Chrome

ページ全体のスクリーンショットを取得し、A4サイズのPDFとして出力するChrome拡張機能です。

## 機能

- ページ全体のスクリーンショット取得
- 複数タブの一括キャプチャ
- A4サイズPDFへの出力（1〜4列レイアウト対応）
- ヘッダー・フッター付きの印刷向けレイアウト
- 完全ローカル処理（プライバシー保護）

## 開発

### 必要要件

- Node.js 18以上
- npm

### セットアップ

```bash
npm install
npm run generate-icons
npm run build
```

### 拡張機能の読み込み

1. Chromeで `chrome://extensions` を開く
2. 「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist` フォルダを選択

### 開発モード

```bash
npm run dev
```

ファイルの変更を監視し、自動的に再ビルドします。

## ライセンス

Copyright (c) 2024 SitePrinter. All rights reserved.
