import { jsPDF } from 'jspdf';

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
  columns: 2,
  margin: 'medium',
  showHeader: true,
  showFooter: true,
};

// Constants - A4 at 72 DPI for preview
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_TO_PX = 2.83; // Approximate conversion for preview
const MARGIN_SIZES = {
  small: 10,
  medium: 15,
  large: 20,
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
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
  // Column buttons
  document.querySelectorAll('.column-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.column-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.columns = parseInt(btn.dataset.columns, 10);
      renderPreview();
    });
  });

  // Margin buttons
  document.querySelectorAll('.margin-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.margin-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      settings.margin = btn.dataset.margin;
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
    <div class="preview-page">
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
  const margin = MARGIN_SIZES[settings.margin];
  const columns = settings.columns;
  const cellGap = 3;

  // Calculate content area in mm
  const headerHeight = settings.showHeader ? 25 : 0;
  const footerHeight = settings.showFooter ? 20 : 0;
  const contentWidth = A4_WIDTH_MM - margin * 2;
  const contentHeight = A4_HEIGHT_MM - margin * 2 - headerHeight - footerHeight;

  // Cell dimensions
  const cellWidthMM = (contentWidth - (columns - 1) * cellGap) / columns;
  // Each cell is square-ish, using same aspect as the original screenshot section
  const cellHeightMM = cellWidthMM * 1.2; // Slightly taller than wide

  // How many rows fit per page
  const rowsPerPage = Math.floor((contentHeight + cellGap) / (cellHeightMM + cellGap));
  const cellsPerPage = rowsPerPage * columns;

  for (const screenshot of validScreenshots) {
    if (!screenshot.dataUrl) continue;

    // Calculate how screenshot splits into cells
    // Each cell shows a portion of the screenshot at cellWidthMM width
    const screenshotAspect = screenshot.width / screenshot.height;

    // Height of screenshot portion that fits in one cell (at cell width)
    const cellContentHeight = cellHeightMM / cellWidthMM * screenshot.width;

    // Total number of sections needed
    const totalSections = Math.max(1, Math.ceil(screenshot.height / cellContentHeight));

    let sectionIndex = 0;

    while (sectionIndex < totalSections) {
      // Start new page
      const page = {
        screenshot,
        cells: [],
      };

      // Fill page with cells
      for (let i = 0; i < cellsPerPage && sectionIndex < totalSections; i++) {
        const yOffsetPercent = (sectionIndex * cellContentHeight / screenshot.height) * 100;
        const heightPercent = (cellContentHeight / screenshot.height) * 100;

        page.cells.push({
          screenshot,
          sectionIndex,
          yOffsetPercent: Math.min(yOffsetPercent, 100),
          heightPercent,
        });
        sectionIndex++;
      }

      pages.push(page);
    }
  }

  return pages;
}

function renderHeader(screenshot) {
  return `
    <div class="preview-page-header">
      <div class="preview-page-title">${escapeHtml(screenshot.title)}</div>
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
  // Calculate the visible portion of the image
  const clipHeight = cell.heightPercent;
  const translateY = cell.yOffsetPercent;

  return `
    <div class="preview-image-cell">
      <div class="preview-image-wrapper" style="height: 100%; overflow: hidden;">
        <img src="${cell.screenshot.dataUrl}" alt=""
             style="width: 100%; transform: translateY(-${translateY}%); transform-origin: top left;">
      </div>
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
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const margin = MARGIN_SIZES[settings.margin];
    const columns = settings.columns;
    const cellGap = 2;
    const headerHeight = settings.showHeader ? 18 : 0;
    const footerHeight = settings.showFooter ? 12 : 0;

    const contentWidth = A4_WIDTH_MM - margin * 2;
    const contentHeight = A4_HEIGHT_MM - margin * 2 - headerHeight - footerHeight;
    const cellWidth = (contentWidth - (columns - 1) * cellGap) / columns;
    const cellHeight = cellWidth * 1.2;

    const rowsPerPage = Math.floor((contentHeight + cellGap) / (cellHeight + cellGap));
    const cellsPerPage = rowsPerPage * columns;

    let totalPageNum = 0;
    let isFirstPage = true;

    for (const screenshot of validScreenshots) {
      // Load image
      const img = await loadImage(screenshot.dataUrl);

      // Calculate sections
      const cellContentHeightPx = (cellHeight / cellWidth) * img.width;
      const totalSections = Math.max(1, Math.ceil(img.height / cellContentHeightPx));

      let sectionIndex = 0;

      while (sectionIndex < totalSections) {
        // Add new page (except for first)
        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;
        totalPageNum++;

        let y = margin;

        // Add header
        if (settings.showHeader) {
          pdf.setFontSize(9);
          pdf.setTextColor(30, 41, 59);
          const title = screenshot.title ? screenshot.title.substring(0, 70) : 'Untitled';
          pdf.text(title, margin, y + 6);

          pdf.setFontSize(6);
          pdf.setTextColor(100, 116, 139);
          const url = screenshot.url ? screenshot.url.substring(0, 90) : '';
          pdf.text(url, margin, y + 11);

          y += headerHeight;
        }

        // Add cells to page
        for (let cellIndex = 0; cellIndex < cellsPerPage && sectionIndex < totalSections; cellIndex++) {
          const row = Math.floor(cellIndex / columns);
          const col = cellIndex % columns;

          const cellX = margin + col * (cellWidth + cellGap);
          const cellY = y + row * (cellHeight + cellGap);

          // Calculate source rectangle for this section
          const sourceY = Math.floor(sectionIndex * cellContentHeightPx);
          const sourceHeight = Math.min(cellContentHeightPx, img.height - sourceY);

          if (sourceHeight > 0) {
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

            pdf.addImage(
              sectionDataUrl,
              'JPEG',
              cellX,
              cellY,
              cellWidth,
              Math.min(actualCellHeight, cellHeight)
            );

            // Draw border
            pdf.setDrawColor(220, 220, 220);
            pdf.setLineWidth(0.2);
            pdf.rect(cellX, cellY, cellWidth, Math.min(actualCellHeight, cellHeight));
          }

          sectionIndex++;

          // Allow UI to remain responsive
          if (sectionIndex % 4 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        // Add footer
        if (settings.showFooter) {
          const footerY = A4_HEIGHT_MM - margin - 4;
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

          pdf.text(dateStr, margin, footerY);
          pdf.text(`${totalPageNum}`, A4_WIDTH_MM / 2, footerY, { align: 'center' });
          pdf.text('SitePrinter for Chrome', A4_WIDTH_MM - margin, footerY, { align: 'right' });
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
