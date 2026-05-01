import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

document.getElementById('notifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('notifyBtn');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');
  const email = document.getElementById('notifyEmail').value;

  btn.disabled = true;
  btn.textContent = '送信中...';
  errorMsg.classList.remove('show');

  const { error } = await supabase
    .from('waitlist')
    .insert({ email });

  if (error) {
    if (error.code === '23505') {
      // unique constraint: すでに登録済み
      successMsg.classList.add('show');
    } else {
      errorMsg.textContent = '送信に失敗しました。しばらく経ってからお試しください。';
      errorMsg.classList.add('show');
      btn.disabled = false;
      btn.textContent = '通知を受け取る';
    }
  } else {
    successMsg.classList.add('show');
    document.getElementById('notifyForm').reset();
  }
});
