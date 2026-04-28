// Service Worker for SitePrinter Chrome Extension

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshots') {
    handleCaptureScreenshots(request.tabIds)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

async function handleCaptureScreenshots(tabIds) {
  const screenshots = [];

  for (const tabId of tabIds) {
    try {
      const screenshot = await captureFullPage(tabId);
      screenshots.push(screenshot);
    } catch (error) {
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

  // Store screenshots data
  await chrome.storage.local.set({
    screenshots,
    capturedAt: new Date().toISOString(),
  });

  // Open preview page
  await chrome.tabs.create({
    url: chrome.runtime.getURL('src/preview/preview.html'),
  });

  return { success: true };
}

async function captureFullPage(tabId) {
  // Get tab info
  const tab = await chrome.tabs.get(tabId);

  // Activate the tab first
  await chrome.tabs.update(tabId, { active: true });

  // Wait a bit for the tab to be fully active
  await sleep(300);

  // Attach debugger
  const debuggeeId = { tabId };

  try {
    await chrome.debugger.attach(debuggeeId, '1.3');
  } catch (error) {
    // Debugger might already be attached
    if (!error.message.includes('Another debugger is already attached')) {
      throw error;
    }
  }

  try {
    // Get page metrics
    const layoutMetrics = await chrome.debugger.sendCommand(
      debuggeeId,
      'Page.getLayoutMetrics'
    );

    const { contentSize } = layoutMetrics;
    const width = Math.ceil(contentSize.width);
    const height = Math.ceil(contentSize.height);

    // Set viewport to full page size
    await chrome.debugger.sendCommand(debuggeeId, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Wait for rendering
    await sleep(500);

    // Capture screenshot
    const result = await chrome.debugger.sendCommand(
      debuggeeId,
      'Page.captureScreenshot',
      {
        format: 'png',
        captureBeyondViewport: true,
      }
    );

    // Reset viewport
    await chrome.debugger.sendCommand(
      debuggeeId,
      'Emulation.clearDeviceMetricsOverride'
    );

    return {
      tabId,
      title: tab.title || 'Untitled',
      url: tab.url || '',
      dataUrl: `data:image/png;base64,${result.data}`,
      width,
      height,
    };
  } finally {
    // Always detach debugger
    try {
      await chrome.debugger.detach(debuggeeId);
    } catch (e) {
      // Ignore detach errors
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Handle extension icon click (optional: direct capture)
chrome.action.onClicked.addListener(async (tab) => {
  // The popup handles this, but this is a fallback
});
