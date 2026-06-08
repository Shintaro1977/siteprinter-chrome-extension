import { jsPDF } from 'jspdf';
import { t, applyI18n, isJa } from '../lib/i18n.js';

applyI18n();

let japaneseFontBase64 = null;

async function loadJapaneseFont() {
  if (japaneseFontBase64) return japaneseFontBase64;

  try {
    const fontUrl = chrome.runtime.getURL('assets/fonts/NotoSansJP-Regular.ttf');
    const response = await fetch(fontUrl);
    const arrayBuffer = await response.arrayBuffer();

    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    japaneseFontBase64 = btoa(binary);
    return japaneseFontBase64;
  } catch (error) {
    console.error('Failed to load Japanese font:', error);
    return null;
  }
}

function registerJapaneseFont(pdf, fontBase64) {
  if (!fontBase64) return false;

  try {
    pdf.addFileToVFS('NotoSansJP-Regular.ttf', fontBase64);
    pdf.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
    pdf.setFont('NotoSansJP');
    return true;
  } catch (error) {
    console.error('Failed to register Japanese font:', error);
    return false;
  }
}

const previewContainer = document.getElementById('previewContainer');
const pageInfo = document.getElementById('pageInfo');
const downloadBtn = document.getElementById('downloadBtn');
const screenshotList = document.getElementById('screenshotList');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingPercent = document.getElementById('loadingPercent');
const showHeaderCheckbox = document.getElementById('showHeader');
const showFooterCheckbox = document.getElementById('showFooter');
const showBorderCheckbox = document.getElementById('showBorder');
const upgradeModal = document.getElementById('upgradeModal');
const upgradeModalBtn = document.getElementById('upgradeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');

let screenshots = [];
let capturedAt = '';
let capturedWithReload = false;
let userPlan = 'free'; // 'free' | 'pro'
let settings = {
  paperSize: isJa ? 'a4' : 'letter',
  columns: 1,
  overlap: 'medium',
  showHeader: false,
  showFooter: false,
  showBorder: true,
  imageFormat: 'jpeg', // 'png' | 'jpeg'
};

const PAPER_SIZES = {
  a4:     { width: 210,   height: 297   }, // A4:     210mm × 297mm
  a3:     { width: 297,   height: 420   }, // A3:     297mm × 420mm
  letter: { width: 215.9, height: 279.4 }, // Letter: 215.9mm × 279.4mm
  legal:  { width: 215.9, height: 355.6 }, // Legal:  215.9mm × 355.6mm
};

const PAPER_DIMS_LABEL = {
  ja: { a4: '210 × 297 mm', a3: '297 × 420 mm', letter: '216 × 279 mm', legal: '216 × 356 mm' },
  en: { a4: '8.27 × 11.69 in', a3: '11.69 × 16.54 in', letter: '8.5 × 11 in', legal: '8.5 × 14 in' },
};
const MM_TO_PX = 2.83; // Approximate conversion for preview
const PAGE_MARGIN = 7; // Page margin in mm
const HEADER_HEIGHT = 10; // Header height in mm
const FOOTER_HEIGHT = 8; // Footer height in mm
const CONTENT_SPACING = 2.25; // Spacing between header/footer and content in mm
const OVERLAP_SIZES = {
  small: 0.02,   // 2% overlap - 小
  medium: 0.05,  // 5% overlap - 中
  large: 0.08,   // 8% overlap - 大
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadJapaneseFont();

  const data = await chrome.storage.local.get(['screenshots', 'capturedAt', 'capturedWithReload', 'userPlan', 'imageFormat', 'saveLastSettings', 'savedPreviewSettings']);
  screenshots = data.screenshots || [];
  capturedAt = data.capturedAt || new Date().toISOString();
  capturedWithReload = data.capturedWithReload || false;
  userPlan = data.userPlan || 'free';
  settings.imageFormat = data.imageFormat || 'jpeg';

  if (userPlan === 'pro') {
    settings.columns = 2;
    settings.showHeader = true;
    settings.showFooter = true;
  }

  // Restore last saved settings if enabled
  const saveLastSettings = data.saveLastSettings !== false; // default ON
  if (saveLastSettings && data.savedPreviewSettings) {
    const saved = data.savedPreviewSettings;
    if (saved.paperSize) settings.paperSize = saved.paperSize;
    if (saved.columns != null) settings.columns = saved.columns;
    if (saved.overlap) settings.overlap = saved.overlap;
    if (saved.showHeader != null) settings.showHeader = saved.showHeader;
    if (saved.showFooter != null) settings.showFooter = saved.showFooter;
    if (saved.showBorder != null) settings.showBorder = saved.showBorder;
  }

  if (screenshots.length === 0) {
    previewContainer.innerHTML = `
      <div class="preview-loading">
        <p>${t('no_screenshots')}</p>
      </div>
    `;
    return;
  }

  renderScreenshotList();
  setupEventListeners();
  initializeUIControls();
  updateCaptureFormat();
  renderPreview();
}

function updateCaptureFormat() {
  const formatEl = document.getElementById('captureFormatInfo');
  if (!formatEl) return;
  const valid = screenshots.filter((s) => s.dataUrl);
  const isJpeg = valid.length > 0
    ? valid[0].dataUrl.startsWith('data:image/jpeg')
    : settings.imageFormat === 'jpeg';
  formatEl.textContent = isJpeg ? 'JPEG' : 'PNG';
}

function updatePaperSizeDims() {
  const el = document.getElementById('paperSizeDims');
  if (!el) return;
  const lang = isJa ? 'ja' : 'en';
  el.textContent = PAPER_DIMS_LABEL[lang][settings.paperSize] || '';
}

function initializeUIControls() {
  document.querySelectorAll('.paper-size-btn').forEach((btn) => {
    if (btn.dataset.paperSize === settings.paperSize) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.column-btn').forEach((btn) => {
    if (parseInt(btn.dataset.columns, 10) === settings.columns) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.overlap-btn').forEach((btn) => {
    if (btn.dataset.overlap === settings.overlap) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  showHeaderCheckbox.checked = settings.showHeader;
  showFooterCheckbox.checked = settings.showFooter;
  showBorderCheckbox.checked = settings.showBorder;
  updatePaperSizeDims();
}

function setupEventListeners() {
  document.querySelectorAll('.paper-size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.paper-size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.paperSize = btn.dataset.paperSize;
      updatePaperSizeDims();
      renderPreview();
      checkPlanRestrictions();
    });
  });

  document.querySelectorAll('.column-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.column-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.columns = parseInt(btn.dataset.columns, 10);
      renderPreview();
      checkPlanRestrictions();
    });
  });

  document.querySelectorAll('.overlap-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.overlap-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.overlap = btn.dataset.overlap;
      renderPreview();
      checkPlanRestrictions();
    });
  });

  showHeaderCheckbox.addEventListener('change', () => {
    settings.showHeader = showHeaderCheckbox.checked;
    renderPreview();
    checkPlanRestrictions();
  });

  showFooterCheckbox.addEventListener('change', () => {
    settings.showFooter = showFooterCheckbox.checked;
    renderPreview();
    checkPlanRestrictions();
  });

  showBorderCheckbox.addEventListener('change', () => {
    settings.showBorder = showBorderCheckbox.checked;
    renderPreview();
  });

  downloadBtn.addEventListener('click', handleDownloadClick);

  upgradeModalBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
    document.getElementById('upgradeModalFooter').style.display = 'none';
    document.getElementById('afterUpgradeMsg').style.display = 'block';
  });

  document.getElementById('reloadBtn').addEventListener('click', () => {
    window.location.reload();
  });

  cancelModalBtn.addEventListener('click', () => {
    upgradeModal.classList.add('hidden');
  });

  upgradeModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    upgradeModal.classList.add('hidden');
  });

  checkPlanRestrictions();
}

function handleDownloadClick() {
  const isPro = userPlan === 'pro';
  const usingDefaultSettings = isUsingDefaultSettings();

  if (isPro || usingDefaultSettings) {
    chrome.storage.local.get({ saveLastSettings: true }).then(({ saveLastSettings }) => {
      if (saveLastSettings) {
        chrome.storage.local.set({
          savedPreviewSettings: {
            paperSize: settings.paperSize,
            columns: settings.columns,
            overlap: settings.overlap,
            showHeader: settings.showHeader,
            showFooter: settings.showFooter,
            showBorder: settings.showBorder,
          },
        });
      }
    });
    generatePDF();
  } else {
    upgradeModal.classList.remove('hidden');
  }
}

function isUsingDefaultSettings() {
  return (
    (settings.paperSize === 'a4' || settings.paperSize === 'letter') &&
    settings.columns === 1 &&
    settings.showHeader === false &&
    settings.showFooter === false
  );
}

function checkPlanRestrictions() {
  const isPro = userPlan === 'pro';
  const usingDefaultSettings = isUsingDefaultSettings();

  if (isPro || usingDefaultSettings) {
    downloadBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      ${t('download_pdf')}
    `;
    downloadBtn.classList.remove('btn-upgrade');
    downloadBtn.disabled = false;
  } else {
    downloadBtn.innerHTML = `
      <span style="font-size: 16px; margin-right: 4px;">✦</span>
      ${t('upgrade_pro_btn')}
    `;
    downloadBtn.classList.add('btn-upgrade');
    downloadBtn.disabled = false;
  }
}

function renderScreenshotList() {
  screenshotList.innerHTML = screenshots
    .filter((s) => !s.error)
    .map(
      (screenshot) => `
    <div class="screenshot-item">
      <div class="screenshot-thumbnail">
        <img src="${screenshot.dataUrl}" alt="">
      </div>
      <div class="screenshot-info">
        <div class="screenshot-title" title="${escapeHtml(screenshot.title)}">${escapeHtml(screenshot.title)}</div>
        <div class="screenshot-url" title="${escapeHtml(screenshot.url)}">${escapeHtml(new URL(screenshot.url).hostname)}</div>
      </div>
    </div>
  `
    )
    .join('');
}

function calculatePageCount(validScreenshots) {
  // Lightweight page count calculation without DOM construction
  const columns = settings.columns;
  const overlapRatio = OVERLAP_SIZES[settings.overlap];

  const paperSize = PAPER_SIZES[settings.paperSize];
  const paperWidth = paperSize.width;
  const paperHeight = paperSize.height;

  const headerHeight = settings.showHeader ? (HEADER_HEIGHT + CONTENT_SPACING) : 0;
  const footerHeight = settings.showFooter ? (FOOTER_HEIGHT + CONTENT_SPACING) : 0;
  const contentWidth = paperWidth - PAGE_MARGIN * 2;
  const contentHeight = paperHeight - PAGE_MARGIN * 2 - headerHeight - footerHeight;

  const labelSpacing = 2;
  const labelHeight = 3;
  const availableCellHeight = contentHeight - labelSpacing - labelHeight;

  const cellWidthMM = (contentWidth - (columns - 1) * 2) / columns;
  const cellHeightMM = availableCellHeight;
  const cellsPerPage = columns;

  let totalPages = 0;

  for (const screenshot of validScreenshots) {
    if (!screenshot.dataUrl) continue;

    const cellAspect = cellWidthMM / cellHeightMM;
    const cellContentHeightPx = screenshot.width / cellAspect;
    const stepHeightPx = cellContentHeightPx * (1 - overlapRatio);
    const totalSections = Math.max(1, Math.ceil((screenshot.height - cellContentHeightPx * overlapRatio) / stepHeightPx));
    totalPages += Math.ceil(totalSections / cellsPerPage);
  }

  return totalPages;
}

function renderPreview() {
  const validScreenshots = screenshots.filter((s) => !s.error && s.dataUrl);
  if (validScreenshots.length === 0) {
    previewContainer.innerHTML = `
      <div class="preview-loading">
        <p>${t('no_valid_screenshots')}</p>
      </div>
    `;
    return;
  }

  // Calculate page count (lightweight)
  const pageCount = calculatePageCount(validScreenshots);
  pageInfo.textContent = t('page_info_fmt').replace('{n}', pageCount);

  // If page count is too high, skip preview and show message
  const MAX_PREVIEW_PAGES = 20;
  if (pageCount > MAX_PREVIEW_PAGES) {
    previewContainer.innerHTML = `
      <div class="preview-disabled">
        <p>⚠️ ${t('preview_disabled_message')}</p>
      </div>
    `;
    return;
  }

  // Calculate and display normal preview
  const pages = calculateLayout(validScreenshots);

  previewContainer.innerHTML = pages
    .map(
      (page, pageIndex) => `
    <div class="preview-page paper-size-${settings.paperSize}">
      ${settings.showHeader ? renderHeader(page.screenshot) : ''}
      <div class="preview-page-content columns-${settings.columns}">
        ${page.cells.map((cell) => renderCell(cell)).join('')}
      </div>
      ${settings.showFooter ? renderFooter(pageIndex + 1, pages.length) : ''}
    </div>
  `
    )
    .join('');
}

function calculateLayout(validScreenshots) {
  const pages = [];
  const columns = settings.columns;
  const cellGap = 2; // Match PDF cellGap
  const overlapRatio = OVERLAP_SIZES[settings.overlap];

  // Get paper dimensions based on selected size
  const paperSize = PAPER_SIZES[settings.paperSize];
  const paperWidth = paperSize.width;
  const paperHeight = paperSize.height;

  // Calculate content area in mm
  // Header/footer heights include spacing to content
  const headerHeight = settings.showHeader ? (HEADER_HEIGHT + CONTENT_SPACING) : 0;
  const footerHeight = settings.showFooter ? (FOOTER_HEIGHT + CONTENT_SPACING) : 0;
  const contentWidth = paperWidth - PAGE_MARGIN * 2;
  const contentHeight = paperHeight - PAGE_MARGIN * 2 - headerHeight - footerHeight;

  // Reserve space for section label (matching PDF)
  const labelSpacing = 2; // Space above label (mm)
  const labelHeight = 3; // Space for label itself (mm)
  const availableCellHeight = contentHeight - labelSpacing - labelHeight;

  // Cell dimensions - each cell takes full height (1 row per page)
  const cellWidthMM = (contentWidth - (columns - 1) * cellGap) / columns;
  const cellHeightMM = availableCellHeight; // Height minus label space

  // 1 row per page, so cellsPerPage = columns
  const cellsPerPage = columns;

  for (const screenshot of validScreenshots) {
    if (!screenshot.dataUrl) continue;

    // Calculate how screenshot splits into cells
    // Each cell shows a vertical portion of the screenshot
    // Cell aspect ratio determines how much of the screenshot fits in one cell
    const cellAspect = cellWidthMM / cellHeightMM;
    const cellContentHeightPx = screenshot.width / cellAspect;

    // Calculate step size (how much to advance per section, accounting for overlap)
    const stepHeightPx = cellContentHeightPx * (1 - overlapRatio);

    // Total number of sections needed (with overlap)
    const totalSections = Math.max(1, Math.ceil((screenshot.height - cellContentHeightPx * overlapRatio) / stepHeightPx));

    let sectionIndex = 0;

    while (sectionIndex < totalSections) {
      // Start new page
      const page = {
        screenshot,
        cells: [],
      };

      // Fill page with cells (columns cells per page)
      for (let i = 0; i < cellsPerPage && sectionIndex < totalSections; i++) {
        // Calculate Y offset with overlap
        const yOffsetPx = sectionIndex * stepHeightPx;
        const yOffsetPercent = (yOffsetPx / screenshot.height) * 100;

        // Check if this is the last section
        const isLastSection = sectionIndex === totalSections - 1;
        // Calculate actual remaining height for last section
        const remainingPx = screenshot.height - yOffsetPx;
        const actualHeightPercent = isLastSection
          ? Math.min((remainingPx / cellContentHeightPx) * 100, 100)
          : 100;

        // Cell aspect ratio (height/width) for padding-bottom calculation
        const cellAspectRatio = cellHeightMM / cellWidthMM;

        page.cells.push({
          screenshot,
          sectionIndex,
          totalSections,
          yOffsetPercent: Math.min(yOffsetPercent, 100),
          isLastSection,
          actualHeightPercent: Math.min(actualHeightPercent, 100),
          cellAspectRatio,
        });
        sectionIndex++;
      }

      pages.push(page);
    }

  }

  return pages;
}

function renderHeader(screenshot) {
  const faviconHtml = screenshot.favIconUrl
    ? `<img class="header-favicon" src="${escapeHtml(screenshot.favIconUrl)}" alt="" onerror="this.style.display='none'">`
    : '';

  return `
    <div class="preview-page-header">
      <div class="preview-page-title-row">
        ${faviconHtml}
        <div class="preview-page-title">${escapeHtml(screenshot.title)}</div>
      </div>
      <div class="preview-page-url">${escapeHtml(screenshot.url)}</div>
    </div>
  `;
}

function renderFooter(pageNum, totalPages) {
  const date = new Date(capturedAt);
  const dateStr = date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const reloadLabel = capturedWithReload ? t('reload_label') : '';

  return `
    <div class="preview-page-footer">
      <span>${t('captured_at')}${dateStr}${reloadLabel}</span>
      <span>${pageNum} / ${totalPages}</span>
      <div class="footer-right">
        <div>${t('display_may_differ')}</div>
        <div>Generated by SitePrinter extension</div>
      </div>
    </div>
  `;
}

function renderCell(cell) {
  const translateY = cell.yOffsetPercent;
  const sectionLabel = `[${cell.sectionIndex + 1}/${cell.totalSections}]`;
  const borderStyle = settings.showBorder ? 'border: 1px solid #e2e8f0;' : 'border: none;';

  // For the last section, use padding-bottom trick for exact sizing
  if (cell.isLastSection && cell.actualHeightPercent < 100) {
    const paddingBottom = cell.cellAspectRatio * cell.actualHeightPercent;

    return `
      <div class="preview-image-cell preview-image-cell--last">
        <div style="position: relative; width: 100%; padding-bottom: ${paddingBottom}%; overflow: hidden; background: #ffffff; ${borderStyle}">
          <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden;">
            <img src="${cell.screenshot.dataUrl}" alt=""
                 style="width: 100%; transform: translateY(-${translateY}%); transform-origin: top left;">
          </div>
        </div>
        <div class="cell-section-label">${sectionLabel}</div>
      </div>
    `;
  }

  return `
    <div class="preview-image-cell">
      <div class="preview-image-wrapper" style="${borderStyle}">
        <img src="${cell.screenshot.dataUrl}" alt=""
             style="width: 100%; transform: translateY(-${translateY}%); transform-origin: top left;">
      </div>
      <div class="cell-section-label">${sectionLabel}</div>
    </div>
  `;
}

async function generatePDF() {
  const validScreenshots = screenshots.filter((s) => !s.error && s.dataUrl);
  if (validScreenshots.length === 0) {
    alert(t('no_pdf_screenshots'));
    return;
  }

  showLoading(t('generating_pdf'));

  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    const fontBase64 = await loadJapaneseFont();

    const paperSize = PAPER_SIZES[settings.paperSize];
    const paperWidth = paperSize.width;
    const paperHeight = paperSize.height;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: settings.paperSize,
    });

    pdf.setProperties({
      title: validScreenshots[0]?.title || 'SitePrinter',
      author: 'SitePrinter extension',
      creator: 'SitePrinter extension',
    });

    const hasJapaneseFont = registerJapaneseFont(pdf, fontBase64);

    const columns = settings.columns;
    const cellGap = 2;
    // Header/footer heights include spacing to content
    const headerHeight = settings.showHeader ? (HEADER_HEIGHT + CONTENT_SPACING) : 0;
    const footerHeight = settings.showFooter ? (FOOTER_HEIGHT + CONTENT_SPACING) : 0;
    const overlapRatio = OVERLAP_SIZES[settings.overlap];

    const contentWidth = paperWidth - PAGE_MARGIN * 2;
    const contentHeight = paperHeight - PAGE_MARGIN * 2 - headerHeight - footerHeight;
    const cellWidth = (contentWidth - (columns - 1) * cellGap) / columns;
    const cellHeight = contentHeight; // Full height - 1 row per page

    // 1 row per page
    const cellsPerPage = columns;

    let totalPages = 0;
    for (const screenshot of validScreenshots) {
      const imgWidth = screenshot.width || 1920;
      const imgHeight = screenshot.height || 1080;
      const cellAspect = cellWidth / cellHeight;
      const cellContentHeightPx = imgWidth / cellAspect;
      const stepHeightPx = cellContentHeightPx * (1 - overlapRatio);
      const totalSections = Math.max(1, Math.ceil((imgHeight - cellContentHeightPx * overlapRatio) / stepHeightPx));
      totalPages += Math.ceil(totalSections / cellsPerPage);
    }

    updateLoadingProgress(0, totalPages);

    const faviconCache = new Map();
    for (const screenshot of validScreenshots) {
      if (screenshot.favIconUrl && !faviconCache.has(screenshot.favIconUrl)) {
        const dataUrl = await loadFaviconDataUrl(screenshot.favIconUrl);
        faviconCache.set(screenshot.favIconUrl, dataUrl);
      }
    }

    let totalPageNum = 0;
    let isFirstPage = true;

    for (const screenshot of validScreenshots) {
      const img = await loadImage(screenshot.dataUrl);
      const faviconDataUrl = faviconCache.get(screenshot.favIconUrl) || null;

      // Calculate sections - cell aspect ratio determines screenshot portion
      const cellAspect = cellWidth / cellHeight;
      const cellContentHeightPx = img.width / cellAspect;

      // Calculate step size (how much to advance per section, accounting for overlap)
      const stepHeightPx = cellContentHeightPx * (1 - overlapRatio);

      // Total number of sections needed (with overlap)
      const totalSections = Math.max(1, Math.ceil((img.height - cellContentHeightPx * overlapRatio) / stepHeightPx));

      let sectionIndex = 0;

      while (sectionIndex < totalSections) {
        // Add new page (except for first)
        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;
        totalPageNum++;
        updateLoadingProgress(totalPageNum, totalPages);
        await new Promise((r) => requestAnimationFrame(r));

        let y = PAGE_MARGIN;

        // Add header
        if (settings.showHeader) {
          const faviconSize = 4; // mm
          const faviconGap = 1.5; // mm between favicon and title
          let titleX = PAGE_MARGIN;

          // Draw favicon if available
          if (faviconDataUrl) {
            try {
              pdf.addImage(faviconDataUrl, titleX, y + 1.5, faviconSize, faviconSize);
              titleX += faviconSize + faviconGap;
            } catch {
              // Ignore favicon render errors
            }
          }

          pdf.setFontSize(9);
          pdf.setTextColor(30, 41, 59);
          const maxTitleWidth = paperWidth - PAGE_MARGIN - titleX;
          const title = screenshot.title ? screenshot.title.substring(0, 70) : 'Untitled';
          pdf.text(title, titleX, y + 5, { maxWidth: maxTitleWidth });

          pdf.setFontSize(6);
          pdf.setTextColor(71, 85, 105);
          const url = screenshot.url ? screenshot.url.substring(0, 90) : '';
          pdf.text(url, PAGE_MARGIN, y + 8.5);

          pdf.setDrawColor(226, 232, 240);
          pdf.setLineWidth(0.1);
          pdf.line(PAGE_MARGIN, y + 10, paperWidth - PAGE_MARGIN, y + 10);

          y += HEADER_HEIGHT + CONTENT_SPACING;
        }

        for (let cellIndex = 0; cellIndex < cellsPerPage && sectionIndex < totalSections; cellIndex++) {
          // sectionIndex はループ内で進むため、ラベル表示用に事前に保持する
          const currentSectionNum = sectionIndex + 1;

          const col = cellIndex;
          const cellX = PAGE_MARGIN + col * (cellWidth + cellGap);
          const cellY = y;

          const sourceY = Math.floor(sectionIndex * stepHeightPx);
          const sourceHeight = Math.min(cellContentHeightPx, img.height - sourceY);

          if (sourceHeight > 0) {
            const labelSpacing = 2;
            const labelHeight = 3;
            const availableImageHeight = cellHeight - labelSpacing - labelHeight;

            // 文字列長エラー回避のため幅を上限 2000px にキャップする
            const MAX_CANVAS_WIDTH = 2000;
            const scale = Math.min(1, MAX_CANVAS_WIDTH / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(sourceHeight * scale);

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(
              img,
              0, sourceY, img.width, sourceHeight,
              0, 0, canvas.width, canvas.height
            );

            const imageFormatUpper = settings.imageFormat.toUpperCase();
            const quality = settings.imageFormat === 'jpeg' ? 0.85 : undefined;
            const mimeType = settings.imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
            const sectionDataUrl = canvas.toDataURL(mimeType, quality);

            const actualCellHeight = (sourceHeight / img.width) * cellWidth;

            const imageHeight = Math.min(actualCellHeight, availableImageHeight);

            pdf.addImage(
              sectionDataUrl,
              imageFormatUpper,
              cellX,
              cellY,
              cellWidth,
              imageHeight
            );

            if (settings.showBorder) {
              pdf.setDrawColor(220, 220, 220);
              pdf.setLineWidth(0.2);
              pdf.rect(cellX, cellY, cellWidth, imageHeight);
            }

            pdf.setFontSize(5);
            pdf.setTextColor(71, 85, 105);
            const sectionLabel = `[${currentSectionNum}/${totalSections}]`;
            pdf.text(sectionLabel, cellX + cellWidth / 2, cellY + imageHeight + labelSpacing + 1.5, { align: 'center' });
          }

          sectionIndex++;

          // Allow UI to remain responsive
          if (sectionIndex % 4 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        if (settings.showFooter) {
          const footerBorderY = paperHeight - PAGE_MARGIN - FOOTER_HEIGHT - CONTENT_SPACING + 2;
          pdf.setDrawColor(226, 232, 240);
          pdf.setLineWidth(0.1);
          pdf.line(PAGE_MARGIN, footerBorderY, paperWidth - PAGE_MARGIN, footerBorderY);

          const footerY = paperHeight - PAGE_MARGIN - FOOTER_HEIGHT + 4;
          pdf.setFontSize(6);
          pdf.setTextColor(100, 116, 139);

          const date = new Date(capturedAt);
          const dateStr = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          const reloadLabel = capturedWithReload ? t('reload_label') : '';
          pdf.text(`${t('captured_at')}${dateStr}${reloadLabel}`, PAGE_MARGIN, footerY);
          pdf.text(`${totalPageNum} / ${totalPages}`, paperWidth / 2, footerY, { align: 'center' });

          pdf.setFontSize(5);
          pdf.text(t('display_may_differ'), paperWidth - PAGE_MARGIN, footerY - 1, { align: 'right' });
          pdf.text('Generated by SitePrinter extension', paperWidth - PAGE_MARGIN, footerY + 1.5, { align: 'right' });
        }
      }
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const MAX_TITLE_LEN = 30;
    const rawTitle = validScreenshots[0]?.title || '';
    const sanitized = rawTitle
      .replace(/^siteprinter[\s_\-:：]*/i, '')  // 先頭の "SitePrinter" 重複を除去
      .replace(/[/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, MAX_TITLE_LEN)
      .replace(/_$/, '');
    const titlePart = sanitized
      ? (validScreenshots.length > 1 ? `${sanitized}_他${validScreenshots.length - 1}件` : sanitized)
      : '';
    const filename = titlePart
      ? `siteprinter_${titlePart}_${timestamp}.pdf`
      : `siteprinter_${timestamp}.pdf`;

    pdf.save(filename);

    hideLoading();
  } catch (error) {
    console.error('PDF generation failed:', error);
    hideLoading();
    alert(`${t('pdf_gen_failed')}${error.message}`);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('img_load_failed')));
    img.src = src;
  });
}

async function loadFaviconDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 32, 32);
        URL.revokeObjectURL(blobUrl);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(null);
      };
      img.src = blobUrl;
    });
  } catch {
    return null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}


function showLoading(text) {
  loadingText.textContent = text;
  loadingPercent.textContent = '';
  loadingOverlay.classList.remove('hidden');
  downloadBtn.disabled = true;
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
  downloadBtn.disabled = false;
}

function updateLoadingProgress(current, total) {
  const pct = Math.round((current / total) * 100);
  loadingPercent.textContent = `${pct}%`;
}
