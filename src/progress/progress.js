// Progress window controller for SitePrinter Chrome Extension

class ProgressController {
  constructor() {
    this.progressBar = document.getElementById('progressValue');
    this.progressPercent = document.getElementById('progressPercent');
    this.processingLabel = document.getElementById('processingLabel');
    this.pageTitle = document.getElementById('pageTitle');

    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Progress] Received message:', message);
      switch (message.type) {
        case 'title':
          this.updateTitle(message.title);
          break;

        case 'progress':
          this.updateProgress(message.percent, message.current, message.total);
          break;

        case 'processing':
          this.showProcessing();
          break;

        case 'complete':
          this.handleComplete();
          break;

        case 'error':
          this.showError(message.error);
          break;

        default:
          console.warn('[Progress] Unknown message type:', message.type);
      }
    });
  }

  updateTitle(title) {
    this.pageTitle.textContent = title;
    this.pageTitle.title = title; // tooltip shows full title on hover
  }

  updateProgress(percent, current, total) {
    // Ensure percent is within 0-100
    const clampedPercent = Math.max(0, Math.min(100, percent));

    // Update progress bar width
    this.progressBar.style.width = `${clampedPercent}%`;

    // Update percentage text
    this.progressPercent.textContent = `${clampedPercent}%`;

    console.log(`[Progress] ${clampedPercent}% (${current}/${total})`);
  }

  showProcessing() {
    // Set progress to 100%
    this.progressBar.style.width = '100%';
    this.progressPercent.textContent = '100%';

    // Show processing label
    this.processingLabel.classList.remove('hidden');

    console.log('[Progress] Processing...');
  }

  handleComplete() {
    console.log('[Progress] Complete, closing window...');

    // Window will be closed by service worker
    // Just show completion state briefly
    setTimeout(() => {
      if (window) {
        window.close();
      }
    }, 500);
  }

  showError(error) {
    console.error('[Progress] Error:', error);

    // Show error in the UI
    this.processingLabel.textContent = `Error: ${error}`;
    this.processingLabel.classList.remove('hidden');
    this.processingLabel.style.color = '#ef4444';

    // Close after delay
    setTimeout(() => {
      window.close();
    }, 2000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ProgressController();
  console.log('[Progress] Progress window initialized');

  // Send ready signal to service worker
  chrome.runtime.sendMessage({ type: 'progressReady' }).then(() => {
    console.log('[Progress] Ready signal sent to service worker');
  }).catch((error) => {
    console.error('[Progress] Failed to send ready signal:', error);
  });
});
