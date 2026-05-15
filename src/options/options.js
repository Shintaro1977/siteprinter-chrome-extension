import { supabase } from '../lib/supabase.js';

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
const guestBadgeRow = document.getElementById('guestBadgeRow');
const logoutBtn = document.getElementById('logoutBtn');
const deleteAccountBtn = document.getElementById('deleteAccountBtn');
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
  document.getElementById('emailSentPane').classList.add('hidden');
  document.getElementById('forgotPane').classList.add('hidden');
  loginError.classList.add('hidden');
  signupError.classList.add('hidden');
}

function showEmailSentPane(email) {
  document.getElementById('loginPane').classList.add('hidden');
  document.getElementById('signupPane').classList.add('hidden');
  document.getElementById('emailSentPane').classList.remove('hidden');
  document.getElementById('emailSentAddress').textContent = email;
}

async function init() {
  const CHROME_EXTENSION_ID = 'dcmapjdkohckbpddkgedhcjldhbcomij';
  if (chrome.runtime.id !== CHROME_EXTENSION_ID) {
    document.getElementById('reviewLink').href =
      `https://microsoftedge.microsoft.com/addons/detail/${chrome.runtime.id}`;
  }

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

  document.querySelectorAll('input[name="imageFormat"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      await chrome.storage.local.set({ imageFormat: radio.value });
      showToast('画像形式を保存しました');
    });
  });

  const forceReloadToggle = document.getElementById('forceReloadToggle');
  forceReloadToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ forceReload: forceReloadToggle.checked });
    showToast(forceReloadToggle.checked ? '再読込取得をONにしました' : '再読込取得をOFFにしました');
  });

  const contextMenuToggle = document.getElementById('contextMenuToggle');
  contextMenuToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ contextMenuEnabled: contextMenuToggle.checked });
    showToast(contextMenuToggle.checked ? '右クリックメニューをONにしました' : '右クリックメニューをOFFにしました');
  });

  const saveLastSettingsToggle = document.getElementById('saveLastSettingsToggle');
  saveLastSettingsToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ saveLastSettings: saveLastSettingsToggle.checked });
    if (!saveLastSettingsToggle.checked) {
      await chrome.storage.local.remove('savedPreviewSettings');
    }
    showToast(saveLastSettingsToggle.checked ? '設定の保存をONにしました' : '設定の保存をOFFにしました');
  });

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

  document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    if (!document.getElementById('agreeTermsGoogle').checked) {
      loginError.textContent = '利用規約・プライバシーポリシーへの同意が必要です';
      loginError.classList.remove('hidden');
      return;
    }
    loginError.classList.add('hidden');
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

  document.getElementById('tabLogin').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tabSignup').addEventListener('click', () => switchAuthTab('signup'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    const resendBtn = document.getElementById('resendConfirmBtn');

    loginError.classList.add('hidden');
    resendBtn.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'ログイン中...';

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'ログイン';
    if (error) {
      if (error.message === 'Email not confirmed') {
        loginError.textContent = 'メールアドレスの確認が完了していません。受信ボックスをご確認ください。';
        resendBtn.classList.remove('hidden');
        resendBtn.onclick = async () => {
          resendBtn.disabled = true;
          resendBtn.textContent = '送信中...';
          await supabase.auth.resend({ type: 'signup', email });
          resendBtn.textContent = '再送信しました';
          setTimeout(() => {
            resendBtn.disabled = false;
            resendBtn.textContent = '確認メールを再送信';
          }, 3000);
        };
      } else {
        loginError.textContent = 'メールアドレスまたはパスワードが正しくありません';
      }
      loginError.classList.remove('hidden');
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = signupForm.querySelector('button[type="submit"]');
    const email = document.getElementById('signupEmailInput').value;
    const password = document.getElementById('signupPasswordInput').value;

    if (!document.getElementById('agreeTermsSignup').checked) {
      signupError.textContent = '利用規約・プライバシーポリシーへの同意が必要です';
      signupError.classList.remove('hidden');
      return;
    }

    signupError.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = '作成中...';

    const { data, error } = await supabase.auth.signUp({ email, password });

    btn.disabled = false;
    btn.textContent = 'アカウントを作成';
    if (error) {
      let msg = error.message;
      if (msg === 'Failed to fetch' || (error.status && error.status >= 500)) {
        msg = 'サーバーエラーが発生しました。しばらくしてから再度お試しください。';
      } else if (msg.includes('Password should be at least') || msg.includes('password')) {
        msg = 'パスワードは6文字以上で入力してください。';
      }
      signupError.textContent = msg;
      signupError.classList.remove('hidden');
    } else if (!data.user || data.user.identities?.length === 0) {
      // userがnull または identitiesが空＝既存アカウント（メール確認済み・未確認どちらも）
      signupError.textContent = 'このメールアドレスはすでに登録されています。ログインしてください。';
      signupError.classList.remove('hidden');
    } else {
      showEmailSentPane(email);
    }
  });

  document.getElementById('resendEmailBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailSentAddress').textContent;
    const btn = document.getElementById('resendEmailBtn');
    btn.disabled = true;
    btn.textContent = '送信中...';
    await supabase.auth.resend({ type: 'signup', email });
    btn.textContent = '再送信しました';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '確認メールを再送信';
    }, 3000);
  });

  document.getElementById('backToLoginBtn').addEventListener('click', () => {
    document.getElementById('emailSentPane').classList.add('hidden');
    switchAuthTab('login');
  });

  document.getElementById('forgotPasswordLink').addEventListener('click', () => {
    document.getElementById('loginPane').classList.add('hidden');
    document.getElementById('forgotPane').classList.remove('hidden');
    document.getElementById('forgotError').classList.add('hidden');
    document.getElementById('forgotSuccess').classList.add('hidden');
    const btn = document.getElementById('forgotSubmitBtn');
    btn.style.display = '';
    btn.disabled = false;
    btn.textContent = 'リセットメールを送信';
  });

  document.getElementById('forgotSubmitBtn').addEventListener('click', async () => {
    const email = document.getElementById('forgotEmailInput').value.trim();
    const btn = document.getElementById('forgotSubmitBtn');
    const errorEl = document.getElementById('forgotError');
    const successEl = document.getElementById('forgotSuccess');
    if (!email) return;
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = '送信中...';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://extension.siteprinter.jp/reset-password/',
    });
    if (error) {
      errorEl.textContent = 'エラーが発生しました。しばらくしてから再試行してください。';
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'リセットメールを送信';
    } else {
      successEl.classList.remove('hidden');
      btn.style.display = 'none';
    }
  });

  document.getElementById('backToLoginFromForgotBtn').addEventListener('click', () => {
    document.getElementById('forgotPane').classList.add('hidden');
    switchAuthTab('login');
  });

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

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  deleteAccountBtn.addEventListener('click', async () => {
    const { userPlan } = await chrome.storage.local.get({ userPlan: 'free' });
    if (userPlan === 'pro') {
      showToast('Proプランを解約してからアカウントを削除してください');
      return;
    }

    const confirmed = window.confirm(
      'アカウントを削除しますか？\n\nこの操作は取り消せません。アカウント情報がすべて削除されます。'
    );
    if (!confirmed) return;

    deleteAccountBtn.disabled = true;
    deleteAccountBtn.textContent = '削除中...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('セッションが見つかりません');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'アカウントの削除に失敗しました');
      }

      await supabase.auth.signOut();
      showToast('アカウントを削除しました');
    } catch (err) {
      console.error('[DeleteAccount]', err);
      showToast('エラー: ' + (err.message || 'アカウントの削除に失敗しました'));
      deleteAccountBtn.disabled = false;
      deleteAccountBtn.textContent = 'アカウントを削除';
    }
  });

  // アップグレード（ユーザーIDとメールをStripeに渡して確実に紐づける）
  upgradeBtn.addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const baseUrl = import.meta.env.VITE_STRIPE_PAYMENT_LINK;
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

  // getUser()をtry-catchの外で実行し、catchブロックでも最新のapp_metadataを参照できるようにする
  let resolvedUser = user;
  try {
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (freshUser) resolvedUser = freshUser;
  } catch {
    // getUser失敗時はキャッシュのuserを使用
  }

  try {
    // grantを優先チェック（エラーはgrantなしとして扱い、throwしない）
    const { data: grantData } = await supabase
      .from('user_grants')
      .select('plan, expires_at')
      .eq('user_id', resolvedUser.id)
      .maybeSingle();

    const hasActiveGrant = grantData?.plan === 'pro' &&
      (!grantData.expires_at || new Date(grantData.expires_at) > new Date());

    if (hasActiveGrant) {
      planBadge.textContent = 'Pro';
      planBadge.className = 'plan-badge plan-pro';
      accountPlanBadge.textContent = 'Pro';
      accountPlanBadge.className = 'plan-badge plan-pro-card';
      upgradeBanner.classList.add('hidden');
      manageBtn.classList.add('hidden');
      guestBadgeRow.classList.remove('hidden');
      periodEndRow.classList.add('hidden');
      await chrome.storage.local.set({ userPlan: 'pro', userEmail: resolvedUser.email });
      return;
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, cancel_at_period_end, current_period_end')
      .eq('user_id', resolvedUser.id)
      .maybeSingle();

    if (error) throw error;

    // subscriptionsテーブル または app_metadata のどちらかでProと判定
    const isPro = data?.status === 'active' || resolvedUser.app_metadata?.plan === 'pro';

    planBadge.textContent = isPro ? 'Pro' : '無料';
    planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;
    accountPlanBadge.textContent = isPro ? 'Pro' : '無料';
    accountPlanBadge.className = `plan-badge ${isPro ? 'plan-pro-card' : 'plan-free-card'}`;

    upgradeBanner.classList.toggle('hidden', isPro);
    manageBtn.classList.toggle('hidden', !isPro);
    guestBadgeRow.classList.add('hidden');

    if (isPro && data?.cancel_at_period_end && data?.current_period_end) {
      const endDate = new Date(data.current_period_end);
      const formatted = `${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()} まで利用可能（解約予約済み）`;
      periodEndText.textContent = formatted;
      periodEndRow.classList.remove('hidden');
    } else {
      periodEndRow.classList.add('hidden');
    }

    await chrome.storage.local.set({ userPlan: isPro ? 'pro' : 'free', userEmail: resolvedUser.email });

  } catch (err) {
    console.error('[Plan] Failed to fetch plan info:', err);

    const isNetworkError = err?.message === 'Failed to fetch' || err?.message?.includes('fetch');
    if (isNetworkError) {
      // ネットワーク切断時はエラーを表示
      upgradeBanner.classList.add('hidden');
      manageBtn.classList.add('hidden');
      guestBadgeRow.classList.add('hidden');
      periodEndRow.classList.add('hidden');
      planBadge.textContent = '-';
      planBadge.className = 'plan-badge plan-free';
      accountPlanBadge.textContent = '-';
      accountPlanBadge.className = 'plan-badge plan-free-card';
      planFetchError.classList.remove('hidden');
    } else {
      // subscriptionsテーブルのエラー時はapp_metadataにフォールバック（resolvedUserを使用）
      const isPro = resolvedUser.app_metadata?.plan === 'pro';
      planBadge.textContent = isPro ? 'Pro' : '無料';
      planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;
      accountPlanBadge.textContent = isPro ? 'Pro' : '無料';
      accountPlanBadge.className = `plan-badge ${isPro ? 'plan-pro-card' : 'plan-free-card'}`;
      upgradeBanner.classList.toggle('hidden', isPro);
      manageBtn.classList.toggle('hidden', !isPro);
      guestBadgeRow.classList.add('hidden');
      periodEndRow.classList.add('hidden');
      await chrome.storage.local.set({ userPlan: isPro ? 'pro' : 'free', userEmail: resolvedUser.email });
    }
  }
}

function showAuthView() {
  mainView.classList.add('hidden');
  authView.classList.remove('hidden');
  switchAuthTab('login');

  planBadge.textContent = '無料';
  planBadge.className = 'plan-badge plan-free';
  chrome.storage.local.remove(['userPlan', 'userEmail']);

  deleteAccountBtn.disabled = false;
  deleteAccountBtn.textContent = 'アカウントを削除';
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
