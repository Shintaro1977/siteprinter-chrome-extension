# スクリーンショットChrome拡張機能 技術仕様書

このドキュメントは、FireShot（バージョン2.1.4.7）の解析結果に基づき、同様のスクリーンショット拡張機能を開発する際のリファレンスとして作成されました。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [スクリーンショット取得の仕組み](#3-スクリーンショット取得の仕組み)
4. [キャプチャモード別の実装](#4-キャプチャモード別の実装)
5. [前処理：固定要素・アニメーション制御](#5-前処理固定要素アニメーション制御)
6. [メモリ管理とパフォーマンス最適化](#6-メモリ管理とパフォーマンス最適化)
7. [iframe・Shadow DOM対応](#7-iframeshadow-dom対応)
8. [特殊サイト対応](#8-特殊サイト対応)
9. [有料機能の実装パターン](#9-有料機能の実装パターン)
10. [技術スタック](#10-技術スタック)
11. [ディレクトリ構造](#11-ディレクトリ構造)
12. [実装時の注意点](#12-実装時の注意点)
13. [プログレス表示の実装](#13-プログレス表示の実装)

---

## 1. プロジェクト概要

### 1.1 機能概要

Webページのスクリーンショットを撮影するChrome拡張機能。以下の機能を提供する：

- **表示範囲キャプチャ**: 現在表示されている部分のみ
- **ページ全体キャプチャ**: スクロールして全ページを結合
- **選択範囲キャプチャ**: ユーザーが選択した矩形領域
- **ブラウザウィンドウキャプチャ**: ブラウザ全体
- **複数タブ一括キャプチャ**: 複数タブを連続処理

### 1.2 出力形式

- PNG（標準）
- JPEG
- PDF（テキスト検索可能、ヘッダー/フッター/ウォーターマーク対応）
- GIF

### 1.3 追加機能

- スクリーンショット編集・注釈
- クリップボードコピー
- メール送信、クラウドアップロード
- 履歴管理
- 多言語対応（44言語）

---

## 2. アーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────────┐
│                      Chrome Extension                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌─────────────────────────────────┐    │
│  │  Popup UI    │    │      Service Worker             │    │
│  │ (fsPopup.js) │◄──►│   (fsServiceWorker.js)          │    │
│  │              │    │   - キャプチャ制御               │    │
│  └──────────────┘    │   - ライセンス管理               │    │
│                      │   - ストレージ管理               │    │
│                      └───────────┬─────────────────────┘    │
│                                  │                          │
│                                  │ chrome.tabs.connect()    │
│                                  │ Port-based messaging     │
│                                  ▼                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Content Scripts                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │ fsContent.js │  │ fsFrames.js  │  │fsActivation │  │  │
│  │  │ - DOM操作    │  │ - iframe検出 │  │  .js        │  │  │
│  │  │ - スクロール │  │ - 再帰処理   │  │ - 有効化   │  │  │
│  │  │ - 要素制御   │  │              │  │   制御     │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                  │                          │
│                                  ▼                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Web Worker                          │  │
│  │  ┌──────────────┐    ┌──────────────┐                 │  │
│  │  │ fsWorker.js  │───►│fsEncoder.js  │                 │  │
│  │  │ (通信管理)   │    │ (WASM処理)   │                 │  │
│  │  │              │    │ - PDF生成    │                 │  │
│  │  │              │    │ - 画像処理   │                 │  │
│  │  └──────────────┘    └──────────────┘                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 コンポーネント役割

| コンポーネント | ファイル | 役割 |
|---------------|----------|------|
| Popup UI | fsPopup.js, fsPopup.html | ユーザーインターフェース、アクション選択 |
| Service Worker | fsServiceWorker.js | バックグラウンド処理、キャプチャ制御、API通信 |
| Content Script | fsContent.js | ページ内DOM操作、スクロール処理、要素制御 |
| Frame Handler | fsFrames.js | iframe検出・情報収集 |
| Worker | fsWorker.js | メインスレッド外での重い処理 |
| Encoder | fsEncoder.js | WASM使用のPDF/画像エンコード |

### 2.3 通信方式

**Port-based Messaging（推奨）**:
- 長時間の双方向通信に適用
- スクロール・キャプチャループで使用

```javascript
// Service Worker側
const port = chrome.tabs.connect(tabId, { frameId: frameId });
port.postMessage({ topic: 'init', mode: captureMode, options: {} });
port.onMessage.addListener((message) => {
  switch (message.topic) {
    case 'scrollDone':
      // 次のキャプチャを実行
      break;
    case 'scrollFinished':
      // 合成処理へ
      break;
  }
});

// Content Script側
chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((message) => {
    switch (message.topic) {
      case 'scrollNext':
        // スクロール実行後、結果を返す
        port.postMessage({ topic: 'scrollDone', x: scrollX, y: scrollY });
        break;
    }
  });
});
```

---

## 3. スクリーンショット取得の仕組み

### 3.1 基本フロー

```
ユーザーアクション
       │
       ▼
┌─────────────────┐
│ executeGrabber()│  ← Service Workerのエントリーポイント
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Content Script  │  ← chrome.scripting.executeScript()で注入
│ 注入            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Port接続確立    │  ← chrome.tabs.connect()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 初期化フェーズ  │
│ - preStep1      │  ← overflow隠蔽、サイズ測定
│ - preStep2      │  ← スタイル復元準備
│ - init          │  ← キャプチャ設定
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ スクロール・キャプチャループ         │
│                                      │
│  ┌────────────────────────────┐     │
│  │ 1. scrollNext 指示         │     │
│  │ 2. Content Scriptがスクロール│    │
│  │ 3. 固定要素を非表示         │     │
│  │ 4. captureVisibleTab()     │     │  ← chrome.tabs.captureVisibleTab()
│  │ 5. PNG Data URL取得        │     │
│  │ 6. メトリックス記録         │     │
│  │ 7. scrollDone 応答         │     │
│  └────────────────────────────┘     │
│              ↓ 繰り返し              │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ scrollFinished  │  ← 全スクロール完了
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Canvas合成      │  ← 複数画像を結合
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ファイル保存    │  ← PNG/PDF/JPEG出力
└─────────────────┘
```

### 3.2 chrome.tabs.captureVisibleTab() の使用

```javascript
// 再試行機構付きキャプチャ
function captureWithRetry(windowId, options, config) {
  return new Promise((resolve, reject) => {
    const MAX_TRIALS = config.MAX_CAP_TRIALS || 40;
    const CAP_DELAY = config.CAP_DELAY || 50;

    function attempt(trial) {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (!chrome.runtime.lastError && dataUrl) {
          resolve(dataUrl);
        } else if (trial < MAX_TRIALS) {
          setTimeout(() => attempt(trial + 1), CAP_DELAY);
        } else {
          reject(new Error('Maximum capture attempts reached'));
        }
      });
    }

    attempt(0);
  });
}
```

### 3.3 メトリックス構造

各キャプチャフレームで以下の情報を記録：

```javascript
const metrics = {
  x: scrollX,           // 水平スクロール位置
  y: scrollY,           // 垂直スクロール位置
  cw: clientWidth,      // クライアント幅
  ch: clientHeight,     // クライアント高さ
  rows: totalRows,      // 垂直方向のフレーム数
  cols: totalCols,      // 水平方向のフレーム数
  crop: needsCropping,  // クロップ必要性
  cropLeft: 0,
  cropTop: 0,
  cropRight: width,
  cropBottom: height,
  stickyHdrHeight: 0,   // スティッキーヘッダー高さ
  url: pageUrl,
  title: pageTitle
};
```

---

## 4. キャプチャモード別の実装

### 4.1 キャプチャモード定数

```javascript
const CaptureMode = {
  VISIBLE: 0,    // 表示範囲のみ
  ENTIRE: 1,     // ページ全体
  SELECTED: 2,   // 選択範囲
  BROWSER: 3,    // ブラウザウィンドウ
  TABS: 4        // 複数タブ
};
```

### 4.2 表示範囲キャプチャ（VISIBLE）

最もシンプル。1回の `captureVisibleTab()` で完了。

```javascript
async function captureVisible(tabId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  return dataUrl;
}
```

### 4.3 ページ全体キャプチャ（ENTIRE）

スクロールしながら複数回キャプチャし、最後に結合。

```javascript
// Content Script側のスクロールロジック
function scrollAndCapture() {
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = window.innerHeight;
  const scrollWidth = document.documentElement.scrollWidth;
  const clientWidth = window.innerWidth;

  let currentY = 0;
  let currentX = 0;

  // 垂直スクロール
  while (currentY < scrollHeight) {
    window.scrollTo(currentX, currentY);
    // キャプチャ待機
    currentY += clientHeight - 40; // オーバーラップを考慮
  }

  // 水平スクロール（必要な場合）
  // ...
}
```

### 4.4 選択範囲キャプチャ（SELECTED）

ユーザーが矩形を選択し、その領域のみをキャプチャ。

```javascript
// 選択UI表示
function showSelectionUI() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    cursor: crosshair;
    z-index: 999999;
  `;

  let startX, startY, endX, endY;

  overlay.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
  });

  overlay.addEventListener('mouseup', (e) => {
    endX = e.clientX;
    endY = e.clientY;

    const selection = {
      left: Math.min(startX, endX),
      top: Math.min(startY, endY),
      right: Math.max(startX, endX),
      bottom: Math.max(startY, endY)
    };

    // 選択完了を通知
    port.postMessage({ topic: 'areaSelected', selection });
  });

  document.body.appendChild(overlay);
}
```

---

## 5. 前処理：固定要素・アニメーション制御

### 5.1 固定要素（Fixed/Sticky）の処理

スクリーンショット時に固定要素が重複して表示されることを防ぐ。

```javascript
// 固定要素の検出と非表示化
function hideFixedElements(scrollContainer) {
  const savedStyles = [];

  const iterator = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_ELEMENT
  );

  let node;
  while (node = iterator.nextNode()) {
    const style = window.getComputedStyle(node);
    const position = style.getPropertyValue('position');

    if (position === 'fixed' || position === 'sticky') {
      // 親子関係をチェック（スクロールコンテナ内の要素は除外）
      if (!isChildOf(node, scrollContainer) && !isChildOf(scrollContainer, node)) {
        // 元のスタイルを保存
        savedStyles.push({
          element: node,
          opacity: node.style.opacity,
          animation: node.style.animation,
          transitionDuration: node.style.transitionDuration
        });

        // 非表示化
        node.style.setProperty('opacity', '0', 'important');
        node.style.setProperty('animation', 'unset', 'important');
        node.style.setProperty('transition-duration', '0s', 'important');
      }
    }
  }

  return savedStyles;
}

// 復元処理
function restoreFixedElements(savedStyles) {
  savedStyles.forEach(({ element, opacity, animation, transitionDuration }) => {
    element.style.setProperty('opacity', opacity);
    element.style.setProperty('animation', animation);
    element.style.setProperty('transition-duration', transitionDuration);
  });
}
```

### 5.2 Sticky要素の特殊処理

Sticky要素は位置プロパティを極端な値に変更して画面外に移動。

```javascript
function handleStickyElements(container, savedStyles) {
  const OFFSCREEN_VALUE = '-3e+07px';

  document.querySelectorAll('*').forEach(element => {
    const style = window.getComputedStyle(element);
    if (style.position === 'sticky') {
      ['top', 'bottom', 'left', 'right'].forEach(prop => {
        const value = style.getPropertyValue(prop);
        if (value && value !== 'auto' && value !== OFFSCREEN_VALUE) {
          savedStyles.push({
            element,
            property: prop,
            value: element.style[prop],
            priority: element.style.getPropertyPriority(prop)
          });
          element.style.setProperty(prop, OFFSCREEN_VALUE, 'important');
        }
      });
    }
  });
}
```

### 5.3 アニメーションの停止

```javascript
function stopAllAnimations() {
  const savedAnimations = [];

  // CSSアニメーションの停止
  document.querySelectorAll('*').forEach(element => {
    const style = window.getComputedStyle(element);

    if (style.animation !== 'none') {
      savedAnimations.push({
        element,
        animation: element.style.animation
      });
      element.style.setProperty('animation', 'unset', 'important');
    }

    if (style.transitionDuration !== '0s') {
      savedAnimations.push({
        element,
        transitionDuration: element.style.transitionDuration
      });
      element.style.setProperty('transition-duration', '0s', 'important');
    }
  });

  return savedAnimations;
}
```

### 5.4 背景固定の処理

```javascript
function handleFixedBackgrounds(savedStyles) {
  const iterator = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_ELEMENT
  );

  let node;
  while (node = iterator.nextNode()) {
    const style = window.getComputedStyle(node);
    if (style.backgroundAttachment === 'fixed') {
      savedStyles.push({
        element: node,
        property: 'background-attachment',
        value: node.style.backgroundAttachment
      });
      node.style.setProperty('background-attachment', 'scroll', 'important');
    }
  }
}
```

### 5.5 スクロールバーの非表示

```javascript
function hideScrollbars() {
  const style = document.createElement('style');
  style.id = 'screenshot-scrollbar-hide';

  // ブラウザ別対応
  style.textContent = `
    html::-webkit-scrollbar { display: none !important; }
    html {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
  `;

  document.head.appendChild(style);

  return () => {
    const styleElement = document.getElementById('screenshot-scrollbar-hide');
    if (styleElement) styleElement.remove();
  };
}
```

---

## 6. メモリ管理とパフォーマンス最適化

### 6.1 Web Workerの使用

重い画像処理をメインスレッドから分離。

```javascript
// メインスレッド側
const worker = new Worker('encoder-worker.js');

worker.postMessage({
  type: 'encode',
  images: capturedImages,
  format: 'pdf',
  options: { quality: 0.9 }
});

worker.onmessage = (event) => {
  if (event.data.type === 'completed') {
    const blob = event.data.result;
    downloadBlob(blob, 'screenshot.pdf');
  }
};

// Worker側 (encoder-worker.js)
self.onmessage = async (event) => {
  const { type, images, format, options } = event.data;

  if (type === 'encode') {
    // 重い処理をここで実行
    const result = await encodeImages(images, format, options);
    self.postMessage({ type: 'completed', result });
  }
};
```

### 6.2 WASMメモリ管理

```javascript
// WASM モジュールでのメモリ管理
function processImageData(imageData, wasmModule) {
  const data = imageData.data;
  const size = data.length * data.BYTES_PER_ELEMENT;

  // メモリ割り当て
  const ptr = wasmModule._malloc(size);

  try {
    // データをWASMメモリにコピー
    wasmModule.HEAPU8.set(data, ptr);

    // 処理実行
    wasmModule._processImage(ptr, imageData.width, imageData.height);

    // 結果を取得
    const result = new Uint8Array(wasmModule.HEAPU8.buffer, ptr, size);
    return new ImageData(new Uint8ClampedArray(result), imageData.width, imageData.height);

  } finally {
    // 必ずメモリを解放
    wasmModule._free(ptr);
  }
}
```

### 6.3 処理の時間分割

UIフリーズを防ぐため、処理を150-200msの間隔で分割。

```javascript
async function processInChunks(items, processFunc, chunkDelay = 150) {
  for (let i = 0; i < items.length; i++) {
    await processFunc(items[i], i);

    // チャンク間で遅延を入れてUIスレッドに制御を戻す
    if (i < items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, chunkDelay));
    }
  }
}

// スクロール処理での使用例
async function scrollCapture() {
  const SCROLL_DELAY = 150; // ミリ秒

  while (hasMoreToScroll()) {
    performScroll();

    // UIスレッドに制御を戻す
    await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));

    // キャプチャ実行
    const dataUrl = await captureVisibleTab();
    saveFrame(dataUrl);
  }
}
```

### 6.4 スロットリング

高頻度イベントの制御。

```javascript
function throttle(func, delay) {
  let timeoutId = null;
  let lastExec = 0;

  return function(...args) {
    const now = Date.now();

    if (now - lastExec >= delay) {
      func.apply(this, args);
      lastExec = now;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExec = Date.now();
      }, delay - (now - lastExec));
    }
  };
}

// マウス移動イベントの制御
const throttledMouseMove = throttle((e) => {
  updateSelectionRect(e.clientX, e.clientY);
}, 15);
```

### 6.5 接続状態の監視

```javascript
function setupConnectionMonitor(port) {
  const PING_INTERVAL = 1000; // 1秒
  let isAlive = true;

  const pingInterval = setInterval(() => {
    try {
      port.postMessage({ topic: 'ping' });
    } catch (error) {
      isAlive = false;
      clearInterval(pingInterval);
      handleDisconnection();
    }
  }, PING_INTERVAL);

  port.onMessage.addListener((message) => {
    if (message.topic === 'pong') {
      isAlive = true;
    }
  });

  return () => clearInterval(pingInterval);
}
```

---

## 7. iframe・Shadow DOM対応

### 7.1 iframe検出と情報収集

```javascript
// fsFrames.js の実装パターン
function detectIframes(parentDocument, level = 0) {
  const frames = [];

  parentDocument.querySelectorAll('iframe, frame').forEach((iframe, index) => {
    const rect = iframe.getBoundingClientRect();
    const frameId = `frame_${level}_${index}`;

    // フレームにIDを付与
    iframe.setAttribute('data-fireshot-frame-id', frameId);

    const frameInfo = {
      id: frameId,
      level: level,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      scrollWidth: 0,
      scrollHeight: 0,
      scrollable: false
    };

    try {
      // 同一オリジンの場合のみアクセス可能
      const frameDoc = iframe.contentDocument || iframe.contentWindow.document;
      frameInfo.scrollWidth = frameDoc.documentElement.scrollWidth;
      frameInfo.scrollHeight = frameDoc.documentElement.scrollHeight;
      frameInfo.scrollable = frameInfo.scrollWidth > rect.width ||
                             frameInfo.scrollHeight > rect.height;

      // 再帰的に子フレームを検出
      const childFrames = detectIframes(frameDoc, level + 1);
      frames.push(...childFrames);

    } catch (e) {
      // クロスオリジンフレームはスキップ
      console.log('Cross-origin frame detected:', iframe.src);
    }

    frames.push(frameInfo);
  });

  return frames;
}
```

### 7.2 Shadow DOM対応トラバーサル

```javascript
// Shadow DOMを含む全要素の走査
function createAdvancedNodeIterator(root, whatToShow) {
  const walkers = [document.createTreeWalker(root, whatToShow)];

  return {
    nextNode() {
      while (walkers.length > 0) {
        const node = walkers[walkers.length - 1].nextNode();

        if (node) {
          // Shadow Rootがあれば新しいWalkerを追加
          if (node.shadowRoot) {
            walkers.push(document.createTreeWalker(node.shadowRoot, whatToShow));
            return this.nextNode();
          }
          return node;
        }

        // 現在のWalkerが終了したら削除
        walkers.pop();
      }
      return null;
    }
  };
}

// Shadow DOM対応のquerySelectorAll
function querySelectorAllDeep(root, selector) {
  const results = [...root.querySelectorAll(selector)];

  const iterator = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT);
  let node;

  while (node = iterator.nextNode()) {
    if (node.shadowRoot) {
      results.push(...querySelectorAllDeep(node.shadowRoot, selector));
    }
  }

  return results;
}
```

---

## 8. 特殊サイト対応

### 8.1 サイト検出パターン

```javascript
const SiteDetection = {
  isFacebook: () => /\.(facebook|fb)\.com/i.test(location.href),
  isWhatsApp: () => /https?:\/\/web\.whatsapp\.com/i.test(location.href),
  isTelegram: () => /https?:\/\/web\.telegram\.org/i.test(location.href),
  isChatGPT: () => /https?:\/\/chatgpt\.com/i.test(location.href),
  isGemini: () => /https?:\/\/gemini\.google\.com/i.test(location.href),
  isGmail: () => /https?:\/\/mail\.google\.com/i.test(location.href),
  isGoogleDrivePDF: () => {
    return /https?:\/\/drive\.google\.com\/file\//i.test(location.href) &&
           /\.pdf/i.test(document.title);
  }
};
```

### 8.2 Gmail特殊処理

```javascript
function handleGmailUI(show) {
  if (!SiteDetection.isGmail()) return;

  // 特定のUI要素を非表示/表示
  const selectors = [
    'td.Bu.y3',  // サイドバー要素
    '#:ro',       // 特定のコンテナ
    '#:5'         // 追加のコンテナ
  ];

  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      el.style.setProperty('display', show ? '' : 'none', 'important');
    });
  });
}
```

### 8.3 Google Drive PDF対応

```javascript
function handleGoogleDrivePDF() {
  if (!SiteDetection.isGoogleDrivePDF()) return;

  // 背景を白に
  document.body.style.setProperty('background-color', 'white', 'important');

  // 画像シャドウを削除
  document.querySelectorAll('img').forEach(img => {
    img.style.setProperty('box-shadow', 'none', 'important');
  });
}
```

### 8.4 無限スクロール対応

```javascript
function handleInfiniteScroll(enabled) {
  if (!enabled) return;

  let previousScrollHeight = document.documentElement.scrollHeight;

  return {
    checkForNewContent() {
      const currentScrollHeight = document.documentElement.scrollHeight;
      const hasNewContent = currentScrollHeight > previousScrollHeight;
      previousScrollHeight = currentScrollHeight;
      return hasNewContent;
    },

    shouldContinueScrolling(currentY, maxY) {
      // 無限スクロールが有効な場合、動的にmaxYを更新
      return currentY < Math.max(maxY, document.documentElement.scrollHeight);
    }
  };
}
```

---

## 9. 有料機能の実装パターン

### 9.1 ライセンス管理構造

```javascript
// ストレージキー
const LicenseKeys = {
  REGISTERED_MODE: 'registeredMode',
  REG_KEY: 'regKey',
  REG_USER: 'regUser',
  PLUGIN_PRO_MODE: 'pluginProMode',
  SHOW_ADVERTISING: 'showAdvertising'
};

// ライセンス状態の取得
async function getLicenseState() {
  const data = await chrome.storage.local.get([
    LicenseKeys.REGISTERED_MODE,
    LicenseKeys.PLUGIN_PRO_MODE
  ]);

  return {
    isRegistered: data[LicenseKeys.REGISTERED_MODE] === 'true',
    isPro: data[LicenseKeys.PLUGIN_PRO_MODE] === true
  };
}
```

### 9.2 ライセンス検証フロー

```javascript
// ライセンス検証
async function validateLicense(name, key) {
  const keyRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

  if (!keyRegex.test(key)) {
    throw new Error('Invalid license key format');
  }

  // サーバー検証
  const response = await fetch('https://your-auth-server.com/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, key })
  });

  if (!response.ok) {
    throw new Error('License validation failed');
  }

  const result = await response.json();

  // ライセンス情報を保存
  await chrome.storage.local.set({
    [LicenseKeys.REGISTERED_MODE]: 'true',
    [LicenseKeys.REG_KEY]: key,
    [LicenseKeys.REG_USER]: name,
    [LicenseKeys.PLUGIN_PRO_MODE]: true
  });

  return result;
}
```

### 9.3 機能制限の実装

```javascript
// 機能ゲート
async function checkFeatureAccess(featureName) {
  const { isPro } = await getLicenseState();

  const proOnlyFeatures = [
    'edit',
    'annotate',
    'removeAds',
    'advancedPDF',
    'history',
    'batchCapture'
  ];

  if (proOnlyFeatures.includes(featureName) && !isPro) {
    // プロモーションダイアログを表示
    showPromoDialog(featureName);
    return false;
  }

  return true;
}

// UI側での制限
function updateUIForLicenseState(isPro) {
  const proFeatureButtons = document.querySelectorAll('[data-pro-feature]');

  proFeatureButtons.forEach(button => {
    if (!isPro) {
      button.classList.add('pro-locked');
      button.addEventListener('click', (e) => {
        e.preventDefault();
        showPromoDialog(button.dataset.proFeature);
      });
    }
  });
}
```

### 9.4 定期的なライセンス再検証

```javascript
// アラームによる定期検証
chrome.alarms.create('licenseCheck', {
  delayInMinutes: 1,
  periodInMinutes: 60  // 1時間ごと
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'licenseCheck') {
    const { regKey, regUser } = await chrome.storage.local.get(['regKey', 'regUser']);

    if (regKey && regUser) {
      try {
        await validateLicense(regUser, regKey);
      } catch (error) {
        // ライセンス失効
        await chrome.storage.local.set({
          [LicenseKeys.REGISTERED_MODE]: 'false',
          [LicenseKeys.PLUGIN_PRO_MODE]: false
        });
      }
    }
  }
});
```

---

## 10. 技術スタック

### 10.1 必須技術

| 技術 | 用途 | バージョン |
|------|------|-----------|
| Chrome Extension Manifest V3 | 拡張機能基盤 | V3 |
| JavaScript (ES6+) | メインロジック | ES2020+ |
| HTML5 | UI | HTML5 |
| CSS3 | スタイリング | CSS3 |
| Web Workers | 重い処理の分離 | - |
| WebAssembly (任意) | 高速な画像/PDF処理 | - |

### 10.2 推奨ライブラリ

| ライブラリ | 用途 | 備考 |
|-----------|------|------|
| Canvas API | 画像合成 | ネイティブAPI |
| jsPDF | PDF生成 | 軽量PDF生成 |
| html2canvas | HTML→Canvas変換 | 代替手段として |
| pako | 圧縮処理 | gzip対応 |

### 10.3 Chrome APIs

```javascript
// 必須パーミッション
const requiredPermissions = [
  'activeTab',      // 現在のタブへのアクセス
  'scripting',      // Content Script注入
  'storage'         // ローカルストレージ
];

// オプショナルパーミッション
const optionalPermissions = [
  'tabs',           // 全タブ情報へのアクセス
  'downloads',      // ファイルダウンロード
  'contextMenus',   // 右クリックメニュー
  'nativeMessaging' // ネイティブアプリ連携
];

// 使用するChrome APIs
const usedAPIs = {
  'chrome.tabs.captureVisibleTab': 'スクリーンショット取得',
  'chrome.tabs.connect': 'Port通信',
  'chrome.scripting.executeScript': 'Content Script注入',
  'chrome.storage.local': 'ローカルストレージ',
  'chrome.alarms': '定期実行',
  'chrome.contextMenus': '右クリックメニュー',
  'chrome.commands': 'キーボードショートカット'
};
```

---

## 11. ディレクトリ構造

### 11.1 推奨構造

```
extension/
├── manifest.json              # 拡張機能マニフェスト
├── popup/
│   ├── popup.html             # ポップアップUI
│   ├── popup.js               # ポップアップロジック
│   └── popup.css              # ポップアップスタイル
├── background/
│   └── service-worker.js      # Service Worker
├── content/
│   ├── content.js             # メインContent Script
│   ├── frames.js              # iframe処理
│   ├── selection.js           # 選択UI
│   └── styles.css             # 注入スタイル
├── workers/
│   ├── encoder-worker.js      # 画像/PDF処理Worker
│   └── wasm/
│       └── encoder.wasm       # WASMモジュール（任意）
├── pages/
│   ├── captured.html          # キャプチャ表示ページ
│   ├── options.html           # 設定ページ
│   ├── history.html           # 履歴ページ
│   └── license.html           # ライセンス入力ページ
├── scripts/
│   ├── captured.js
│   ├── options.js
│   ├── history.js
│   └── license.js
├── styles/
│   ├── common.css
│   └── themes/
├── images/
│   ├── icons/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── ui/
├── _locales/
│   ├── en/
│   │   └── messages.json
│   └── ja/
│       └── messages.json
└── lib/                       # サードパーティライブラリ
    └── ...
```

### 11.2 manifest.json テンプレート

```json
{
  "manifest_version": 3,
  "name": "Screenshot Extension",
  "version": "1.0.0",
  "description": "Capture screenshots of web pages",

  "permissions": [
    "activeTab",
    "scripting",
    "storage"
  ],

  "optional_permissions": [
    "tabs",
    "downloads",
    "contextMenus"
  ],

  "background": {
    "service_worker": "background/service-worker.js"
  },

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "images/icons/icon-16.png",
      "48": "images/icons/icon-48.png",
      "128": "images/icons/icon-128.png"
    }
  },

  "commands": {
    "capture-entire": {
      "suggested_key": {
        "default": "Alt+Shift+1",
        "mac": "Command+Shift+1"
      },
      "description": "Capture entire page"
    },
    "capture-visible": {
      "suggested_key": {
        "default": "Alt+Shift+3",
        "mac": "Command+Shift+2"
      },
      "description": "Capture visible area"
    }
  },

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  },

  "minimum_chrome_version": "114"
}
```

---

## 12. 実装時の注意点

### 12.1 パフォーマンス

1. **処理の分割**: 長時間処理は150-200ms間隔で分割し、UIフリーズを防ぐ
2. **Web Workerの活用**: 画像処理、PDF生成などの重い処理は別スレッドで実行
3. **メモリ管理**: 大きな画像データは処理後すぐに解放
4. **遅延読み込み**: 必要になるまでリソースをロードしない

### 12.2 互換性

1. **ブラウザ差異**: Safari、Firefox、Chromiumで挙動が異なる場合がある
2. **特殊サイト対応**: Gmail、Facebook等のSPAサイトは個別対応が必要
3. **iframe制限**: クロスオリジンiframeの内容はキャプチャ不可

### 12.3 セキュリティ

1. **ライセンスキーの保護**: 可能な限りサーバー側で検証
2. **Content Script分離**: ページコンテキストとの分離を維持
3. **入力検証**: ユーザー入力は必ずサニタイズ

### 12.4 UX

1. **プログレス表示**: 長時間処理中は進捗を表示
2. **エラーハンドリング**: わかりやすいエラーメッセージ
3. **キーボードショートカット**: 頻繁に使う機能にはショートカットを設定

### 12.5 よくある問題と解決策

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 固定要素が重複表示 | position:fixedの未処理 | キャプチャ前に非表示化 |
| 画像が途切れる | スクロール位置のズレ | オーバーラップを設けて結合 |
| メモリ不足 | 大きなページ | 段階的な処理、Worker使用 |
| 遅延読み込み画像が空白 | Lazy Loading | スクロール後に待機時間を設ける |
| SPAでDOM取得失敗 | 動的レンダリング | MutationObserverで監視 |

---

## 付録: コードサンプル集

### A. 完全なキャプチャフロー

```javascript
// service-worker.js
async function captureEntirePage(tabId) {
  // 1. Content Script注入
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content.js']
  });

  // 2. Port接続
  const port = chrome.tabs.connect(tabId);
  const frames = [];

  // 3. 初期化
  port.postMessage({ topic: 'init', mode: 'entire' });

  // 4. メッセージループ
  return new Promise((resolve, reject) => {
    port.onMessage.addListener(async (message) => {
      switch (message.topic) {
        case 'initDone':
          port.postMessage({ topic: 'scrollNext' });
          break;

        case 'scrollDone':
          const dataUrl = await chrome.tabs.captureVisibleTab(
            null, { format: 'png' }
          );
          frames.push({ dataUrl, ...message.metrics });
          port.postMessage({ topic: 'scrollNext' });
          break;

        case 'scrollFinished':
          const result = await combineFrames(frames, message.finalMetrics);
          port.postMessage({ topic: 'cleanup' });
          resolve(result);
          break;

        case 'error':
          reject(new Error(message.error));
          break;
      }
    });
  });
}
```

### B. Canvas合成

```javascript
async function combineFrames(frames, metrics) {
  const canvas = document.createElement('canvas');
  canvas.width = metrics.totalWidth;
  canvas.height = metrics.totalHeight;
  const ctx = canvas.getContext('2d');

  for (const frame of frames) {
    const img = await loadImage(frame.dataUrl);

    // クロップが必要な場合
    if (frame.crop) {
      ctx.drawImage(
        img,
        frame.cropLeft, frame.cropTop,
        frame.cropRight - frame.cropLeft,
        frame.cropBottom - frame.cropTop,
        frame.x, frame.y,
        frame.cropRight - frame.cropLeft,
        frame.cropBottom - frame.cropTop
      );
    } else {
      ctx.drawImage(img, frame.x, frame.y);
    }
  }

  return canvas.toDataURL('image/png');
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
```

---

## 13. プログレス表示の実装

スクリーンショット取得中にユーザーに進捗状況を表示する機能の実装方法。

### 13.1 プログレス表示のアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Worker                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ キャプチャループ                                      │   │
│  │  - currentFrame / totalFrames を計算                 │   │
│  │  - プログレスウィンドウに進捗を送信                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           │ chrome.runtime.sendMessage()    │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ プログレスウィンドウ (popup または別ウィンドウ)        │   │
│  │  - プログレスバーの幅を更新                          │   │
│  │  - 「Processing...」ラベル表示                       │   │
│  │  - 停止ボタン                                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 13.2 進捗率の計算方法

ページ全体キャプチャでは、スクロール回数から進捗を計算する。

```javascript
// Service Worker側: 進捗率の計算
function calculateProgress(scrollInfo) {
  const { currentRow, totalRows, currentCol, totalCols } = scrollInfo;

  // 全フレーム数 = 行数 × 列数
  const totalFrames = totalRows * totalCols;

  // 現在のフレーム番号 = (現在の行 × 列数) + 現在の列
  const currentFrame = (currentRow * totalCols) + currentCol + 1;

  // 進捗率 (0-100)
  const progressPercent = Math.round((currentFrame / totalFrames) * 100);

  return {
    currentFrame,
    totalFrames,
    progressPercent
  };
}

// Content Script側: スクロール情報の送信
function sendScrollMetrics(port) {
  const scrollHeight = document.documentElement.scrollHeight;
  const scrollWidth = document.documentElement.scrollWidth;
  const clientHeight = window.innerHeight;
  const clientWidth = window.innerWidth;

  // 必要なスクロール回数を計算
  const totalRows = Math.ceil(scrollHeight / (clientHeight - 40)); // オーバーラップ考慮
  const totalCols = Math.ceil(scrollWidth / (clientWidth - 30));

  port.postMessage({
    topic: 'scrollDone',
    metrics: {
      currentRow: currentRowIndex,
      currentCol: currentColIndex,
      totalRows,
      totalCols,
      x: window.scrollX,
      y: window.scrollY
    }
  });
}
```

### 13.3 プログレスバーUI実装

#### HTML構造

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Capturing...</title>
  <style>
    body {
      padding: 10px;
      display: flex;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    #main {
      width: 100%;
    }

    /* プログレスバーコンテナ */
    #progressContainer {
      height: 1em;
      width: 100%;
      border: 1px solid #eee;
      border-radius: 4px;
      overflow: hidden;
      background: #f5f5f5;
    }

    /* プログレスバー本体 */
    #progressValue {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #5bc0de, #3498db);
      transition: width 0.1s ease-in-out;
    }

    /* プログレスバーと停止ボタンの配置 */
    #progressAndButton {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    /* 停止ボタン */
    #stopControl {
      display: flex;
      align-items: center;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      background: #f0f0f0;
    }

    #stopControl:hover {
      background: #e0e0e0;
    }

    /* 無限スクロール警告 */
    #infiniteModeWarning {
      margin-top: 10px;
      padding: 8px;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      font-size: 12px;
      display: none;
    }

    /* 処理中ラベル */
    #processingLabel {
      width: 100%;
      text-align: center;
      font-size: 13px;
      color: #666;
      margin-top: 8px;
      opacity: 0;
      transition: opacity 0.2s ease-in;
    }

    #processingLabel.visible {
      opacity: 1;
    }

    /* パーセント表示 */
    #progressPercent {
      font-size: 12px;
      color: #666;
      min-width: 40px;
      text-align: right;
    }
  </style>
</head>

<body>
  <div id="main">
    <div id="capturing">
      <div id="progressAndButton">
        <div id="progressContainer">
          <div id="progressValue"></div>
        </div>
        <span id="progressPercent">0%</span>
        <div id="stopControl" title="Stop capturing">
          <img src="images/stop.png" height="16" width="16">
          <span>Stop</span>
        </div>
      </div>

      <div id="infiniteModeWarning">
        Infinite scrolling mode detected. Stop FireShot when needed.
      </div>
    </div>

    <div id="processingLabel">
      <span>Processing...</span>
    </div>
  </div>

  <script src="scripts/progress.js"></script>
</body>
</html>
```

#### JavaScript実装

```javascript
// progress.js - プログレスウィンドウのスクリプト

class ProgressController {
  constructor() {
    this.progressBar = document.getElementById('progressValue');
    this.progressPercent = document.getElementById('progressPercent');
    this.processingLabel = document.getElementById('processingLabel');
    this.infiniteWarning = document.getElementById('infiniteModeWarning');
    this.stopButton = document.getElementById('stopControl');

    this.isCapturing = true;
    this.setupEventListeners();
    this.listenForProgress();
  }

  setupEventListeners() {
    // 停止ボタン
    this.stopButton.addEventListener('click', () => {
      this.sendStopSignal();
    });

    // Escキーでも停止
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.sendStopSignal();
      }
    });
  }

  listenForProgress() {
    // Service Workerからのメッセージを受信
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'progress':
          this.updateProgress(message.percent);
          break;

        case 'infiniteMode':
          this.showInfiniteWarning();
          break;

        case 'processing':
          this.showProcessingState();
          break;

        case 'complete':
          this.handleComplete();
          break;

        case 'error':
          this.handleError(message.error);
          break;
      }
    });
  }

  updateProgress(percent) {
    // プログレスバーの幅を更新
    this.progressBar.style.width = `${percent}%`;
    this.progressPercent.textContent = `${percent}%`;
  }

  showInfiniteWarning() {
    this.infiniteWarning.style.display = 'block';
  }

  showProcessingState() {
    // キャプチャ完了、画像処理中
    this.progressBar.style.width = '100%';
    this.progressPercent.textContent = '100%';
    this.processingLabel.classList.add('visible');
    this.stopButton.style.display = 'none';
  }

  handleComplete() {
    // ウィンドウを閉じる
    window.close();
  }

  handleError(error) {
    alert(`Error: ${error}`);
    window.close();
  }

  sendStopSignal() {
    chrome.runtime.sendMessage({ type: 'stopCapture' });
    this.isCapturing = false;
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  new ProgressController();
});
```

### 13.4 Service Worker側の進捗送信

```javascript
// service-worker.js - プログレス更新の送信

class CaptureProgressManager {
  constructor() {
    this.progressWindowId = null;
    this.isCancelled = false;
  }

  // プログレスウィンドウを開く
  async openProgressWindow() {
    const window = await chrome.windows.create({
      url: 'progress.html',
      type: 'popup',
      width: 350,
      height: 100,
      focused: false
    });
    this.progressWindowId = window.id;
    return window;
  }

  // 進捗を送信
  sendProgress(currentFrame, totalFrames) {
    const percent = Math.round((currentFrame / totalFrames) * 100);

    // プログレスウィンドウにメッセージ送信
    chrome.runtime.sendMessage({
      type: 'progress',
      percent,
      currentFrame,
      totalFrames
    });
  }

  // 無限スクロールモード警告
  sendInfiniteWarning() {
    chrome.runtime.sendMessage({ type: 'infiniteMode' });
  }

  // 処理中状態に移行
  sendProcessingState() {
    chrome.runtime.sendMessage({ type: 'processing' });
  }

  // 完了通知
  sendComplete() {
    chrome.runtime.sendMessage({ type: 'complete' });

    // プログレスウィンドウを閉じる
    if (this.progressWindowId) {
      chrome.windows.remove(this.progressWindowId);
    }
  }

  // 停止シグナルの受信
  setupStopListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'stopCapture') {
        this.isCancelled = true;
      }
    });
  }
}

// キャプチャループ内での使用例
async function captureWithProgress(tabId) {
  const progressManager = new CaptureProgressManager();
  progressManager.setupStopListener();

  // プログレスウィンドウを開く
  await progressManager.openProgressWindow();

  // キャプチャループ
  let currentFrame = 0;
  const totalFrames = totalRows * totalCols;

  while (hasMoreToCapture() && !progressManager.isCancelled) {
    currentFrame++;

    // スクロール＆キャプチャ
    await scrollAndCapture();

    // 進捗を送信
    progressManager.sendProgress(currentFrame, totalFrames);

    // UIスレッドに制御を戻す
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  if (progressManager.isCancelled) {
    // キャンセル処理
    progressManager.sendComplete();
    return null;
  }

  // 画像処理フェーズ
  progressManager.sendProcessingState();

  // Canvas合成などの重い処理
  const result = await combineFrames(frames);

  // 完了
  progressManager.sendComplete();

  return result;
}
```

### 13.5 アニメーションスピナー（オプション）

フレームアニメーションによるスピナー表示も実装可能。

```javascript
// フレームアニメーション用スピナー
class FrameSpinner {
  constructor(imageElement, frameCount = 30, frameInterval = 50) {
    this.imageElement = imageElement;
    this.frameCount = frameCount;
    this.frameInterval = frameInterval;
    this.currentFrame = 1;
    this.intervalId = null;
  }

  start() {
    this.intervalId = setInterval(() => {
      this.currentFrame = (this.currentFrame % this.frameCount) + 1;
      this.imageElement.src = `images/progress/frame-${this.currentFrame}.png`;
    }, this.frameInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// 使用例
const spinnerImg = document.getElementById('spinner');
const spinner = new FrameSpinner(spinnerImg, 30, 50);
spinner.start();

// 完了時
spinner.stop();
```

### 13.6 拡張機能バッジでの進捗表示

プログレスウィンドウを開かず、拡張機能アイコンのバッジで進捗を表示する方法。

```javascript
// バッジによる進捗表示
async function updateBadgeProgress(percent) {
  // バッジテキストを更新
  await chrome.action.setBadgeText({ text: `${percent}%` });

  // 進捗に応じてバッジの色を変更
  let color;
  if (percent < 33) {
    color = '#e74c3c'; // 赤
  } else if (percent < 66) {
    color = '#f39c12'; // オレンジ
  } else {
    color = '#27ae60'; // 緑
  }

  await chrome.action.setBadgeBackgroundColor({ color });
}

// 完了時にバッジをクリア
async function clearBadge() {
  await chrome.action.setBadgeText({ text: '' });
}

// キャプチャループ内での使用
async function captureWithBadgeProgress() {
  let currentFrame = 0;
  const totalFrames = totalRows * totalCols;

  while (hasMoreToCapture()) {
    currentFrame++;
    const percent = Math.round((currentFrame / totalFrames) * 100);

    await updateBadgeProgress(percent);
    await scrollAndCapture();
  }

  await clearBadge();
}
```

### 13.7 進捗表示のベストプラクティス

| 項目 | 推奨事項 |
|------|----------|
| 更新頻度 | 100ms以上の間隔で更新（頻繁すぎるとパフォーマンス低下） |
| アニメーション | `transition: width 0.1s ease-in-out` でスムーズに |
| フィードバック | 「Processing...」などの状態表示を追加 |
| キャンセル機能 | 必ず停止ボタンを実装（長いページ対応） |
| 無限スクロール | 検出時は警告を表示し、手動停止を促す |
| エラー表示 | キャプチャ失敗時は明確なエラーメッセージ |

### 13.8 進捗計算の注意点

```javascript
// 無限スクロールページの場合
function handleInfiniteScroll(scrollInfo) {
  // スクロール高さが動的に変化する場合
  if (scrollInfo.scrollHeightChanged) {
    // 進捗率を再計算
    const newTotalRows = Math.ceil(
      scrollInfo.newScrollHeight / (clientHeight - 40)
    );

    // 警告を表示
    showInfiniteWarning();

    // 進捗は「現在位置 / 現時点での高さ」で計算
    // ただし100%になることはない（常に増加する可能性）
    return {
      percent: Math.min(95, calculatePercent()), // 最大95%に制限
      isInfinite: true
    };
  }
}
```

---

*このドキュメントはFireShot v2.1.4.7の解析に基づいて作成されました。*
*独自機能の追加時は、このアーキテクチャを基盤として拡張することを推奨します。*
