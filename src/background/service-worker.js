// Service Worker for SitePrinter Chrome Extension

const SW_STRINGS = {
  ja: {
    reloading:   'ページを再読み込みしています...',
    loading:     'コンテンツを読み込んでいます...',
    animating:   'アニメーションを起動しています...',
    scrollBack:  'ページ先頭に戻っています...',
    capturing:   'スクリーンショットを取得中...',
    processing:  'PDF用データを処理中...',
  },
  en: {
    reloading:   'Reloading page...',
    loading:     'Loading content...',
    animating:   'Triggering animations...',
    scrollBack:  'Scrolling back to top...',
    capturing:   'Capturing screenshot...',
    processing:  'Processing data for PDF...',
  },
};

async function sw(key) {
  const langs = await new Promise((resolve) => chrome.i18n.getAcceptLanguages(resolve));
  const lang = (langs[0] || '').startsWith('ja') ? 'ja' : 'en';
  return SW_STRINGS[lang][key] || SW_STRINGS.en[key] || key;
}

const CONTEXT_MENU_ID = 'siteprinter-capture';

async function updateContextMenu() {
  await chrome.contextMenus.removeAll();
  const { contextMenuEnabled } = await chrome.storage.local.get({ contextMenuEnabled: true });
  if (contextMenuEnabled) {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: chrome.i18n.getMessage('contextMenuTitle'),
      contexts: ['page'],
    });
  }
}

chrome.runtime.onInstalled.addListener(updateContextMenu);
chrome.runtime.onStartup.addListener(updateContextMenu);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'contextMenuEnabled' in changes) {
    updateContextMenu();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab) {
    try {
      await handleCaptureScreenshots([tab.id]);
    } catch (error) {
      console.error('Context menu capture failed:', error);
    }
  }
});

// Custom error for cancelled operations
class CancelledError extends Error {
  constructor(message = 'Capture cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openOptionsPage') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === 'captureScreenshots') {
    // Acknowledge immediately so the popup can safely close before capture completes.
    // Avoids message loss when the service worker was dormant and the popup closes
    // before the SW finishes waking up.
    sendResponse({ received: true });

    (async () => {
      try {
        await handleCaptureScreenshots(request.tabIds);
      } catch (error) {
        console.error('Capture failed:', error);
      }
    })();

    return false;
  }
});

// ========================================
// Progress Manager
// ========================================

class ProgressManager {
  constructor() {
    this.progressWindowId = null;
    this.totalSections = 0;
    this.currentSection = 0;
    this.isReady = false;
    this.readyPromise = null;
    this.readyResolve = null;
    this.cancelled = false;
  }

  async open() {
    try {
      const url = chrome.runtime.getURL('src/progress/progress.html');
      console.log('[ProgressManager] Opening progress window with URL:', url);

      // Create a promise that resolves when the window is ready
      this.readyPromise = new Promise((resolve) => {
        this.readyResolve = resolve;
      });

      // Set up listener for ready message
      const readyListener = (message, sender, sendResponse) => {
        if (message.type === 'progressReady') {
          console.log('[ProgressManager] Progress window is ready');
          this.isReady = true;
          if (this.readyResolve) {
            this.readyResolve();
            this.readyResolve = null; // Prevent multiple calls
          }
          chrome.runtime.onMessage.removeListener(readyListener);
        }
      };
      chrome.runtime.onMessage.addListener(readyListener);

      const window = await chrome.windows.create({
        url: url,
        type: 'popup',
        width: 400,
        height: 230,
        focused: true,  // Focus the window so it's visible
        left: 100,      // Position from left edge
        top: 100,       // Position from top edge
      });
      this.progressWindowId = window.id;
      console.log('[ProgressManager] Progress window opened with ID:', this.progressWindowId);

      // Wait for ready signal or timeout after 3 seconds
      const timeoutPromise = sleep(3000).then(() => {
        if (!this.isReady) {
          console.warn('[ProgressManager] Timeout waiting for progress window ready signal');
          this.isReady = true;
        }
      });

      await Promise.race([
        this.readyPromise,
        timeoutPromise
      ]);

      console.log('[ProgressManager] Progress window initialization complete');
    } catch (error) {
      console.error('[ProgressManager] Failed to open progress window:', error);
      this.isReady = true; // Continue without progress window
    }
  }

  sendTitle(title) {
    chrome.runtime.sendMessage({
      type: 'title',
      title: title || '',
    }).catch(() => {});
  }

  sendProgress(current, total, estimatedRemainingMs = null) {
    const percent = Math.round((current / total) * 100);
    console.log(`[ProgressManager] Sending progress: ${percent}% (${current}/${total})`);
    chrome.runtime.sendMessage({
      type: 'progress',
      percent,
      current,
      total,
      estimatedRemainingMs,
    }).catch((error) => {
      // Window might be closed by user, ignore error
      console.warn('[ProgressManager] Failed to send progress:', error.message);
    });
  }

  sendStatus(text) {
    chrome.runtime.sendMessage({
      type: 'status',
      text,
    }).catch(() => {});
  }

  sendProcessing() {
    chrome.runtime.sendMessage({
      type: 'processing',
    }).catch(() => {});
  }

  async close() {
    // Send complete message
    chrome.runtime.sendMessage({
      type: 'complete',
    }).catch(() => {});

    // Wait a bit before closing
    await sleep(300);

    // Close window
    if (this.progressWindowId) {
      try {
        await chrome.windows.remove(this.progressWindowId);
      } catch (e) {
        // Already closed by user
      }
    }
  }

  sendError(error) {
    chrome.runtime.sendMessage({
      type: 'error',
      error: error,
    }).catch(() => {});
  }

  sendWarning(text) {
    chrome.runtime.sendMessage({
      type: 'warning',
      text,
    }).catch(() => {});
  }

  cancel() {
    console.log('[ProgressManager] Capture cancelled by user');
    this.cancelled = true;
  }

  isCancelled() {
    return this.cancelled;
  }
}

async function handleCaptureScreenshots(tabIds) {
  const screenshots = [];
  let wasCancelled = false;

  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        console.warn(`[SitePrinter] Skipping non-injectable tab: ${tab.url}`);
        continue;
      }
      const screenshot = await captureFullPage(tabId);
      screenshots.push(screenshot);
    } catch (error) {
      // Check if operation was cancelled
      if (error instanceof CancelledError) {
        console.log('[SitePrinter] Capture was cancelled by user');
        wasCancelled = true;
        break; // Stop processing remaining tabs
      }

      console.error(`Failed to capture tab ${tabId}:`, error);
      screenshots.push({
        tabId,
        error: error.message,
        title: 'Error',
        url: '',
        dataUrl: null,
      });
    }
  }

  // Only open preview if not cancelled
  if (!wasCancelled) {
    const { forceReload } = await chrome.storage.local.get({ forceReload: false });
    // Store screenshots data
    await chrome.storage.local.set({
      screenshots,
      capturedAt: new Date().toISOString(),
      capturedWithReload: forceReload,
    });

    // Open preview page
    await chrome.tabs.create({
      url: chrome.runtime.getURL('src/preview/preview.html'),
    });
  }

  return { success: !wasCancelled };
}

async function captureFullPage(tabId) {
  const tab = await chrome.tabs.get(tabId);

  await chrome.tabs.update(tabId, { active: true });
  await sleep(300);

  const { forceReload, imageFormat } = await chrome.storage.local.get({ forceReload: false, imageFormat: 'jpeg' });
  const captureFormat = imageFormat === 'png' ? 'png' : 'jpeg';
  const mimeType = captureFormat === 'png' ? 'image/png' : 'image/jpeg';

  const progressManager = new ProgressManager();
  await progressManager.open();
  progressManager.sendTitle(tab.title || 'Untitled');

  const cancelListener = (message, sender, sendResponse) => {
    if (message.type === 'cancel') {
      console.log('[SitePrinter] Received cancel request');
      progressManager.cancel();
    }
  };
  chrome.runtime.onMessage.addListener(cancelListener);

  if (forceReload) {
    progressManager.sendStatus(await sw('reloading'));
    await new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.reload(tabId);
    });
    const reloadedTab = await chrome.tabs.get(tabId);
    progressManager.sendTitle(reloadedTab.title || tab.title || 'Untitled');
    progressManager.sendStatus(await sw('loading'));
    await sleep(500);
  }

  let contentScriptLoaded = false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__sitePrinterContentScriptLoaded === true,
    });
    contentScriptLoaded = results && results[0] && results[0].result === true;
  } catch (error) {
    console.log('[SitePrinter] Content script check failed:', error.message);
  }

  if (!contentScriptLoaded) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js'],
      });
      await sleep(500);
    } catch (error) {
      await progressManager.close();
      throw new Error(`Failed to inject content script: ${error.message}`);
    }
  } else {
    await sleep(200);
  }

  const port = chrome.tabs.connect(tabId, { name: 'capture' });

  let portClosed = false;
  let disconnectReason = null;
  port.onDisconnect.addListener(() => {
    portClosed = true;
    disconnectReason = chrome.runtime.lastError?.message || 'Unknown reason';
    console.log('[SitePrinter] Port disconnected:', disconnectReason);
  });

  try {
    const sendPortMessage = (message) => {
      return new Promise((resolve, reject) => {
        if (portClosed) {
          reject(new Error(`Port is closed: ${disconnectReason}`));
          return;
        }

        const listener = (response) => {
          port.onMessage.removeListener(listener);
          clearTimeout(timeout);
          resolve(response);
        };
        port.onMessage.addListener(listener);

        const timeout = setTimeout(() => {
          port.onMessage.removeListener(listener);
          const errorMsg = portClosed
            ? `Port closed while waiting for ${message.type} response: ${disconnectReason}`
            : `Timeout waiting for ${message.type} response`;
          reject(new Error(errorMsg));
        }, 10000);

        try {
          port.postMessage(message);
          console.log(`[SitePrinter] Sent message to content script:`, message.type);
        } catch (error) {
          clearTimeout(timeout);
          port.onMessage.removeListener(listener);
          reject(new Error(`Failed to send ${message.type}: ${error.message}`));
        }
      });
    };

    const initResponse = await sendPortMessage({ type: 'init' });

    if (!initResponse.success) {
      throw new Error(`Failed to initialize: ${initResponse.error}`);
    }

    const { scrollHeight, scrollWidth, clientHeight, clientWidth } = initResponse;
    const width = scrollWidth;
    const height = scrollHeight;

    console.log(`[SitePrinter] Page dimensions: ${width}x${height}px, viewport: ${clientWidth}x${clientHeight}px`);

    // Scroll pre-scan: trigger scroll-based animations before capturing
    if (forceReload) {
      progressManager.sendStatus(await sw('animating'));
      await sendPortMessage({ type: 'scrollTo', x: 0, y: height });
      await sleep(1500);
      progressManager.sendStatus(await sw('scrollBack'));
      await sendPortMessage({ type: 'scrollTo', x: 0, y: 0 });
      await sleep(500);
    }

    progressManager.sendStatus(await sw('capturing'));

    const MAX_TOTAL_HEIGHT = 150000;
    const viewportHeight = clientHeight;

    let actualHeight = height;
    if (actualHeight > MAX_TOTAL_HEIGHT) {
      console.warn(`[SitePrinter] Page height (${actualHeight}px) exceeds maximum (${MAX_TOTAL_HEIGHT}px). Capping to maximum.`);
      actualHeight = MAX_TOTAL_HEIGHT;
      progressManager.sendWarning('⚠️ This page is very long. PDF generation will take 2–5 minutes.');
    }

    const SECTION_OVERLAP = 100;
    const sections = [];
    const sectionPositions = [];
    let currentY = 0;

    while (currentY < actualHeight) {
      sectionPositions.push(currentY);
      currentY += viewportHeight - SECTION_OVERLAP;
    }

    // Chrome limits captureVisibleTab to 2 calls per second
    const MIN_CAPTURE_INTERVAL = 600;
    const captureAllStartTime = Date.now();

    for (let i = 0; i < sectionPositions.length; i++) {
      if (progressManager.isCancelled()) {
        throw new CancelledError();
      }

      const captureStartTime = Date.now();
      const scrollY = sectionPositions[i];

      const scrollResponse = await sendPortMessage({ type: 'scrollTo', x: 0, y: scrollY });

      if (!scrollResponse.success) {
        console.warn(`[SitePrinter] Failed to scroll to ${scrollY}: ${scrollResponse.error}`);
      }

      await sleep(200);

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: captureFormat,
        ...(captureFormat === 'jpeg' ? { quality: 92 } : {}),
      });

      const base64Data = dataUrl.split(',')[1];
      const blob = await fetch(dataUrl).then(r => r.blob());
      const bitmap = await createImageBitmap(blob);
      const actualImageHeight = bitmap.height;
      const actualImageWidth = bitmap.width;
      bitmap.close();

      // ブラウザはページ末尾でスクロールをクランプするため、実際のY位置を使用する
      const actualScrollY = scrollResponse.y ?? scrollY;

      sections.push({
        data: base64Data,
        offsetY: actualScrollY,
        height: actualImageHeight,
        width: actualImageWidth,
      });

      console.log(`[SitePrinter] Captured section ${i + 1}/${sectionPositions.length} at y=${actualScrollY}px`);

      // 1枚目のキャプチャ後にfixed/sticky要素を非表示にする（2枚目以降の重複防止）
      if (i === 0 && sectionPositions.length > 1) {
        await sendPortMessage({ type: 'hideFixed' });
      }

      // Calculate estimated remaining time
      const elapsedTotal = Date.now() - captureAllStartTime;
      const avgTimePerSection = elapsedTotal / (i + 1);
      const remainingSections = sectionPositions.length - (i + 1);
      const estimatedRemainingMs = Math.round(remainingSections * avgTimePerSection);

      progressManager.sendProgress(i + 1, sectionPositions.length, estimatedRemainingMs);

      const elapsed = Date.now() - captureStartTime;
      const remainingDelay = MIN_CAPTURE_INTERVAL - elapsed;
      if (remainingDelay > 0 && i < sectionPositions.length - 1) {
        await sleep(remainingDelay);
      }
    }

    // captureVisibleTab は物理ピクセルを返すため、CSS論理ピクセルとの比率を計算する
    const dpr = (sections.length > 0 && clientWidth > 0 && sections[0].width > 0) ? sections[0].width / clientWidth : 1;

    progressManager.sendStatus(await sw('processing'));
    progressManager.sendProcessing();

    let finalDataUrl;

    if (sections.length === 1) {
      finalDataUrl = `data:${mimeType};base64,${sections[0].data}`;
    } else {
      try {
        const physicalWidth = sections[0].width;
        const physicalTotalHeight = Math.round(actualHeight * dpr);
        finalDataUrl = await stitchSections(sections, physicalWidth, physicalTotalHeight, dpr, mimeType);
        console.log(`[SitePrinter] Successfully stitched ${sections.length} sections`);
      } catch (error) {
        console.error('[SitePrinter] Failed to stitch sections:', error);
        // Fall back to first section
        finalDataUrl = `data:${mimeType};base64,${sections[0].data}`;
        console.warn('[SitePrinter] Using first section as fallback');
      }
    }

    await sendPortMessage({ type: 'cleanup' });

    return {
      tabId,
      title: tab.title || 'Untitled',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl || '',
      dataUrl: finalDataUrl,
      width,
      height: actualHeight,
    };
  } catch (error) {
    if (error instanceof CancelledError) {
      console.log('[SitePrinter] Capture cancelled by user');
    } else {
      console.error('[SitePrinter] Capture error:', error);
    }
    throw error;
  } finally {
    chrome.runtime.onMessage.removeListener(cancelListener);
    await progressManager.close();
    try {
      if (!portClosed) {
        port.disconnect();
      }
    } catch (e) {
      // ignore
    }
  }
}

// Stitch multiple screenshot sections into a single image.
// sections[i].offsetY must be the ACTUAL scroll position (CSS px) reported by the browser,
// not the requested position, so that scroll-clamping at the page bottom is handled correctly.
async function stitchSections(sections, width, totalHeight, dpr, mimeType = 'image/jpeg') {
  const physicalViewportHeight = sections[0].height;

  // ブラウザがスクロールをクランプする（末尾セクション等）場合、重複量が想定より大きくなる。
  // 実際のスクロール位置の差分から算出することで正確に対応する。
  function getActualOverlap(i) {
    if (i === 0) return 0;
    const prevEndCSS = sections[i - 1].offsetY + physicalViewportHeight / dpr;
    const curStartCSS = sections[i].offsetY;
    const overlap = Math.round((prevEndCSS - curStartCSS) * dpr);
    return Number.isFinite(overlap) ? Math.max(0, overlap) : 0;
  }

  let stitchedHeight = 0;
  for (let i = 0; i < sections.length; i++) {
    stitchedHeight += Math.max(0, sections[i].height - getActualOverlap(i));
  }

  console.log(`[SitePrinter] Calculated stitched height: ${stitchedHeight}px (totalHeight: ${totalHeight}px)`);

  const rawHeight = Math.min(stitchedHeight, totalHeight);

  if (!(width > 0) || !(rawHeight > 0)) {
    throw new Error(`Invalid canvas size: ${width}x${rawHeight} (stitchedHeight=${stitchedHeight}, totalHeight=${totalHeight}, dpr=${dpr})`);
  }

  // convertToBlob needs ~2× raw pixel bytes (canvas + PNG encoder buffer).
  // Cap at 50M pixels (~400MB peak) to stay within Service Worker memory limits.
  const MAX_CANVAS_PIXELS = 50_000_000;
  const scale = (width * rawHeight) > MAX_CANVAS_PIXELS
    ? Math.sqrt(MAX_CANVAS_PIXELS / (width * rawHeight))
    : 1;
  const canvasW = Math.max(1, Math.round(width * scale));
  const canvasH = Math.max(1, Math.round(rawHeight * scale));

  if (scale < 1) {
    console.warn(`[SitePrinter] Canvas scaled to ${Math.round(scale * 100)}% (${canvasW}x${canvasH}px) due to memory limits`);
  }

  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  let currentY = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    const response = await fetch(`data:${mimeType};base64,${section.data}`);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const actualOverlap = getActualOverlap(i);
    const sourceY = actualOverlap;
    const sourceH = imageBitmap.height - actualOverlap;
    const destY = Math.round(currentY * scale);
    const destH = Math.round(sourceH * scale);
    const available = canvasH - destY;

    if (sourceH > 0 && destH > 0 && available > 0) {
      const drawDestH = Math.min(destH, available);
      const drawSrcH = Math.min(Math.round(drawDestH / scale), imageBitmap.height - sourceY);
      console.log(`[SitePrinter] Drawing section ${i + 1}: src(0,${sourceY},${imageBitmap.width},${drawSrcH}) -> dest(0,${destY},${canvasW},${drawDestH}) [overlap:${actualOverlap}px, scale:${scale.toFixed(2)}]`);
      ctx.drawImage(imageBitmap, 0, sourceY, imageBitmap.width, drawSrcH, 0, destY, canvasW, drawDestH);
    }

    currentY += sourceH;
    imageBitmap.close();
  }

  console.log(`[SitePrinter] Final stitched: ${canvasW}x${canvasH}px (scale=${scale.toFixed(2)})`);


  const blob = await canvas.convertToBlob({
    type: mimeType,
    ...(mimeType === 'image/jpeg' ? { quality: 0.92 } : {}),
  });
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  const base64 = btoa(binary);

  return `data:${mimeType};base64,${base64}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

chrome.action.onClicked.addListener(async (tab) => {});
