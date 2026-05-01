import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ローカル開発用のモッククライアント
const createMockSupabaseClient = () => {
  let mockUser = null;
  let mockSession = null;

  return {
    auth: {
      getSession: async () => {
        return { data: { session: mockSession }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        // モックログイン成功
        mockUser = { id: 'mock-user-id', email };
        mockSession = { user: mockUser, access_token: 'mock-token' };
        return { data: { user: mockUser, session: mockSession }, error: null };
      },
      signUp: async ({ email, password }) => {
        // モックサインアップ成功
        return { data: { user: null, session: null }, error: null };
      },
      signOut: async () => {
        mockUser = null;
        mockSession = null;
        return { error: null };
      },
      onAuthStateChange: (callback) => {
        // 初回呼び出し
        setTimeout(() => callback('SIGNED_IN', mockSession), 0);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            // モックプラン情報（Proプラン）
            return { data: { status: 'active' }, error: null };
          },
        }),
      }),
    }),
  };
};

// ダミー値の場合はモッククライアントを使用
const isDummyConfig = !supabaseUrl || supabaseUrl.includes('dummy') || !supabaseAnonKey || supabaseAnonKey.includes('dummy');

export const supabase = isDummyConfig
  ? createMockSupabaseClient()
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: {
          getItem: (key) => chrome.storage.local.get(key).then((r) => r[key] ?? null),
          setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
          removeItem: (key) => chrome.storage.local.remove(key),
        },
      },
    });
