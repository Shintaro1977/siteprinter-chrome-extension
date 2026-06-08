// Progress window controller for SitePrinter Chrome Extension
import { t } from '../lib/i18n.js';

class ProgressController {
  constructor() {
    this.progressBar = document.getElementById('progressValue');
    this.progressPercent = document.getElementById('progressPercent');
    this.processingLabel = document.getElementById('processingLabel');
    this.pageTitle = document.getElementById('pageTitle');
    this.statusLabel = document.getElementById('statusLabel');
    this.cancelBtn = document.getElementById('cancelBtn');

    this.setupMessageListener();
    this.setupCancelButton();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Ignore messages without a type property
      if (!message || !message.type) {
        return;
      }

      console.log('[Progress] Received message:', message);
      switch (message.type) {
        case 'title':
          this.updateTitle(message.title);
          break;

        case 'status':
          this.updateStatus(message.text);
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

        case 'warning':
          this.showWarning(message.text);
          break;

        default:
          console.warn('[Progress] Unknown message type:', message.type);
      }
    });
  }

  setupCancelButton() {
    this.cancelBtn.addEventListener('click', () => {
      console.log('[Progress] Cancel button clicked');

      // Disable button to prevent multiple clicks
      this.cancelBtn.disabled = true;
      this.cancelBtn.textContent = t('cancelling');

      // Send cancel message to service worker
      chrome.runtime.sendMessage({ type: 'cancel' }).catch((error) => {
        console.error('[Progress] Failed to send cancel message:', error);
      });
    });
  }

  updateTitle(title) {
    this.pageTitle.textContent = title;
    this.pageTitle.title = title;
  }

  updateStatus(text) {
    this.statusLabel.textContent = text;
    this.statusLabel.classList.remove('hidden');
  }

  updateProgress(percent, current, total, estimatedRemainingMs = null) {
    // Ensure percent is within 0-100
    const clampedPercent = Math.max(0, Math.min(100, percent));

    // Update progress bar width
    this.progressBar.style.width = `${clampedPercent}%`;

    // Format remaining time
    let percentText = `${clampedPercent}%`;
    if (estimatedRemainingMs !== null && estimatedRemainingMs > 0) {
      const remainingSecs = Math.ceil(estimatedRemainingMs / 1000);
      const mins = Math.floor(remainingSecs / 60);
      const secs = remainingSecs % 60;
      if (mins > 0) {
        percentText += ` (${mins}m ${secs}s)`;
      } else {
        percentText += ` (${secs}s)`;
      }
    }

    // Update percentage text
    this.progressPercent.textContent = percentText;

    console.log(`[Progress] ${clampedPercent}% (${current}/${total})${estimatedRemainingMs ? ` ETA: ${estimatedRemainingMs}ms` : ''}`);
  }

  showWarning(text) {
    // Create warning element if it doesn't exist
    let warningContainer = document.getElementById('warningContainer');
    if (!warningContainer) {
      warningContainer = document.createElement('div');
      warningContainer.id = 'warningContainer';
      warningContainer.style.cssText = 'margin: 10px 0; padding: 8px 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404; font-size: 12px;';
      const statusLabel = document.getElementById('statusLabel');
      statusLabel.parentNode.insertBefore(warningContainer, statusLabel.nextSibling);
    }
    warningContainer.textContent = text;
    warningContainer.style.display = 'block';
    console.log('[Progress] Warning:', text);
  }

  showProcessing() {
    // Set progress to 100%
    this.progressBar.style.width = '100%';
    this.progressPercent.textContent = '100%';

    // Hide cancel button
    this.cancelBtn.classList.add('hidden');

    // Show processing label
    this.processingLabel.classList.remove('hidden');

    console.log('[Progress] Processing...');
  }

  handleComplete() {
    console.log('[Progress] Complete, closing window...');

    // Hide cancel button
    this.cancelBtn.classList.add('hidden');

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

    // Hide cancel button
    this.cancelBtn.classList.add('hidden');

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
  document.getElementById('warningText').textContent = t('warning_no_switch');
  document.getElementById('cancelBtn').textContent = t('cancel');
  new ProgressController();
  console.log('[Progress] Progress window initialized');

  // Send ready signal to service worker
  chrome.runtime.sendMessage({ type: 'progressReady' }).then(() => {
    console.log('[Progress] Ready signal sent to service worker');
  }).catch((error) => {
    console.error('[Progress] Failed to send ready signal:', error);
  });
});
