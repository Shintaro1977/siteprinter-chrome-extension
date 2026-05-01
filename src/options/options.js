import { supabase } from '../lib/supabase.js';

// DOM Elements
const planBadge = document.getElementById('planBadge');
const loginView = document.getElementById('loginView');
const signupView = document.getElementById('signupView');
const mainView = document.getElementById('mainView');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginError = document.getElementById('loginError');
const signupError = document.getElementById('signupError');
const showSignupBtn = document.getElementById('showSignupBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const accountEmail = document.getElementById('accountEmail');
const accountPlanBadge = document.getElementById('accountPlanBadge');
const upgradeBtn = document.getElementById('upgradeBtn');
const logoutBtn = document.getElementById('logoutBtn');
const versionText = document.getElementById('versionText');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

document.addEventListener('DOMContentLoaded', init);

// Toast notification function
function showToast(message = '設定を保存しました') {
  toastMessage.textContent = message;
  toast.classList.remove('hidden', 'hiding');

  // Auto hide after 2 seconds
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('hiding');
    }, 300); // Match animation duration
  }, 2000);
}

async function init() {
  // バージョン情報を取得
  const manifest = chrome.runtime.getManifest();
  versionText.textContent = manifest.version;

  // Load saved image format setting
  await loadImageFormatSetting();

  // Image format change listener
  document.querySelectorAll('input[name="imageFormat"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      await chrome.storage.local.set({ imageFormat: radio.value });
      console.log('Image format saved:', radio.value);
      showToast('画像形式を保存しました');
    });
  });

  // ========================================
  // テスト用: ログイン状態を強制的に表示
  // ========================================
  const testUser = {
    email: 'test@example.com',
    id: 'test-user-id'
  };
  await showMainView(testUser);

  // ========================================
  // 本番用コード（コメントアウト中）
  // テスト後は以下のコメントを解除して、上のテストコードを削除してください
  // ========================================
  // const { data: { session } } = await supabase.auth.getSession();
  //
  // if (session) {
  //   await showMainView(session.user);
  // } else {
  //   showLoginView();
  // }

  // ========================================
  // Auth state listener（テスト中はコメントアウト）
  // ========================================
  // supabase.auth.onAuthStateChange(async (_event, session) => {
  //   if (session) {
  //     await showMainView(session.user);
  //   } else {
  //     showLoginView();
  //   }
  // });

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

  // Upgrade button
  upgradeBtn.addEventListener('click', () => {
    window.open('https://app.siteprinter.jp', '_blank');
  });
}

async function showMainView(user) {
  loginView.classList.add('hidden');
  signupView.classList.add('hidden');
  mainView.classList.remove('hidden');

  accountEmail.textContent = user.email;

  // ========================================
  // テスト用: プラン表示を切り替え
  // ========================================
  // 無料プランとして表示する場合
  // const isPro = false;

  // Proプランとして表示する場合
  const isPro = true;

  // ========================================
  // 本番用コード（コメントアウト中）
  // ========================================
  // const { data } = await supabase
  //   .from('subscriptions')
  //   .select('status')
  //   .eq('user_id', user.id)
  //   .single();
  //
  // const isPro = data?.status === 'active';

  // ヘッダーのプランバッジ
  planBadge.textContent = isPro ? 'Pro' : '無料';
  planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;

  // アカウント情報のプランバッジ
  accountPlanBadge.textContent = isPro ? 'Pro' : '無料';
  accountPlanBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;

  // アップグレードボタンの表示/非表示
  if (!isPro) {
    upgradeBtn.classList.remove('hidden');
  } else {
    upgradeBtn.classList.add('hidden');
  }

  // ストレージにプラン情報を保存（previewページから参照するため）
  await chrome.storage.local.set({ userPlan: isPro ? 'pro' : 'free', userEmail: user.email });
}

function showLoginView() {
  mainView.classList.add('hidden');
  signupView.classList.add('hidden');
  loginView.classList.remove('hidden');

  // ヘッダーのプランバッジをリセット
  planBadge.textContent = '無料';
  planBadge.className = 'plan-badge plan-free';

  chrome.storage.local.remove(['userPlan', 'userEmail']);
}

async function loadImageFormatSetting() {
  const { imageFormat } = await chrome.storage.local.get({ imageFormat: 'png' });
  const radio = document.querySelector(`input[name="imageFormat"][value="${imageFormat}"]`);
  if (radio) {
    radio.checked = true;
  }
}
