import { supabase } from '../lib/supabase.js';
import { t, applyI18n, isJa } from '../lib/i18n.js';

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
applyI18n();

function showToast(message = t('toast_saved')) {
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
  const isEdge = chrome.runtime.id !== CHROME_EXTENSION_ID;

  // Review リンクを言語に応じて設定
  const reviewUrl = isEdge
    ? `https://microsoftedge.microsoft.com/addons/detail/${chrome.runtime.id}`
    : 'https://chromewebstore.google.com/detail/dcmapjdkohckbpddkgedhcjldhbcomij/reviews';
  const reviewText = isJa
    ? `SitePrinter を気に入っていただけましたら、<a id="reviewLink" href="${reviewUrl}" target="_blank" class="review-link">レビューを書いていただけると嬉しいです ↗</a>`
    : `Enjoying SitePrinter? <a id="reviewLink" href="${reviewUrl}" target="_blank" class="review-link">Please leave a review ↗</a>`;
  document.getElementById('reviewRequestText').innerHTML = reviewText;

  // Site footer
  document.getElementById('siteFooter').innerHTML = t('footer_terms_html');

  const { version } = chrome.runtime.getManifest();
  document.getElementById('versionLabel').textContent = `v${version}`;

  // キャッシュからプランバッジを即時反映（Supabase取得前のちらつき防止）
  const { userPlan } = await chrome.storage.local.get({ userPlan: null });
  if (userPlan) {
    planBadge.textContent = userPlan === 'pro' ? 'Pro' : t('plan_free');
    planBadge.className = `plan-badge ${userPlan === 'pro' ? 'plan-pro' : 'plan-free'}`;
  }

  await loadImageFormatSetting();
  await loadForceReloadSetting();
  await loadContextMenuSetting();
  await loadSaveLastSettingsSetting();

  document.querySelectorAll('input[name="imageFormat"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      await chrome.storage.local.set({ imageFormat: radio.value });
      showToast(t('toast_image_format'));
    });
  });

  const forceReloadToggle = document.getElementById('forceReloadToggle');
  forceReloadToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ forceReload: forceReloadToggle.checked });
    showToast(t(forceReloadToggle.checked ? 'toast_force_reload_on' : 'toast_force_reload_off'));
  });

  const contextMenuToggle = document.getElementById('contextMenuToggle');
  contextMenuToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ contextMenuEnabled: contextMenuToggle.checked });
    showToast(t(contextMenuToggle.checked ? 'toast_context_menu_on' : 'toast_context_menu_off'));
  });

  const saveLastSettingsToggle = document.getElementById('saveLastSettingsToggle');
  saveLastSettingsToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ saveLastSettings: saveLastSettingsToggle.checked });
    if (!saveLastSettingsToggle.checked) {
      await chrome.storage.local.remove('savedPreviewSettings');
    }
    showToast(t(saveLastSettingsToggle.checked ? 'toast_save_settings_on' : 'toast_save_settings_off'));
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
      loginError.textContent = t('agree_required');
      loginError.classList.remove('hidden');
      return;
    }
    loginError.classList.add('hidden');
    const btn = document.getElementById('googleLoginBtn');
    btn.disabled = true;
    btn.textContent = t('authenticating');
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Google login failed:', err);
      loginError.textContent = err.message || t('google_login_btn');
      loginError.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>${t('google_login_btn')}`;
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
    btn.textContent = t('logging_in');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = t('login_btn');
    if (error) {
      if (error.message === 'Email not confirmed') {
        loginError.textContent = t('email_not_confirmed');
        resendBtn.classList.remove('hidden');
        resendBtn.onclick = async () => {
          resendBtn.disabled = true;
          resendBtn.textContent = t('sending');
          await supabase.auth.resend({ type: 'signup', email });
          resendBtn.textContent = t('resent');
          setTimeout(() => {
            resendBtn.disabled = false;
            resendBtn.textContent = t('resend_confirm');
          }, 3000);
        };
      } else {
        loginError.textContent = t('login_failed');
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
      signupError.textContent = t('agree_required');
      signupError.classList.remove('hidden');
      return;
    }

    signupError.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = t('creating_account');

    const { data, error } = await supabase.auth.signUp({ email, password });

    btn.disabled = false;
    btn.textContent = t('create_account_btn');
    if (error) {
      let msg = error.message;
      if (msg === 'Failed to fetch' || (error.status && error.status >= 500)) {
        msg = t('server_error');
      } else if (msg.includes('Password should be at least') || msg.includes('password')) {
        msg = t('pw_min_length');
      }
      signupError.textContent = msg;
      signupError.classList.remove('hidden');
    } else if (!data.user || data.user.identities?.length === 0) {
      signupError.textContent = t('email_already_registered');
      signupError.classList.remove('hidden');
    } else {
      showEmailSentPane(email);
    }
  });

  document.getElementById('resendEmailBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailSentAddress').textContent;
    const btn = document.getElementById('resendEmailBtn');
    btn.disabled = true;
    btn.textContent = t('sending');
    await supabase.auth.resend({ type: 'signup', email });
    btn.textContent = t('resent');
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = t('resend_confirm');
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
    btn.textContent = t('send_reset_btn');
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
    btn.textContent = t('sending');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://extension.siteprinter.jp/reset-password/',
    });
    if (error) {
      errorEl.textContent = t('reset_error');
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = t('send_reset_btn');
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
    manageBtn.textContent = t('manage_loading');
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
      showToast(t('toast_error') + err.message);
    } finally {
      manageBtn.disabled = false;
      manageBtn.textContent = t('manage_subscription');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  deleteAccountBtn.addEventListener('click', async () => {
    const { userPlan } = await chrome.storage.local.get({ userPlan: 'free' });
    if (userPlan === 'pro') {
      showToast(t('toast_cancel_pro_first'));
      return;
    }

    const confirmed = window.confirm(t('confirm_delete_account'));
    if (!confirmed) return;

    deleteAccountBtn.disabled = true;
    deleteAccountBtn.textContent = t('deleting');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('session_not_found'));

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
        throw new Error(err.error || t('delete_account_failed'));
      }

      await supabase.auth.signOut();
      showToast(t('toast_account_deleted'));
    } catch (err) {
      console.error('[DeleteAccount]', err);
      showToast(t('error_prefix') + (err.message || t('delete_account_failed')));
      deleteAccountBtn.disabled = false;
      deleteAccountBtn.textContent = t('delete_account');
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

  const isGoogleUser = user.app_metadata?.provider === 'google'
    || user.identities?.some((i) => i.provider === 'google');

  if (!isGoogleUser) {
    document.getElementById('emailPasswordSettings').classList.remove('hidden');
    initEmailChange();
    initPasswordChange();
  }
}

function initEmailChange() {
  document.getElementById('changeEmailBtn').addEventListener('click', async () => {
    const newEmail = document.getElementById('newEmailInput').value.trim();
    const msg = document.getElementById('changeEmailMsg');
    if (!newEmail) return;

    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      msg.textContent = `${t('error_prefix')}${error.message}`;
      msg.className = 'form-error';
    } else {
      msg.textContent = newEmail + t('change_email_confirm_html');
      msg.className = 'form-success';
      document.getElementById('newEmailInput').value = '';
    }
    msg.classList.remove('hidden');
  });
}

function initPasswordChange() {
  document.getElementById('changePasswordBtn').addEventListener('click', async () => {
    const newPw = document.getElementById('newPasswordInput').value;
    const confirmPw = document.getElementById('confirmPasswordInput').value;
    const msg = document.getElementById('changePasswordMsg');

    if (newPw.length < 6) {
      msg.textContent = t('pw_min_length');
      msg.className = 'form-error';
      msg.classList.remove('hidden');
      return;
    }
    if (newPw !== confirmPw) {
      msg.textContent = t('pw_mismatch');
      msg.className = 'form-error';
      msg.classList.remove('hidden');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) {
      msg.textContent = `${t('error_prefix')}${error.message}`;
      msg.className = 'form-error';
    } else {
      msg.textContent = t('pw_changed');
      msg.className = 'form-success';
      document.getElementById('newPasswordInput').value = '';
      document.getElementById('confirmPasswordInput').value = '';
    }
    msg.classList.remove('hidden');
  });
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

    planBadge.textContent = isPro ? 'Pro' : t('plan_free');
    planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;
    accountPlanBadge.textContent = isPro ? 'Pro' : t('plan_free');
    accountPlanBadge.className = `plan-badge ${isPro ? 'plan-pro-card' : 'plan-free-card'}`;

    upgradeBanner.classList.toggle('hidden', isPro);
    manageBtn.classList.toggle('hidden', !isPro);
    guestBadgeRow.classList.add('hidden');

    if (isPro && data?.cancel_at_period_end && data?.current_period_end) {
      const endDate = new Date(data.current_period_end);
      const dateStr = `${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()}`;
      const formatted = t('subscription_active_until').replace('{date}', dateStr);
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
      planBadge.textContent = isPro ? 'Pro' : t('plan_free');
      planBadge.className = `plan-badge ${isPro ? 'plan-pro' : 'plan-free'}`;
      accountPlanBadge.textContent = isPro ? 'Pro' : t('plan_free');
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

  planBadge.textContent = t('plan_free');
  planBadge.className = 'plan-badge plan-free';
  chrome.storage.local.remove(['userPlan', 'userEmail']);

  deleteAccountBtn.disabled = false;
  deleteAccountBtn.textContent = t('delete_account');
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
          reject(new Error(t('auth_cancelled')));
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
