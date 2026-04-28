// Content Script for SitePrinter Chrome Extension
// This script runs in the context of web pages

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    sendResponse({
      title: document.title,
      url: window.location.href,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    });
    return true;
  }
});

// Notify background script that content script is loaded
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' }).catch(() => {
  // Ignore errors (background might not be listening)
});
