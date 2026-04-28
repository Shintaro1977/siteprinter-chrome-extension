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

// Constants
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
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
      (screenshot, index) => `
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
  const validScreenshots = screenshots.filter((s) => !s.error);
  if (validScreenshots.length === 0) {
    previewContainer.innerHTML = `
      <div class="preview-loading">
        <p>有効なスクリーンショットがありません</p>
      </div>
    `;
    return;
  }

  // Calculate pages
  const pages = calculatePages(validScreenshots);
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

function calculatePages(validScreenshots) {
  const pages = [];
  const margin = MARGIN_SIZES[settings.margin];
  const columns = settings.columns;

  // Calculate available content area
  const headerHeight = settings.showHeader ? 30 : 0;
  const footerHeight = settings.showFooter ? 25 : 0;
  const contentHeight = A4_HEIGHT_MM - margin * 2 - headerHeight - footerHeight;
  const contentWidth = A4_WIDTH_MM - margin * 2;
  const cellWidth = contentWidth / columns;
  const cellGap = 3; // mm

  for (const screenshot of validScreenshots) {
    if (!screenshot.dataUrl) continue;

    // Calculate how many rows this screenshot needs
    const aspectRatio = screenshot.width / screenshot.height;
    const scaledWidth = cellWidth - cellGap;
    const scaledHeight = scaledWidth / aspectRatio;

    // How many cells can fit in one page row
    const rowHeight = scaledHeight;
    const rowsPerPage = Math.floor(contentHeight / (rowHeight + cellGap));
    const cellsPerPage = rowsPerPage * columns;

    // Split screenshot into cells
    const totalCells = Math.ceil(screenshot.height / (screenshot.width / scaledWidth * rowHeight));
    let currentPage = null;
    let cellsOnCurrentPage = 0;

    for (let i = 0; i < totalCells; i++) {
      if (!currentPage || cellsOnCurrentPage >= cellsPerPage) {
        currentPage = {
          screenshot,
          cells: [],
        };
        pages.push(currentPage);
        cellsOnCurrentPage = 0;
      }

      const yOffset = i * rowHeight;
      currentPage.cells.push({
        screenshot,
        yOffset: (yOffset / scaledHeight) * 100,
        cellIndex: i,
      });
      cellsOnCurrentPage++;
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
  return `
    <div class="preview-image-cell">
      <img src="${cell.screenshot.dataUrl}" alt="" style="transform: translateY(-${cell.yOffset}%);">
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

  try {
    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const margin = MARGIN_SIZES[settings.margin];
    const columns = settings.columns;
    const headerHeight = settings.showHeader ? 15 : 0;
    const footerHeight = settings.showFooter ? 10 : 0;
    const contentWidth = A4_WIDTH_MM - margin * 2;
    const contentHeight = A4_HEIGHT_MM - margin * 2 - headerHeight - footerHeight;
    const cellWidth = (contentWidth - (columns - 1) * 2) / columns;
    const cellGap = 2;

    let pageNum = 0;

    for (const screenshot of validScreenshots) {
      // Load image
      const img = await loadImage(screenshot.dataUrl);
      const aspectRatio = img.width / img.height;

      // Calculate cell height based on width and aspect ratio
      const cellHeight = cellWidth / aspectRatio;

      // Calculate how many rows fit per page
      const rowsPerPage = Math.floor(contentHeight / (cellHeight + cellGap));
      const cellsPerPage = rowsPerPage * columns;

      // Calculate total sections needed
      const sectionHeight = (img.height / img.width) * cellWidth;
      const sectionsNeeded = Math.ceil(sectionHeight / cellHeight);

      let sectionIndex = 0;

      while (sectionIndex < sectionsNeeded) {
        if (pageNum > 0) {
          pdf.addPage();
        }
        pageNum++;

        let y = margin;

        // Add header
        if (settings.showHeader) {
          pdf.setFontSize(10);
          pdf.setTextColor(30, 41, 59);
          pdf.text(screenshot.title.substring(0, 80), margin, y + 8);
          pdf.setFontSize(7);
          pdf.setTextColor(100, 116, 139);
          pdf.text(screenshot.url.substring(0, 100), margin, y + 13);
          y += headerHeight;
        }

        // Add content cells
        let row = 0;
        let col = 0;

        while (sectionIndex < sectionsNeeded && row < rowsPerPage) {
          const x = margin + col * (cellWidth + cellGap);
          const cellY = y + row * (cellHeight + cellGap);

          // Calculate source rectangle for this section
          const sourceY = (sectionIndex / sectionsNeeded) * img.height;
          const sourceHeight = img.height / sectionsNeeded;

          // Create canvas for this section
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = sourceHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(
            img,
            0,
            sourceY,
            img.width,
            sourceHeight,
            0,
            0,
            img.width,
            sourceHeight
          );

          // Add to PDF
          const sectionDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          pdf.addImage(sectionDataUrl, 'JPEG', x, cellY, cellWidth, cellHeight);

          // Draw border
          pdf.setDrawColor(226, 232, 240);
          pdf.rect(x, cellY, cellWidth, cellHeight);

          sectionIndex++;
          col++;
          if (col >= columns) {
            col = 0;
            row++;
          }
        }

        // Add footer
        if (settings.showFooter) {
          const footerY = A4_HEIGHT_MM - margin - 5;
          pdf.setFontSize(7);
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
          pdf.text(
            `${pageNum}`,
            A4_WIDTH_MM / 2,
            footerY,
            { align: 'center' }
          );
          pdf.text('SitePrinter for Chrome', A4_WIDTH_MM - margin, footerY, {
            align: 'right',
          });
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
    img.onerror = reject;
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
