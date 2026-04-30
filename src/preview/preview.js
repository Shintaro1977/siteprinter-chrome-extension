import { jsPDF } from 'jspdf';

// Japanese font state
let japaneseFontBase64 = null;

// Load Japanese font (Noto Sans JP)
async function loadJapaneseFont() {
  if (japaneseFontBase64) return japaneseFontBase64;

  try {
    const fontUrl = chrome.runtime.getURL('assets/fonts/NotoSansJP-Regular.ttf');
    const response = await fetch(fontUrl);
    const arrayBuffer = await response.arrayBuffer();

    // Convert ArrayBuffer to base64
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

// Register Japanese font with jsPDF instance
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

// DOM Elements
const previewContainer = document.getElementById('previewContainer');
const pageInfo = document.getElementById('pageInfo');
const downloadBtn = document.getElementById('downloadBtn');
const screenshotList = document.getElementById('screenshotList');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const showHeaderCheckbox = document.getElementById('showHeader');
const showFooterCheckbox = document.getElementById('showFooter');

// State
let screenshots = [];
let capturedAt = '';
let settings = {
  paperSize: 'a4',
  columns: 2,
  overlap: 'none',
  showHeader: true,
  showFooter: true,
};

// Constants
const PAPER_SIZES = {
  a4: { width: 210, height: 297 }, // A4: 210mm x 297mm
  a3: { width: 297, height: 420 }, // A3: 297mm x 420mm
};
const MM_TO_PX = 2.83; // Approximate conversion for preview
const PAGE_MARGIN = 7; // Page margin in mm
const HEADER_HEIGHT = 15; // Header height in mm
const FOOTER_HEIGHT = 8; // Footer height in mm
const CONTENT_SPACING = 2.5; // Spacing between header/footer and content in mm
const OVERLAP_SIZES = {
  none: 0,      // No overlap
  small: 0.03,  // 3% overlap
  large: 0.05,  // 5% overlap
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Preload Japanese font
  loadJapaneseFont();

  // Load screenshots from storage
  const data = await chrome.storage.local.get(['screenshots', 'capturedAt']);
  screenshots = data.screenshots || [];
  capturedAt = data.capturedAt || new Date().toISOString();

  if (screenshots.length === 0) {
    previewContainer.innerHTML = `
      <div class="preview-loading">
        <p>スクリーンショットが見つかりません</p>
      </div>
    `;
    return;
  }

  // Render screenshot list
  renderScreenshotList();

  // Set up event listeners
  setupEventListeners();

  // Initial render
  renderPreview();
}

function setupEventListeners() {
  // Paper size buttons
  document.querySelectorAll('.paper-size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.paper-size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.paperSize = btn.dataset.paperSize;
      renderPreview();
    });
  });

  // Column buttons
  document.querySelectorAll('.column-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.column-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.columns = parseInt(btn.dataset.columns, 10);
      renderPreview();
    });
  });

  // Overlap buttons
  document.querySelectorAll('.overlap-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.overlap-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.overlap = btn.dataset.overlap;
      renderPreview();
    });
  });

  // Header/Footer checkboxes
  showHeaderCheckbox.addEventListener('change', () => {
    settings.showHeader = showHeaderCheckbox.checked;
    renderPreview();
  });

  showFooterCheckbox.addEventListener('change', () => {
    settings.showFooter = showFooterCheckbox.checked;
    renderPreview();
  });

  // Download button
  downloadBtn.addEventListener('click', generatePDF);
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

function renderPreview() {
  const validScreenshots = screenshots.filter((s) => !s.error && s.dataUrl);
  if (validScreenshots.length === 0) {
    previewContainer.innerHTML = `
      <div class="preview-loading">
        <p>有効なスクリーンショットがありません</p>
      </div>
    `;
    return;
  }

  // Calculate layout
  const pages = calculateLayout(validScreenshots);
  pageInfo.textContent = `${pages.length} ページ`;

  // Render pages
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

  return `
    <div class="preview-page-footer">
      <span>${dateStr}</span>
      <span>${pageNum} / ${totalPages}</span>
      <span>SitePrinter for Chrome</span>
    </div>
  `;
}

function renderCell(cell) {
  const translateY = cell.yOffsetPercent;
  const sectionLabel = `[${cell.sectionIndex + 1}/${cell.totalSections}]`;

  // For the last section, use padding-bottom trick for exact sizing
  if (cell.isLastSection && cell.actualHeightPercent < 100) {
    const paddingBottom = cell.cellAspectRatio * cell.actualHeightPercent;

    return `
      <div class="preview-image-cell preview-image-cell--last">
        <div style="position: relative; width: 100%; padding-bottom: ${paddingBottom}%; overflow: hidden; background: #ffffff; border: 1px solid #e2e8f0;">
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
      <div class="preview-image-wrapper">
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
    alert('PDFを生成するスクリーンショットがありません');
    return;
  }

  showLoading('PDFを生成中...');

  // Use setTimeout to allow UI to update
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    // Ensure Japanese font is loaded
    const fontBase64 = await loadJapaneseFont();

    // Get paper dimensions based on selected size
    const paperSize = PAPER_SIZES[settings.paperSize];
    const paperWidth = paperSize.width;
    const paperHeight = paperSize.height;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: settings.paperSize,
    });

    // Register and set Japanese font
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

    // Pre-calculate total pages
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

    // Pre-load favicons for all screenshots
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
      // Load image
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
          pdf.setTextColor(100, 116, 139);
          const url = screenshot.url ? screenshot.url.substring(0, 90) : '';
          pdf.text(url, PAGE_MARGIN, y + 10);

          // Draw border line below header
          pdf.setDrawColor(226, 232, 240); // #e2e8f0
          pdf.setLineWidth(0.1);
          pdf.line(PAGE_MARGIN, y + HEADER_HEIGHT - 2, paperWidth - PAGE_MARGIN, y + HEADER_HEIGHT - 2);

          // Move y position past header and spacing
          y += HEADER_HEIGHT + CONTENT_SPACING;
        }

        // Add cells to page (1 row, multiple columns)
        for (let cellIndex = 0; cellIndex < cellsPerPage && sectionIndex < totalSections; cellIndex++) {
          // Store current section number BEFORE processing
          const currentSectionNum = sectionIndex + 1;

          const col = cellIndex; // Only 1 row, so cellIndex = column

          const cellX = PAGE_MARGIN + col * (cellWidth + cellGap);
          const cellY = y; // All cells on same row

          // Calculate source rectangle for this section (with overlap)
          const sourceY = Math.floor(sectionIndex * stepHeightPx);
          const sourceHeight = Math.min(cellContentHeightPx, img.height - sourceY);

          if (sourceHeight > 0) {
            // Reserve space for section label (with spacing)
            const labelSpacing = 2; // Space above label (mm)
            const labelHeight = 3; // Space for label itself (mm)
            const availableImageHeight = cellHeight - labelSpacing - labelHeight;

            // Create canvas for this section
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = Math.ceil(sourceHeight);

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(
              img,
              0, sourceY, img.width, sourceHeight,
              0, 0, img.width, sourceHeight
            );

            // Convert to data URL and add to PDF
            const sectionDataUrl = canvas.toDataURL('image/jpeg', 0.8);

            // Calculate actual height to maintain aspect ratio
            const actualCellHeight = (sourceHeight / img.width) * cellWidth;

            const imageHeight = Math.min(actualCellHeight, availableImageHeight);

            pdf.addImage(
              sectionDataUrl,
              'JPEG',
              cellX,
              cellY,
              cellWidth,
              imageHeight
            );

            // Draw border
            pdf.setDrawColor(220, 220, 220);
            pdf.setLineWidth(0.2);
            pdf.rect(cellX, cellY, cellWidth, imageHeight);

            // Add section number label below image with spacing
            pdf.setFontSize(5);
            pdf.setTextColor(100, 116, 139);
            const sectionLabel = `[${currentSectionNum}/${totalSections}]`;
            pdf.text(sectionLabel, cellX + cellWidth / 2, cellY + imageHeight + labelSpacing + 1.5, { align: 'center' });
          }

          sectionIndex++;

          // Allow UI to remain responsive
          if (sectionIndex % 4 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        // Add footer
        if (settings.showFooter) {
          // Draw border line above footer
          const footerBorderY = paperHeight - PAGE_MARGIN - FOOTER_HEIGHT - CONTENT_SPACING + 2;
          pdf.setDrawColor(226, 232, 240); // #e2e8f0
          pdf.setLineWidth(0.1);
          pdf.line(PAGE_MARGIN, footerBorderY, paperWidth - PAGE_MARGIN, footerBorderY);

          // Footer starts after content + spacing, or at bottom - margin - footer height
          const footerY = paperHeight - PAGE_MARGIN - FOOTER_HEIGHT + 4;
          pdf.setFontSize(6);
          pdf.setTextColor(148, 163, 184);

          const date = new Date(capturedAt);
          const dateStr = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          pdf.text(dateStr, PAGE_MARGIN, footerY);
          pdf.text(`${totalPageNum} / ${totalPages}`, paperWidth / 2, footerY, { align: 'center' });
          pdf.text('SitePrinter for Chrome', paperWidth - PAGE_MARGIN, footerY, { align: 'right' });
        }
      }
    }

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `siteprinter_${timestamp}.pdf`;

    // Download PDF
    pdf.save(filename);

    hideLoading();
  } catch (error) {
    console.error('PDF generation failed:', error);
    hideLoading();
    alert(`PDF生成に失敗しました: ${error.message}`);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = src;
  });
}

async function loadFaviconDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
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
  loadingOverlay.classList.remove('hidden');
  downloadBtn.disabled = true;
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
  downloadBtn.disabled = false;
}
