Deno.serve(async (req) => {
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  const email = payload.record?.email ?? '不明';
  const createdAt = payload.record?.created_at
    ? new Date(payload.record.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    : '不明';

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'siteprinter.jp@gmail.com';

  if (!apiKey) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return new Response('ok', { status: 200 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SitePrinter extension <support@siteprinter.jp>',
      to: [adminEmail],
      subject: '新規ユーザー登録',
      html: `<p>新しいユーザーが登録されました。</p>
             <ul>
               <li>メールアドレス: ${email}</li>
               <li>登録日時: ${createdAt}</li>
             </ul>`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Resend error:', res.status, text);
  } else {
    console.log('New user notification sent for:', email);
  }

  return new Response('ok', { status: 200 });
});
