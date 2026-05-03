// Content Script for SitePrinter Chrome Extension
// This script runs in the context of web pages

// Mark that content script is loaded
window.__sitePrinterContentScriptLoaded = true;
console.log('[Content] SitePrinter content script loaded');

/**
 * CaptureController - Manages page state during screenshot capture
 */
class CaptureController {
  constructor() {
    this.originalStyles = {
      fixedElements: [],
      stickyElements: [],
      backgroundFixed: [],
      animations: [],
      scrollbars: [],
      hoverDisable: [],
    };
    this.originalScrollPosition = { x: 0, y: 0 };
    this.scrollableElement = null;
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
            // Calculate scroll area
            const scrollArea = node.scrollWidth * node.scrollHeight;
            candidates.push({ node, scrollArea });
          }
        }
      }

      // Select the element with the largest scroll area (main content)
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.scrollArea - a.scrollArea);
        console.log('[Content] Found scrollable element:', candidates[0].node);
        return candidates[0].node;
      }
    }

    // Facebook detection
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

  /**
   * Initialize page for capture - disable animations, hide fixed elements, etc.
   */
  init() {
    try {
      // Find scrollable element for SPA sites
      this.scrollableElement = this.findScrollableElement();

      // Save original scroll position
      this.originalScrollPosition = {
        x: window.scrollX,
        y: window.scrollY,
      };

      // If scrollable element found, save its scroll position too
      if (this.scrollableElement) {
        this.originalScrollPosition.elementX = this.scrollableElement.scrollLeft;
        this.originalScrollPosition.elementY = this.scrollableElement.scrollTop;
        console.log('[Content] Using scrollable element for capture');
      }

      // Disable animations
      this.disableAnimations();

      // Disable smooth scroll to prevent scroll-behavior: smooth from causing
      // the viewport to lag behind during sequential scroll-and-capture
      this.disableScrollBehavior();

      // Disable hover effects so mouse-over styling doesn't appear in screenshots
      this.disableHoverEffects();

      // Note: fixed/sticky elements are intentionally NOT hidden here.
      // They stay visible for the first capture (page top) so the header appears.
      // The service worker sends 'hideFixed' after the first capture to hide them
      // for subsequent sections, preventing duplication on scroll.

      // Handle background-attachment: fixed
      this.fixBackgroundAttachment();

      // Hide scrollbars
      this.hideScrollbars();

      console.log('[Content] Page initialized for capture');

      // Return dimensions based on scrollable element or document
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

  /**
   * Disable all animations and transitions
   */
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

  /**
   * Hide fixed and sticky positioned elements
   */
  hideFixedElements() {
    const OFFSCREEN_VALUE = '-3e+07px';
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_ELEMENT
    );

    let node;
    while ((node = walker.nextNode())) {
      const style = window.getComputedStyle(node);
      const position = style.getPropertyValue('position');

      if (position === 'fixed') {
        // Hide fixed elements with opacity
        const origOpacity = node.style.opacity || '';
        const origVisibility = node.style.visibility || '';

        node.setAttribute('data-siteprinter-orig-opacity', origOpacity);
        node.setAttribute('data-siteprinter-orig-visibility', origVisibility);
        node.style.setProperty('opacity', '0', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');

        this.originalStyles.fixedElements.push({ node, origOpacity, origVisibility });
      }

      if (position === 'sticky') {
        // Move sticky elements far offscreen
        const origStyles = {};
        ['top', 'bottom', 'left', 'right'].forEach((prop) => {
          const value = style.getPropertyValue(prop);
          if (value && value !== 'auto' && value !== OFFSCREEN_VALUE) {
            origStyles[prop] = node.style[prop] || '';
            node.setAttribute(`data-siteprinter-orig-${prop}`, origStyles[prop]);
            node.style.setProperty(prop, OFFSCREEN_VALUE, 'important');
          }
        });

        if (Object.keys(origStyles).length > 0) {
          this.originalStyles.stickyElements.push({ node, origStyles });
        }
      }
    }

    console.log(`[Content] Hidden ${this.originalStyles.fixedElements.length} fixed elements, ${this.originalStyles.stickyElements.length} sticky elements`);
  }

  /**
   * Convert background-attachment: fixed to scroll
   */
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

  /**
   * Hide scrollbars on all elements
   */
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

  /**
   * Scroll to specified position
   */
  scrollTo(x, y) {
    try {
      const scrollElement = this.scrollableElement;

      if (scrollElement) {
        // Scroll the scrollable element
        scrollElement.scrollTo(x, y);

        // Wait for scroll to complete
        return new Promise((resolve) => {
          // Check if scroll position matches target
          const checkScroll = () => {
            if (Math.abs(scrollElement.scrollTop - y) < 1 && Math.abs(scrollElement.scrollLeft - x) < 1) {
              resolve({ success: true, x: scrollElement.scrollLeft, y: scrollElement.scrollTop });
            } else {
              requestAnimationFrame(checkScroll);
            }
          };

          // Start checking after a short delay
          setTimeout(checkScroll, 50);

          // Timeout after 500ms
          setTimeout(() => {
            resolve({ success: true, x: scrollElement.scrollLeft, y: scrollElement.scrollTop });
          }, 500);
        });
      } else {
        // Default to window scroll
        window.scrollTo(x, y);

        // Wait for scroll to complete
        return new Promise((resolve) => {
          // Check if scroll position matches target
          const checkScroll = () => {
            if (Math.abs(window.scrollY - y) < 1 && Math.abs(window.scrollX - x) < 1) {
              resolve({ success: true, x: window.scrollX, y: window.scrollY });
            } else {
              requestAnimationFrame(checkScroll);
            }
          };

          // Start checking after a short delay
          setTimeout(checkScroll, 50);

          // Timeout after 500ms
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

  /**
   * Restore all modified styles and scroll position
   */
  cleanup() {
    try {
      // Restore fixed elements
      this.originalStyles.fixedElements.forEach(({ node, origOpacity, origVisibility }) => {
        node.removeAttribute('data-siteprinter-orig-opacity');
        node.removeAttribute('data-siteprinter-orig-visibility');
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
      });

      // Restore sticky elements
      this.originalStyles.stickyElements.forEach(({ node, origStyles }) => {
        Object.keys(origStyles).forEach((prop) => {
          node.removeAttribute(`data-siteprinter-orig-${prop}`);
          if (origStyles[prop]) {
            node.style[prop] = origStyles[prop];
          } else {
            node.style.removeProperty(prop);
          }
        });
      });

      // Restore background-attachment
      this.originalStyles.backgroundFixed.forEach(({ node, origValue }) => {
        node.removeAttribute('data-siteprinter-orig-bg-attachment');
        if (origValue) {
          node.style.backgroundAttachment = origValue;
        } else {
          node.style.removeProperty('background-attachment');
        }
      });

      // Remove animation disable styles
      this.originalStyles.animations.forEach((style) => {
        style.remove();
      });

      // Remove scrollbar hide styles
      this.originalStyles.scrollbars.forEach((style) => {
        style.remove();
      });

      // Remove hover disable styles
      this.originalStyles.hoverDisable.forEach((style) => {
        style.remove();
      });

      // Restore scroll position
      if (this.scrollableElement) {
        this.scrollableElement.scrollTo(
          this.originalScrollPosition.elementX || 0,
          this.originalScrollPosition.elementY || 0
        );
      }
      window.scrollTo(this.originalScrollPosition.x, this.originalScrollPosition.y);

      // Clear stored styles
      this.originalStyles = {
        fixedElements: [],
        stickyElements: [],
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

// Port-based messaging for capture operations
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
          captureController.hideFixedElements();
          port.postMessage({ type: 'hideFixedComplete', success: true });
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
