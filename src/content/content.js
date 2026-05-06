window.__sitePrinterContentScriptLoaded = true;
console.log('[Content] SitePrinter content script loaded');

const SITE_CONFIGS = {
  gmail: {
    hideSelectors: ['[id=":ro"]', '[id=":5"]', 'td.Bu.y3'],
  },
};

/**
 * CaptureController - Manages page state during screenshot capture
 */
class CaptureController {
  constructor() {
    this.originalStyles = {
      fixedElements: [],
      stickyElements: [],
      absoluteFixed: [],
      backgroundFixed: [],
      animations: [],
      scrollbars: [],
      hoverDisable: [],
    };
    this.originalScrollPosition = { x: 0, y: 0 };
    this.scrollableElement = null;
    this.processedElements = new Set();
    this._stickyObserver = null;
  }

  getSiteType() {
    const url = window.location.href;
    if (/mail\.google\.com/i.test(url)) return 'gmail';
    if (/\.(facebook|fb)\.com/i.test(url)) return 'facebook';
    return 'default';
  }

  /**
   * Find scrollable element for SPA sites like ChatGPT, Facebook, etc.
   */
  findScrollableElement() {
    const url = window.location.href;

    // ChatGPT / Gemini detection
    if (/chatgpt\.com/i.test(url) || /gemini\.google\.com/i.test(url)) {
      const walker = document.createTreeWalker(
        document.documentElement,
        NodeFilter.SHOW_ELEMENT
      );

      let candidates = [];
      let node;

      while ((node = walker.nextNode())) {
        if (node.clientWidth > 0 && node.clientHeight > 0 &&
            node.scrollWidth > 0 && node.scrollHeight > 0 &&
            (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)) {

          const style = window.getComputedStyle(node);
          const isScrollable = ['scroll', 'auto', 'overlay'].includes(style.overflow) ||
                             ['scroll', 'auto', 'overlay'].includes(style.overflowY) ||
                             ['scroll', 'auto', 'overlay'].includes(style.overflowX);

          if (isScrollable && node.clientWidth <= window.innerWidth + 20 &&
              node.clientHeight <= window.innerHeight + 20 &&
              (node.scrollWidth > document.documentElement.scrollWidth * 0.7 ||
               node.scrollHeight > document.documentElement.scrollHeight * 0.5)) {
            const scrollArea = node.scrollWidth * node.scrollHeight;
            candidates.push({ node, scrollArea });
          }
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.scrollArea - a.scrollArea);
        console.log('[Content] Found scrollable element:', candidates[0].node);
        return candidates[0].node;
      }
    }

    if (/\.(facebook|fb)\.com/i.test(url)) {
      const walker = document.createTreeWalker(
        document.documentElement,
        NodeFilter.SHOW_ELEMENT
      );

      let node;
      while ((node = walker.nextNode())) {
        if (node.clientWidth > 0 && node.clientHeight > 0 &&
            node.scrollWidth > 0 && node.scrollHeight > 0 &&
            node.scrollHeight > node.clientHeight) {

          const style = window.getComputedStyle(node);
          const isScrollable = ['scroll', 'auto', 'overlay'].includes(style.overflow) ||
                             ['scroll', 'auto', 'overlay'].includes(style.overflowY);

          if (isScrollable && node.clientWidth > window.innerWidth * 0.5 &&
              node.clientHeight > window.innerHeight * 0.7) {
            console.log('[Content] Found scrollable element:', node);
            return node;
          }
        }
      }
    }

    return null;
  }

  init() {
    try {
      this.scrollableElement = this.findScrollableElement();

      this.originalScrollPosition = {
        x: window.scrollX,
        y: window.scrollY,
      };

      if (this.scrollableElement) {
        this.originalScrollPosition.elementX = this.scrollableElement.scrollLeft;
        this.originalScrollPosition.elementY = this.scrollableElement.scrollTop;
        console.log('[Content] Using scrollable element for capture');
      }

      this.disableAnimations();
      this.disableScrollBehavior();
      this.disableHoverEffects();
      this.fixBackgroundAttachment();
      this.hideScrollbars();

      // キャプチャ前にすべての sticky 要素を relative に変換し、
      // スクロールによってクラス付与で sticky になる要素も MutationObserver で捕捉する
      this._convertAllStickyToRelative();
      this._startStickyObserver();

      console.log('[Content] Page initialized for capture');

      const scrollElement = this.scrollableElement || document.documentElement;
      return {
        success: true,
        scrollHeight: scrollElement.scrollHeight,
        scrollWidth: scrollElement.scrollWidth,
        clientHeight: scrollElement.clientHeight || document.documentElement.clientHeight,
        clientWidth: scrollElement.clientWidth || document.documentElement.clientWidth,
      };
    } catch (error) {
      console.error('[Content] Init error:', error);
      return { success: false, error: error.message };
    }
  }

  disableAnimations() {
    const style = document.createElement('style');
    style.id = 'siteprinter-animation-disable';
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `;
    document.head.appendChild(style);
    this.originalStyles.animations.push(style);
  }

  disableScrollBehavior() {
    const style = document.createElement('style');
    style.id = 'siteprinter-scroll-behavior-disable';
    style.textContent = `*, *::before, *::after { scroll-behavior: auto !important; }`;
    document.head.appendChild(style);
    this.originalStyles.animations.push(style);
  }

  fixBackgroundAttachment() {
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_ELEMENT
    );

    let node;
    while ((node = walker.nextNode())) {
      const style = window.getComputedStyle(node);
      if (style.backgroundAttachment === 'fixed') {
        const origValue = node.style.backgroundAttachment || '';
        node.setAttribute('data-siteprinter-orig-bg-attachment', origValue);
        node.style.setProperty('background-attachment', 'scroll', 'important');
        this.originalStyles.backgroundFixed.push({ node, origValue });
      }
    }

    console.log(`[Content] Fixed ${this.originalStyles.backgroundFixed.length} background-attachment elements`);
  }

  hideScrollbars() {
    const style = document.createElement('style');
    style.id = 'siteprinter-scrollbar-hide';
    style.textContent = `
      * {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `;
    document.head.appendChild(style);
    this.originalStyles.scrollbars.push(style);
  }

  /**
   * Disable hover effects by setting pointer-events: none on all elements.
   * This prevents :hover CSS rules from activating while the mouse is inside
   * the browser window during automated scrolling and capture.
   */
  disableHoverEffects() {
    const style = document.createElement('style');
    style.id = 'siteprinter-hover-disable';
    style.textContent = `
      * {
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
    this.originalStyles.hoverDisable.push(style);
  }

  // ─── Sticky pre-conversion (init phase) ─────────────────────────────────────

  /**
   * ドキュメント全体を走査して現時点のすべての sticky 要素を relative に変換する。
   * init() から呼ばれ、最初のキャプチャ前に適用される。
   */
  _convertAllStickyToRelative() {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (this.processedElements.has(node)) continue;
      if (node === document.documentElement || node === document.body) continue;
      if (window.getComputedStyle(node).getPropertyValue('position') === 'sticky') {
        this._convertStickyToRelative(node);
      }
    }
    console.log(`[Content] Converted ${this.originalStyles.stickyElements.length} sticky→relative`);
  }

  /**
   * 単一要素が sticky なら relative に変換するヘルパー。
   * MutationObserver コールバックから呼ばれる。
   */
  _checkAndConvertSticky(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    if (this.processedElements.has(el)) return;
    if (el === document.documentElement || el === document.body) return;
    if (window.getComputedStyle(el).getPropertyValue('position') === 'sticky') {
      this._convertStickyToRelative(el);
    }
  }

  /**
   * class / style 属性の変化を監視し、スクロールによって動的に付与される
   * position:sticky を捕捉して relative に変換する MutationObserver を起動する。
   * 変化した要素だけでなく子要素も確認することで、親へのクラス付与で
   * 子が sticky になるパターン（例: .scrolled .nav { position:sticky }）に対応する。
   */
  _startStickyObserver() {
    this._stickyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const el = mutation.target;
        // 変化した要素自体を確認
        this._checkAndConvertSticky(el);
        // 直接の子要素も確認（親へのクラス付与 → 子が sticky になるケース）
        for (const child of el.children) {
          this._checkAndConvertSticky(child);
        }
      }
    });

    this._stickyObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      subtree: true,
    });
  }

  _stopStickyObserver() {
    if (this._stickyObserver) {
      this._stickyObserver.disconnect();
      this._stickyObserver = null;
    }
  }

  // ─── Element-level helpers ──────────────────────────────────────────────────

  _hideElement(el) {
    if (this.processedElements.has(el)) return;
    this.processedElements.add(el);

    const origOpacity = el.style.opacity || '';
    const origVisibility = el.style.visibility || '';
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    this.originalStyles.fixedElements.push({ node: el, origOpacity, origVisibility });
  }

  /**
   * position: fixed → absolute に変換し、スクロール量を加算した座標にピン留めする。
   * これにより要素はドキュメント上の元の位置にのみ表示され、各セクションに重複しない。
   */
  _convertFixedToAbsolute(el) {
    if (this.processedElements.has(el)) return;
    this.processedElements.add(el);

    const rect = el.getBoundingClientRect();
    const scrollEl = this.scrollableElement;
    const scrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
    const scrollX = scrollEl ? scrollEl.scrollLeft : window.scrollX;

    const origPosition = el.style.position || '';
    const origTop = el.style.top || '';
    const origLeft = el.style.left || '';

    el.style.setProperty('position', 'absolute', 'important');
    el.style.setProperty('top', `${rect.top + scrollY}px`, 'important');
    el.style.setProperty('left', `${rect.left + scrollX}px`, 'important');

    this.originalStyles.absoluteFixed.push({ node: el, origPosition, origTop, origLeft });
    console.log('[Content] Fixed→absolute:', el.tagName, String(el.className).slice(0, 40));
  }

  _convertStickyToRelative(el) {
    if (this.processedElements.has(el)) return;
    this.processedElements.add(el);

    const origPosition = el.style.position || '';
    el.style.setProperty('position', 'relative', 'important');
    this.originalStyles.stickyElements.push({ node: el, origPosition });
  }

  // ─── Gmail-specific ─────────────────────────────────────────────────────────

  _applyGmailFixes() {
    for (const selector of SITE_CONFIGS.gmail.hideSelectors) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          if (this.processedElements.has(el)) return;
          this.processedElements.add(el);

          const origDisplay = el.style.display || '';
          el.style.setProperty('display', 'none', 'important');
          this.originalStyles.fixedElements.push({ node: el, origDisplay, isGmail: true });
        });
      } catch (_e) {
        // Invalid selector — skip silently
      }
    }
    console.log('[Content] Applied Gmail-specific fixes');
  }

  // ─── Dynamic detection ───────────────────────────────────────────────────────

  /**
   * Detect fixed elements by comparing viewport positions before and after a
   * small test scroll (elements whose top coordinate does not change are fixed).
   */
  async _detectFixedByPosition(siteType) {
    const scrollEl = this.scrollableElement;
    const currentY = scrollEl ? scrollEl.scrollTop : window.scrollY;
    const maxY = scrollEl
      ? scrollEl.scrollHeight - scrollEl.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight;
    const testAmount = Math.min(150, Math.max(0, maxY - currentY));

    if (testAmount < 20) return;

    const prePositions = new Map();
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (this.processedElements.has(node)) continue;
      if (node === document.documentElement || node === document.body) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width > 5 && rect.height > 5 &&
          rect.top < window.innerHeight && rect.bottom > 0) {
        prePositions.set(node, rect.top);
      }
    }

    if (scrollEl) {
      scrollEl.scrollTop += testAmount;
    } else {
      window.scrollBy(0, testAmount);
    }
    await new Promise((r) => setTimeout(r, 80));

    const detectedFixed = [];
    for (const [el, preTop] of prePositions) {
      if (Math.abs(el.getBoundingClientRect().top - preTop) < 5) {
        detectedFixed.push(el);
      }
    }

    // Restore scroll position before applying changes
    // (positions for fixed→absolute must be computed at the original scroll offset)
    if (scrollEl) {
      scrollEl.scrollTop -= testAmount;
    } else {
      window.scrollBy(0, -testAmount);
    }
    await new Promise((r) => setTimeout(r, 80));

    for (const el of detectedFixed) {
      if (siteType === 'facebook') {
        this._convertFixedToAbsolute(el);
      } else {
        this._hideElement(el);
      }
    }
  }

  _detectFixedByComputedStyle(siteType) {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (this.processedElements.has(node)) continue;
      const position = window.getComputedStyle(node).getPropertyValue('position');

      if (position === 'fixed') {
        if (siteType === 'facebook') {
          this._convertFixedToAbsolute(node);
        } else {
          this._hideElement(node);
        }
      } else if (position === 'sticky') {
        this._convertStickyToRelative(node);
      }
    }
  }

  // ─── Public hide method ──────────────────────────────────────────────────────

  /**
   * Detect and hide/reposition fixed and sticky elements.
   * Uses dynamic position tracking (test scroll) + computed-style fallback.
   */
  async hideFixedElements() {
    const siteType = this.getSiteType();

    if (siteType === 'gmail') {
      this._applyGmailFixes();
    }

    await this._detectFixedByPosition(siteType);
    this._detectFixedByComputedStyle(siteType);

    console.log(
      `[Content] Fixed: ${this.originalStyles.fixedElements.length}, ` +
      `Sticky→relative: ${this.originalStyles.stickyElements.length}, ` +
      `Fixed→absolute: ${this.originalStyles.absoluteFixed.length}`
    );
  }

  // ─── Scroll ──────────────────────────────────────────────────────────────────

  scrollTo(x, y) {
    try {
      const scrollElement = this.scrollableElement;

      if (scrollElement) {
        scrollElement.scrollTo(x, y);

        return new Promise((resolve) => {
          const checkScroll = () => {
            if (Math.abs(scrollElement.scrollTop - y) < 1 && Math.abs(scrollElement.scrollLeft - x) < 1) {
              resolve({ success: true, x: scrollElement.scrollLeft, y: scrollElement.scrollTop });
            } else {
              requestAnimationFrame(checkScroll);
            }
          };

          setTimeout(checkScroll, 50);

          setTimeout(() => {
            resolve({ success: true, x: scrollElement.scrollLeft, y: scrollElement.scrollTop });
          }, 500);
        });
      } else {
        window.scrollTo(x, y);

        return new Promise((resolve) => {
          const checkScroll = () => {
            if (Math.abs(window.scrollY - y) < 1 && Math.abs(window.scrollX - x) < 1) {
              resolve({ success: true, x: window.scrollX, y: window.scrollY });
            } else {
              requestAnimationFrame(checkScroll);
            }
          };

          setTimeout(checkScroll, 50);

          setTimeout(() => {
            resolve({ success: true, x: window.scrollX, y: window.scrollY });
          }, 500);
        });
      }
    } catch (error) {
      console.error('[Content] Scroll error:', error);
      return Promise.resolve({ success: false, error: error.message });
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  /**
   * Restore all modified styles and scroll position
   */
  cleanup() {
    try {
      this.originalStyles.fixedElements.forEach(({ node, origOpacity, origVisibility, origDisplay, isGmail }) => {
        if (isGmail) {
          if (origDisplay) {
            node.style.display = origDisplay;
          } else {
            node.style.removeProperty('display');
          }
        } else {
          if (origOpacity) {
            node.style.opacity = origOpacity;
          } else {
            node.style.removeProperty('opacity');
          }
          if (origVisibility) {
            node.style.visibility = origVisibility;
          } else {
            node.style.removeProperty('visibility');
          }
        }
      });

      this.originalStyles.stickyElements.forEach(({ node, origPosition }) => {
        if (origPosition) {
          node.style.position = origPosition;
        } else {
          node.style.removeProperty('position');
        }
      });

      this.originalStyles.absoluteFixed.forEach(({ node, origPosition, origTop, origLeft }) => {
        if (origPosition) {
          node.style.position = origPosition;
        } else {
          node.style.removeProperty('position');
        }
        if (origTop) {
          node.style.top = origTop;
        } else {
          node.style.removeProperty('top');
        }
        if (origLeft) {
          node.style.left = origLeft;
        } else {
          node.style.removeProperty('left');
        }
      });

      this.originalStyles.backgroundFixed.forEach(({ node, origValue }) => {
        node.removeAttribute('data-siteprinter-orig-bg-attachment');
        if (origValue) {
          node.style.backgroundAttachment = origValue;
        } else {
          node.style.removeProperty('background-attachment');
        }
      });

      this._stopStickyObserver();

      this.originalStyles.animations.forEach((style) => style.remove());
      this.originalStyles.scrollbars.forEach((style) => style.remove());
      this.originalStyles.hoverDisable.forEach((style) => style.remove());

      if (this.scrollableElement) {
        this.scrollableElement.scrollTo(
          this.originalScrollPosition.elementX || 0,
          this.originalScrollPosition.elementY || 0
        );
      }
      window.scrollTo(this.originalScrollPosition.x, this.originalScrollPosition.y);

      this.processedElements.clear();
      this.originalStyles = {
        fixedElements: [],
        stickyElements: [],
        absoluteFixed: [],
        backgroundFixed: [],
        animations: [],
        scrollbars: [],
        hoverDisable: [],
      };

      console.log('[Content] Cleanup completed');
      return { success: true };
    } catch (error) {
      console.error('[Content] Cleanup error:', error);
      return { success: false, error: error.message };
    }
  }
}

let captureController = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'capture') {
    return;
  }

  console.log('[Content] Capture port connected');

  port.onMessage.addListener((message) => {
    console.log('[Content] Received message:', message);

    switch (message.type) {
      case 'init':
        captureController = new CaptureController();
        const initResult = captureController.init();
        port.postMessage({ type: 'initComplete', ...initResult });
        break;

      case 'hideFixed':
        if (captureController) {
          captureController.hideFixedElements()
            .then(() => {
              port.postMessage({ type: 'hideFixedComplete', success: true });
            })
            .catch((err) => {
              console.error('[Content] hideFixed error:', err);
              port.postMessage({ type: 'hideFixedComplete', success: false, error: err.message });
            });
        } else {
          port.postMessage({ type: 'hideFixedComplete', success: false, error: 'Not initialized' });
        }
        break;

      case 'scrollTo':
        if (captureController) {
          captureController.scrollTo(message.x, message.y).then((result) => {
            port.postMessage({ type: 'scrollComplete', ...result });
          });
        } else {
          port.postMessage({ type: 'scrollComplete', success: false, error: 'Not initialized' });
        }
        break;

      case 'cleanup':
        if (captureController) {
          const cleanupResult = captureController.cleanup();
          port.postMessage({ type: 'cleanupComplete', ...cleanupResult });
          captureController = null;
        } else {
          port.postMessage({ type: 'cleanupComplete', success: true });
        }
        break;

      default:
        console.warn('[Content] Unknown message type:', message.type);
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[Content] Capture port disconnected');
    if (captureController) {
      captureController.cleanup();
      captureController = null;
    }
  });
});

// Legacy message listener for backward compatibility
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
