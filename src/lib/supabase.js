import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: {
      getItem: (key) => chrome.storage.local.get(key).then((r) => r[key] ?? null),
      setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
      removeItem: (key) => chrome.storage.local.remove(key),
    },
  },
});
