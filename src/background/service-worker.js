// Service Worker for SitePrinter Chrome Extension

// Custom error for cancelled operations
class CancelledError extends Error {
  constructor(message = 'キャプチャがキャンセルされました') {
    super(message);
    this.name = 'CancelledError';
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
// Style Modification Helper Functions
// ========================================

// Generate code to hide fixed/sticky elements
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

  sendProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    console.log(`[ProgressManager] Sending progress: ${percent}% (${current}/${total})`);
    chrome.runtime.sendMessage({
      type: 'progress',
      percent,
      current,
      total,
    }).catch((error) => {
      // Window might be closed by user, ignore error
      console.warn('[ProgressManager] Failed to send progress:', error.message);
    });
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

  // Activate tab
  await chrome.tabs.update(tabId, { active: true });
  await sleep(300);

  // Force reload if option is enabled
  const { forceReload } = await chrome.storage.local.get({ forceReload: false });
  if (forceReload) {
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
    await sleep(500);
  }

  // Initialize progress manager
  const progressManager = new ProgressManager();
  await progressManager.open();
  progressManager.sendTitle(tab.title || 'Untitled');

  // Set up cancel listener
  const cancelListener = (message, sender, sendResponse) => {
    if (message.type === 'cancel') {
      console.log('[SitePrinter] Received cancel request');
      progressManager.cancel();
    }
  };
  chrome.runtime.onMessage.addListener(cancelListener);

  // Ensure content script is loaded
  console.log('[SitePrinter] Ensuring content script is loaded...');
  let contentScriptLoaded = false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return window.__sitePrinterContentScriptLoaded === true;
      },
    });
    contentScriptLoaded = results && results[0] && results[0].result === true;
    console.log('[SitePrinter] Content script loaded status:', contentScriptLoaded);
  } catch (error) {
    console.log('[SitePrinter] Content script check failed:', error.message);
  }

  // If content script is not loaded, inject it
  if (!contentScriptLoaded) {
    console.log('[SitePrinter] Injecting content script...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js'],
      });
      console.log('[SitePrinter] Content script injected successfully');
      await sleep(500); // Wait for content script to initialize
    } catch (error) {
      await progressManager.close();
      throw new Error(`Failed to inject content script: ${error.message}`);
    }
  } else {
    await sleep(200);
  }

  // Connect to content script via Port
  console.log('[SitePrinter] Connecting to content script...');
  const port = chrome.tabs.connect(tabId, { name: 'capture' });

  let portClosed = false;
  let disconnectReason = null;
  port.onDisconnect.addListener(() => {
    portClosed = true;
    disconnectReason = chrome.runtime.lastError?.message || 'Unknown reason';
    console.log('[SitePrinter] Port disconnected:', disconnectReason);
  });

  try {
    // Helper to send message and wait for response
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

        // Timeout after 10 seconds
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

    // Initialize page for capture
    console.log('[SitePrinter] Initializing page for capture...');
    const initResponse = await sendPortMessage({ type: 'init' });

    if (!initResponse.success) {
      throw new Error(`Failed to initialize: ${initResponse.error}`);
    }

    const { scrollHeight, scrollWidth, clientHeight, clientWidth } = initResponse;
    const width = scrollWidth;
    const height = scrollHeight;

    console.log(`[SitePrinter] Page dimensions: ${width}x${height}px, viewport: ${clientWidth}x${clientHeight}px`);

    // Limits for screenshot capture
    const MAX_TOTAL_HEIGHT = 150000; // Maximum total page height
    const viewportHeight = clientHeight;

    let actualHeight = height;
    if (actualHeight > MAX_TOTAL_HEIGHT) {
      console.warn(`[SitePrinter] Page height (${actualHeight}px) exceeds maximum (${MAX_TOTAL_HEIGHT}px). Capping to maximum.`);
      actualHeight = MAX_TOTAL_HEIGHT;
    }

    // Calculate how many sections we need
    const SECTION_OVERLAP = 100; // Overlap to avoid missing content at boundaries
    const sections = [];
    const sectionPositions = [];
    let currentY = 0;

    // Generate section positions
    while (currentY < actualHeight) {
      sectionPositions.push(currentY);
      currentY += viewportHeight - SECTION_OVERLAP;
    }

    console.log(`[SitePrinter] Capturing ${sectionPositions.length} sections...`);

    // Capture each section
    // Note: Chrome limits captureVisibleTab to 2 calls per second
    const MIN_CAPTURE_INTERVAL = 600; // Minimum 600ms between captures (for 2 calls/sec limit)

    for (let i = 0; i < sectionPositions.length; i++) {
      // Check if cancelled
      if (progressManager.isCancelled()) {
        console.log('[SitePrinter] Capture cancelled, stopping...');
        throw new CancelledError();
      }

      const captureStartTime = Date.now();
      const scrollY = sectionPositions[i];

      // Scroll to position
      const scrollResponse = await sendPortMessage({
        type: 'scrollTo',
        x: 0,
        y: scrollY,
      });

      if (!scrollResponse.success) {
        console.warn(`[SitePrinter] Failed to scroll to ${scrollY}: ${scrollResponse.error}`);
      }

      // Wait for content to settle
      await sleep(200);

      // Capture visible tab
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
      });

      // Get actual image dimensions
      const base64Data = dataUrl.replace('data:image/png;base64,', '');
      const blob = await fetch(dataUrl).then(r => r.blob());
      const bitmap = await createImageBitmap(blob);
      const actualImageHeight = bitmap.height;
      const actualImageWidth = bitmap.width;
      bitmap.close();

      // Use the ACTUAL scroll position from the content script response.
      // The browser clamps scroll past the max (scrollHeight - clientHeight),
      // so the actual Y may be less than the requested scrollY.
      const actualScrollY = scrollResponse.y ?? scrollY;

      sections.push({
        data: base64Data,
        offsetY: actualScrollY,
        height: actualImageHeight,
        width: actualImageWidth,
      });

      console.log(`[SitePrinter] Section ${i + 1} actual size: ${actualImageWidth}x${actualImageHeight}px`);
      console.log(`[SitePrinter] Captured section ${i + 1}/${sectionPositions.length} at scroll position ${actualScrollY}px (requested: ${scrollY}px)`);

      // After the first section, hide fixed/sticky elements so they don't
      // appear in every subsequent section (would cause header duplication).
      if (i === 0 && sectionPositions.length > 1) {
        console.log('[SitePrinter] Hiding fixed/sticky elements for remaining sections...');
        await sendPortMessage({ type: 'hideFixed' });
      }

      // Update progress
      progressManager.sendProgress(i + 1, sectionPositions.length);

      // Ensure we don't exceed Chrome's rate limit (2 captures per second)
      const elapsed = Date.now() - captureStartTime;
      const remainingDelay = MIN_CAPTURE_INTERVAL - elapsed;
      if (remainingDelay > 0 && i < sectionPositions.length - 1) {
        console.log(`[SitePrinter] Waiting ${remainingDelay}ms to respect rate limit...`);
        await sleep(remainingDelay);
      }
    }

    // Compute device pixel ratio from actual captured image vs CSS client dimensions.
    // captureVisibleTab returns physical pixels, but clientWidth is CSS (logical) pixels.
    const dpr = (sections.length > 0 && clientWidth > 0) ? sections[0].width / clientWidth : 1;
    console.log(`[SitePrinter] Detected device pixel ratio: ${dpr}`);

    // Show processing state
    progressManager.sendProcessing();

    // Stitch sections together
    console.log(`[SitePrinter] Stitching ${sections.length} sections...`);
    let finalDataUrl;

    if (sections.length === 1) {
      // Single section, no stitching needed
      finalDataUrl = `data:image/png;base64,${sections[0].data}`;
    } else {
      // Stitch multiple sections using physical pixel dimensions
      try {
        const physicalWidth = sections[0].width;
        const physicalTotalHeight = Math.round(actualHeight * dpr);
        finalDataUrl = await stitchSections(sections, physicalWidth, physicalTotalHeight, dpr);
        console.log(`[SitePrinter] Successfully stitched ${sections.length} sections`);
      } catch (error) {
        console.error('[SitePrinter] Failed to stitch sections:', error);
        // Fall back to first section
        finalDataUrl = `data:image/png;base64,${sections[0].data}`;
        console.warn('[SitePrinter] Using first section as fallback');
      }
    }

    // Cleanup
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
    console.error('[SitePrinter] Capture error:', error);
    throw error;
  } finally {
    // Remove cancel listener
    chrome.runtime.onMessage.removeListener(cancelListener);

    // Close progress window
    await progressManager.close();

    // Close port
    try {
      if (!portClosed) {
        port.disconnect();
      }
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}

// Stitch multiple screenshot sections into a single image.
// sections[i].offsetY must be the ACTUAL scroll position (CSS px) reported by the browser,
// not the requested position, so that scroll-clamping at the page bottom is handled correctly.
async function stitchSections(sections, width, totalHeight, dpr) {
  const physicalViewportHeight = sections[0].height; // physical px height of one viewport capture

  // Compute the physical overlap for section i based on actual scroll positions.
  // When the browser clamps scroll (e.g. last section), the overlap is larger than expected
  // and must be calculated from the actual distance between consecutive scroll positions.
  function getActualOverlap(i) {
    if (i === 0) return 0;
    const prevEndCSS = sections[i - 1].offsetY + physicalViewportHeight / dpr;
    const curStartCSS = sections[i].offsetY;
    return Math.max(0, Math.round((prevEndCSS - curStartCSS) * dpr));
  }

  // Calculate stitched height using per-section actual overlaps
  let stitchedHeight = 0;
  for (let i = 0; i < sections.length; i++) {
    stitchedHeight += Math.max(0, sections[i].height - getActualOverlap(i));
  }

  console.log(`[SitePrinter] Calculated stitched height: ${stitchedHeight}px (totalHeight: ${totalHeight}px)`);

  const canvasHeight = Math.min(stitchedHeight, totalHeight);

  const canvas = new OffscreenCanvas(width, canvasHeight);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, canvasHeight);

  let currentY = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    const response = await fetch(`data:image/png;base64,${section.data}`);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const actualOverlap = getActualOverlap(i);
    let sourceY = actualOverlap;
    let sourceHeight = imageBitmap.height - actualOverlap;
    const destY = currentY;

    const availableHeight = canvasHeight - destY;
    if (sourceHeight > availableHeight) {
      console.warn(`[SitePrinter] Section ${i + 1} clipped: ${sourceHeight}px -> ${availableHeight}px`);
      sourceHeight = availableHeight;
    }

    console.log(`[SitePrinter] Drawing section ${i + 1}: source(0,${sourceY},${imageBitmap.width},${sourceHeight}) -> dest(0,${destY},${width},${sourceHeight}) [overlap:${actualOverlap}px]`);

    if (sourceHeight > 0) {
      ctx.drawImage(imageBitmap, 0, sourceY, imageBitmap.width, sourceHeight, 0, destY, width, sourceHeight);
      currentY += sourceHeight;
    }

    imageBitmap.close();
  }

  console.log(`[SitePrinter] Final stitched position: ${currentY}px / ${canvasHeight}px`);

  // Convert canvas to blob and then to base64
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert to base64
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  const base64 = btoa(binary);

  return `data:image/png;base64,${base64}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Handle extension icon click (optional: direct capture)
chrome.action.onClicked.addListener(async (tab) => {
  // The popup handles this, but this is a fallback
});
