const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const STORAGE_KEY = `sb-${projectRef}-auth-token`;

async function autoLogin() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  const expires_in = parseInt(params.get('expires_in') || '3600');
  const token_type = params.get('token_type') || 'bearer';

  if (!access_token || !refresh_token) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${access_token}`,
      },
    });
    if (!res.ok) return;
    const user = await res.json();

    const expires_at = Math.floor(Date.now() / 1000) + expires_in;
    const session = { access_token, token_type, expires_in, expires_at, refresh_token, user };
    await chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(session) });

    showLoginComplete();
  } catch {
    // 拡張機能未インストールや通信エラーは無視
  }
}

function showLoginComplete() {
  const statusEl = document.getElementById('autoLoginStatus');
  const openBtn = document.getElementById('openExtensionBtn');

  if (statusEl) {
    statusEl.style.display = 'block';
  }
  if (openBtn) {
    openBtn.style.display = 'inline-block';
    openBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
    });
  }
}

autoLogin();
