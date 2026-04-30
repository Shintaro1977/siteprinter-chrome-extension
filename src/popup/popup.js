import { supabase } from '../lib/supabase.js';

// DOM Elements
const accountArea = document.getElementById('accountArea');
const accountEmail = document.getElementById('accountEmail');
const planBadge = document.getElementById('planBadge');
const logoutBtn = document.getElementById('logoutBtn');
const loginView = document.getElementById('loginView');
const signupView = document.getElementById('signupView');
const mainView = document.getElementById('mainView');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginError = document.getElementById('loginError');
const signupError = document.getElementById('signupError');
const showSignupBtn = document.getElementById('showSignupBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const captureModeRadios = document.querySelectorAll('input[name="captureMode"]');
const tabListContainer = document.getElementById('tabList');
const captureBtn = document.getElementById('captureBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

// State
let selectedTabs = [];
let allTabs = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    await showMainView(session.user);
  } else {
    showLoginView();
  }

  // Auth state listener
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await showMainView(session.user);
    } else {
      showLoginView();
    }
  });

  // Login form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    loginError.classList.add('hidden');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      loginError.textContent = 'メールアドレスまたはパスワードが正しくありません';
      loginError.classList.remove('hidden');
    }
  });

  // Signup form
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmailInput').value;
    const password = document.getElementById('signupPasswordInput').value;

    signupError.classList.add('hidden');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      signupError.textContent = error.message;
      signupError.classList.remove('hidden');
    } else {
      signupError.textContent = '確認メールを送信しました。メールを確認してください。';
      signupError.style.color = '#16a34a';
      signupError.classList.remove('hidden');
    }
  });

  // View toggle
  showSignupBtn.addEventListener('click', () => {
    loginView.classList.add('hidden');
    signupView.classList.remove('hidden');
  });

  showLoginBtn.addEventListener('click', () => {
    signupView.classList.add('hidden');
    loginView.classList.remove('hidden');
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  // Capture mode
  captureModeRadios.forEach((radio) => {
    radio.addEventListener('change', handleCaptureModeChange);
  });

  captureBtn.addEventListener('click', handleCapture);
  updateRadioCardStates();
}

async function showMainView(user) {
  loginView.classList.add('hidden');
  signupView.classList.add('hidden');
  mainView.classList.remove('hidden');
  accountArea.classList.remove('hidden');

  accountEmail.textContent = user.email;

  // サブスクリプション確認
  const { data } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .single();

  const isPro = data?.status === 'active';
  planBadge.textContent = isPro ? 'Pro' : '無料';
  planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;

  // ストレージにプラン情報を保存（previewページから参照するため）
  await chrome.storage.local.set({ userPlan: isPro ? 'pro' : 'free', userEmail: user.email });
}

function showLoginView() {
  mainView.classList.add('hidden');
  signupView.classList.add('hidden');
  accountArea.classList.add('hidden');
  loginView.classList.remove('hidden');
  chrome.storage.local.remove(['userPlan', 'userEmail']);
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
      タブを読み込み中...
    </div>
  `;

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    allTabs = tabs.filter((tab) => tab.url && !tab.url.startsWith('chrome://'));
    selectedTabs = allTabs.map((tab) => tab.id);
    renderTabList();
  } catch (error) {
    tabListContainer.innerHTML = `<div class="tab-list-loading">タブの読み込みに失敗しました</div>`;
  }
}

function renderTabList() {
  if (allTabs.length === 0) {
    tabListContainer.innerHTML = `<div class="tab-list-loading">キャプチャ可能なタブがありません</div>`;
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
      alert('キャプチャするタブを選択してください');
      return;
    }
    tabsToCapture = [...selectedTabs];
  }

  showLoading('スクリーンショットを取得中...');
  chrome.runtime.sendMessage({ action: 'captureScreenshots', tabIds: tabsToCapture });
  window.close();
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
  captureBtn.disabled = true;
}
