import { supabase } from '../lib/supabase.js';

// DOM Elements
const planBadge = document.getElementById('planBadge');
const authView = document.getElementById('authView');
const mainView = document.getElementById('mainView');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginError = document.getElementById('loginError');
const signupError = document.getElementById('signupError');
const accountEmail = document.getElementById('accountEmail');
const accountPlanBadge = document.getElementById('accountPlanBadge');
const upgradeBtn = document.getElementById('upgradeBtn');
const manageBtn = document.getElementById('manageBtn');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

document.addEventListener('DOMContentLoaded', init);

function showToast(message = '設定を保存しました') {
  toastMessage.textContent = message;
  toast.classList.remove('hidden', 'hiding');
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('hiding');
    }, 300);
  }, 2000);
}

// タブ切り替え
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
  document.getElementById('loginPane').classList.toggle('hidden', !isLogin);
  document.getElementById('signupPane').classList.toggle('hidden', isLogin);
  loginError.classList.add('hidden');
  signupError.classList.add('hidden');
}

async function init() {
  // キャッシュからプランバッジを即時反映（Supabase取得前のちらつき防止）
  const { userPlan } = await chrome.storage.local.get({ userPlan: null });
  if (userPlan) {
    planBadge.textContent = userPlan === 'pro' ? 'Pro' : '無料';
    planBadge.className = `plan-badge ${userPlan === 'pro' ? 'plan-pro' : 'plan-free'}`;
  }

  await loadImageFormatSetting();
  await loadForceReloadSetting();
  await loadContextMenuSetting();
  await loadSaveLastSettingsSetting();

  // 画像形式
  document.querySelectorAll('input[name="imageFormat"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      await chrome.storage.local.set({ imageFormat: radio.value });
      showToast('画像形式を保存しました');
    });
  });

  // 強制リロード
  const forceReloadToggle = document.getElementById('forceReloadToggle');
  forceReloadToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ forceReload: forceReloadToggle.checked });
    showToast(forceReloadToggle.checked ? '再読込取得をONにしました' : '再読込取得をOFFにしました');
  });

  // 右クリックメニュー
  const contextMenuToggle = document.getElementById('contextMenuToggle');
  contextMenuToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ contextMenuEnabled: contextMenuToggle.checked });
    showToast(contextMenuToggle.checked ? '右クリックメニューをONにしました' : '右クリックメニューをOFFにしました');
  });

  // 前回の設定を保存する
  const saveLastSettingsToggle = document.getElementById('saveLastSettingsToggle');
  saveLastSettingsToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ saveLastSettings: saveLastSettingsToggle.checked });
    if (!saveLastSettingsToggle.checked) {
      await chrome.storage.local.remove('savedPreviewSettings');
    }
    showToast(saveLastSettingsToggle.checked ? '設定の保存をONにしました' : '設定の保存をOFFにしました');
  });

  // セッション確認
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await showMainView(session.user);
  } else {
    showAuthView();
  }

  // Stripeなど別タブから戻ってきたときにプランを再チェック
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await showMainView(session.user);
    }
  });

  // 手動更新ボタン
  refreshBtn.addEventListener('click', () => {
    location.reload();
  });

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await showMainView(session.user);
    } else {
      showAuthView();
    }
  });

  // Googleログイン
  document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    const btn = document.getElementById('googleLoginBtn');
    btn.disabled = true;
    btn.textContent = '認証中...';
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Google login failed:', err);
      loginError.textContent = err.message || 'Googleログインに失敗しました';
      loginError.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>Googleでログイン / 登録`;
    }
  });

  // タブ切り替え
  document.getElementById('tabLogin').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tabSignup').addEventListener('click', () => switchAuthTab('signup'));

  // ログイン
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    loginError.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'ログイン中...';

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'ログイン';
    if (error) {
      loginError.textContent = 'メールアドレスまたはパスワードが正しくありません';
      loginError.classList.remove('hidden');
    }
  });

  // サインアップ
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = signupForm.querySelector('button[type="submit"]');
    const email = document.getElementById('signupEmailInput').value;
    const password = document.getElementById('signupPasswordInput').value;

    signupError.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = '作成中...';

    const { error } = await supabase.auth.signUp({ email, password });

    btn.disabled = false;
    btn.textContent = 'アカウントを作成';
    if (error) {
      signupError.textContent = error.message;
      signupError.classList.remove('hidden');
    } else {
      signupError.textContent = '確認メールを送信しました。メールを確認してください。';
      signupError.style.color = '#16a34a';
      signupError.classList.remove('hidden');
    }
  });

  // サブスクリプション管理（解約など）
  manageBtn.addEventListener('click', async () => {
    manageBtn.disabled = true;
    manageBtn.textContent = '読み込み中...';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        'https://cglzfougwelfxvmnbung.supabase.co/functions/v1/create-portal-session',
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      const { url } = await res.json();
      chrome.tabs.create({ url });
    } catch (err) {
      console.error('Portal session error:', err);
      showToast('エラーが発生しました: ' + err.message);
    } finally {
      manageBtn.disabled = false;
      manageBtn.textContent = 'サブスクリプションを管理';
    }
  });

  // ログアウト
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  // アップグレード（ユーザーIDとメールをStripeに渡して確実に紐づける）
  upgradeBtn.addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const baseUrl = 'https://buy.stripe.com/test_4gMfZibmh2GQdY795H7kc00';
    const params = new URLSearchParams();
    if (session?.user?.id) params.set('client_reference_id', session.user.id);
    if (session?.user?.email) params.set('prefilled_email', session.user.email);
    chrome.tabs.create({ url: `${baseUrl}?${params.toString()}` });
  });
}

async function showMainView(user) {
  authView.classList.add('hidden');
  mainView.classList.remove('hidden');

  accountEmail.textContent = user.email;

  await loadPlanInfo(user);

  document.getElementById('retryPlanBtn').addEventListener('click', () => loadPlanInfo(user));
}

async function loadPlanInfo(user) {
  const planFetchError = document.getElementById('planFetchError');
  const upgradeBanner = document.getElementById('upgradeBanner');
  const periodEndRow = document.getElementById('periodEndRow');
  const periodEndText = document.getElementById('periodEndText');

  planFetchError.classList.add('hidden');

  try {
    // grantを優先チェック（有効期限内のgrantがあればProとして扱う）
    const { data: grantData, error: grantError } = await supabase
      .from('user_grants')
      .select('plan, expires_at')
      .eq('user_id', user.id)
      .single();

    if (grantError && grantError.code !== 'PGRST116') throw grantError;

    const hasActiveGrant = grantData?.plan === 'pro' &&
      (!grantData.expires_at || new Date(grantData.expires_at) > new Date());

    if (hasActiveGrant) {
      planBadge.textContent = 'Pro';
      planBadge.className = 'plan-badge plan-pro';
      accountPlanBadge.textContent = 'Pro';
      accountPlanBadge.className = 'plan-badge plan-pro-card';
      upgradeBanner.classList.add('hidden');
      manageBtn.classList.add('hidden');
      periodEndRow.classList.add('hidden');
      await chrome.storage.local.set({ userPlan: 'pro', userEmail: user.email });
      return;
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, cancel_at_period_end, current_period_end')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const isPro = data?.status === 'active';

    planBadge.textContent = isPro ? 'Pro' : '無料';
    planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;
    accountPlanBadge.textContent = isPro ? 'Pro' : '無料';
    accountPlanBadge.className = `plan-badge ${isPro ? 'plan-pro-card' : 'plan-free-card'}`;

    upgradeBanner.classList.toggle('hidden', isPro);
    manageBtn.classList.toggle('hidden', !isPro);

    if (isPro && data?.cancel_at_period_end && data?.current_period_end) {
      const endDate = new Date(data.current_period_end);
      const formatted = `${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()} まで利用可能（解約予約済み）`;
      periodEndText.textContent = formatted;
      periodEndRow.classList.remove('hidden');
    } else {
      periodEndRow.classList.add('hidden');
    }

    await chrome.storage.local.set({ userPlan: isPro ? 'pro' : 'free', userEmail: user.email });

  } catch (err) {
    console.error('[Plan] Failed to fetch plan info:', err);

    // エラー時はどちらのボタンも表示しない
    upgradeBanner.classList.add('hidden');
    manageBtn.classList.add('hidden');
    periodEndRow.classList.add('hidden');
    planBadge.textContent = '-';
    planBadge.className = 'plan-badge plan-free';
    accountPlanBadge.textContent = '-';
    accountPlanBadge.className = 'plan-badge plan-free-card';
    planFetchError.classList.remove('hidden');
  }
}

function showAuthView() {
  mainView.classList.add('hidden');
  authView.classList.remove('hidden');
  switchAuthTab('login');

  planBadge.textContent = '無料';
  planBadge.className = 'plan-badge plan-free';
  chrome.storage.local.remove(['userPlan', 'userEmail']);
}

async function loadImageFormatSetting() {
  const { imageFormat } = await chrome.storage.local.get({ imageFormat: 'jpeg' });
  const radio = document.querySelector(`input[name="imageFormat"][value="${imageFormat}"]`);
  if (radio) radio.checked = true;
}

async function loadForceReloadSetting() {
  const { forceReload } = await chrome.storage.local.get({ forceReload: false });
  document.getElementById('forceReloadToggle').checked = forceReload;
}

async function loadContextMenuSetting() {
  const { contextMenuEnabled } = await chrome.storage.local.get({ contextMenuEnabled: true });
  document.getElementById('contextMenuToggle').checked = contextMenuEnabled;
}

async function loadSaveLastSettingsSetting() {
  const { saveLastSettings } = await chrome.storage.local.get({ saveLastSettings: true });
  document.getElementById('saveLastSettingsToggle').checked = saveLastSettings;
}

async function signInWithGoogle() {
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUri, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: data.url, interactive: true },
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!redirectUrl) {
          reject(new Error('認証がキャンセルされました'));
        } else {
          resolve(redirectUrl);
        }
      }
    );
  });

  const url = new URL(responseUrl);

  // ハッシュフラグメントにトークンが含まれる場合（Supabase implicit flow）
  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
      return;
    }
  }

  // クエリパラメータにコードが含まれる場合（PKCE flow）
  const code = url.searchParams.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }
}
