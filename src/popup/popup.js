import { t, applyI18n, isJa } from '../lib/i18n.js';

applyI18n();

const planBadge = document.getElementById('planBadge');
const settingsBtn = document.getElementById('settingsBtn');
const mainView = document.getElementById('mainView');
const captureModeRadios = document.querySelectorAll('input[name="captureMode"]');
const tabListContainer = document.getElementById('tabList');
const captureBtn = document.getElementById('captureBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

let selectedTabs = [];
let allTabs = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await updatePlanBadge();

  settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  });

  captureModeRadios.forEach((radio) => {
    radio.addEventListener('change', handleCaptureModeChange);
  });

  captureBtn.addEventListener('click', handleCapture);
  updateRadioCardStates();
}

async function updatePlanBadge() {
  const { userPlan } = await chrome.storage.local.get(['userPlan']);
  const isPro = userPlan === 'pro';

  planBadge.textContent = isPro ? 'Pro' : t('plan_free');
  planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;
}

function updateRadioCardStates() {
  captureModeRadios.forEach((radio) => {
    const card = radio.closest('.radio-card');
    card.classList.toggle('active', radio.checked);
  });
}

async function handleCaptureModeChange(e) {
  updateRadioCardStates();

  if (e.target.value === 'multiple') {
    tabListContainer.classList.remove('hidden');
    await loadTabs();
  } else {
    tabListContainer.classList.add('hidden');
    selectedTabs = [];
  }
}

async function loadTabs() {
  tabListContainer.innerHTML = `
    <div class="tab-list-loading">
      <span class="spinner"></span>
      ${t('loading_tabs')}
    </div>
  `;

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    allTabs = tabs.filter((tab) => tab.url && !tab.url.startsWith('chrome://'));
    selectedTabs = allTabs.map((tab) => tab.id);
    renderTabList();
  } catch (error) {
    tabListContainer.innerHTML = `<div class="tab-list-loading">${t('tabs_load_failed')}</div>`;
  }
}

function renderTabList() {
  if (allTabs.length === 0) {
    tabListContainer.innerHTML = `<div class="tab-list-loading">${t('no_capturable_tabs')}</div>`;
    return;
  }

  tabListContainer.innerHTML = allTabs
    .map((tab) => `
      <div class="tab-item ${selectedTabs.includes(tab.id) ? 'selected' : ''}" data-tab-id="${tab.id}">
        <input type="checkbox" class="tab-checkbox" ${selectedTabs.includes(tab.id) ? 'checked' : ''}>
        <img class="tab-favicon" src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><rect fill=%22%23e2e8f0%22 width=%2216%22 height=%2216%22 rx=%222%22/></svg>'}" alt="">
        <span class="tab-title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
      </div>
    `).join('');

  tabListContainer.querySelectorAll('.tab-item').forEach((item) => {
    item.addEventListener('click', () => {
      toggleTabSelection(parseInt(item.dataset.tabId, 10));
    });
  });
}

function toggleTabSelection(tabId) {
  const index = selectedTabs.indexOf(tabId);
  if (index === -1) {
    selectedTabs.push(tabId);
  } else {
    selectedTabs.splice(index, 1);
  }
  renderTabList();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function handleCapture() {
  const captureMode = document.querySelector('input[name="captureMode"]:checked').value;
  let tabsToCapture = [];

  if (captureMode === 'current') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) tabsToCapture = [activeTab.id];
  } else {
    if (selectedTabs.length === 0) {
      alert(t('select_tabs_alert'));
      return;
    }
    tabsToCapture = [...selectedTabs];
  }

  showLoading(t('capturing_loading'));

  // Wait for the service worker to acknowledge before closing.
  // Without this, closing the popup while the SW is dormant can drop the message.
  await Promise.race([
    chrome.runtime.sendMessage({ action: 'captureScreenshots', tabIds: tabsToCapture }).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  window.close();
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
  captureBtn.disabled = true;
}
