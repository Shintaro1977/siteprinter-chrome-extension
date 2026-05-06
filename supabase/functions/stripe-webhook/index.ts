import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'siteprinter.jp@gmail.com';

async function sendEmail(to: string | string[], subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SitePrinter <support@siteprinter.jp>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Resend error:', res.status, text);
  }
}

const sendAdminEmail = (subject: string, html: string) => sendEmail(ADMIN_EMAIL, subject, html);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Webhook Error', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    const clientReferenceId = session.client_reference_id;
    const email = session.customer_details?.email;

    let user;
    if (clientReferenceId) {
      const { data, error } = await supabase.auth.admin.getUserById(clientReferenceId);
      if (error) {
        console.error('Failed to get user by id:', error);
        return new Response('Server Error', { status: 500 });
      }
      user = data.user;
    } else if (email) {
      const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
      if (userError) {
        console.error('Failed to list users:', userError);
        return new Response('Server Error', { status: 500 });
      }
      user = users.find((u) => u.email === email);
    }

    if (!user) {
      console.error('User not found. client_reference_id:', clientReferenceId, 'email:', email);
      return new Response('User not found', { status: 404 });
    }

    // サブスクリプション詳細を取得して period_end を保存
    let currentPeriodEnd: string | null = null;
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
    }

    const { error } = await supabase.from('subscriptions').upsert({
      user_id: user.id,
      status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      cancel_at_period_end: false,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) {
      console.error('Failed to upsert subscription:', error);
      return new Response('Server Error', { status: 500 });
    }

    // grantユーザーはapp_metadataを上書きしない
    const { data: grant } = await supabase
      .from('user_grants')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!grant) {
      await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { plan: 'pro' },
      });
    }

    console.log('Subscription activated for:', email);

    const jst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    await Promise.all([
      sendAdminEmail(
        '新規Proユーザー登録',
        `<p>新しいProプランユーザーが登録されました。</p>
         <ul>
           <li>メールアドレス: ${email ?? '不明'}</li>
           <li>登録日時: ${jst}</li>
         </ul>`,
      ),
      email && sendEmail(
        email,
        'SitePrinter Pro へようこそ',
        `<p>${user.email} 様</p>
         <p>SitePrinter Pro プランへのご登録ありがとうございます。</p>
         <p>これより全機能をご利用いただけます。</p>
         <p>ご不明な点がございましたら、このメールにご返信ください。</p>
         <br>
         <p>SitePrinter サポートチーム</p>`,
      ),
    ]);
  }

  // 解約予約（期間終了時に解約）
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    // cancel_at_period_end または cancel_at（特定日時解約）のどちらでも解約予約と判定
    const isCancelScheduled = subscription.cancel_at_period_end || subscription.cancel_at != null;

    // 終了日：cancel_at があればそれを優先、なければ current_period_end を使用
    const endTimestamp = subscription.cancel_at ?? subscription.current_period_end;
    const currentPeriodEnd = endTimestamp
      ? new Date(endTimestamp * 1000).toISOString()
      : null;

    const { error } = await supabase
      .from('subscriptions')
      .update({
        cancel_at_period_end: isCancelScheduled,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_customer_id', customerId);

    if (error) {
      console.error('Failed to update subscription:', error);
      return new Response('Server Error', { status: 500 });
    }

    // 解約予約が新たに設定されたときだけメール送信
    const prevAttrs = (event.data as any).previous_attributes ?? {};
    const cancelJustScheduled = isCancelScheduled && (
      ('cancel_at_period_end' in prevAttrs && prevAttrs.cancel_at_period_end === false) ||
      ('cancel_at' in prevAttrs && prevAttrs.cancel_at === null)
    );

    if (cancelJustScheduled) {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (subData?.user_id) {
        const { data: userData } = await supabase.auth.admin.getUserById(subData.user_id);
        const userEmail = userData?.user?.email;
        if (userEmail && currentPeriodEnd) {
          const endDateJST = new Date(currentPeriodEnd).toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          await sendEmail(
            userEmail,
            'SitePrinter Pro 解約予約のお知らせ',
            `<p>${userEmail} 様</p>
             <p>SitePrinter Pro プランの解約予約を受け付けました。</p>
             <p><strong>${endDateJST}</strong> までは引き続き全機能をご利用いただけます。</p>
             <p>解約をキャンセルしたい場合は、設定画面からお手続きください。</p>
             <br>
             <p>SitePrinter サポートチーム</p>`,
          );
        }
      }
    }

    console.log('Subscription updated for customer:', customerId, 'isCancelScheduled:', isCancelScheduled, 'cancel_at:', subscription.cancel_at);
  }

  // 解約完了
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const { data: subData, error: subFetchError } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'canceled', cancel_at_period_end: false, updated_at: new Date().toISOString() })
      .eq('stripe_customer_id', customerId);

    if (error) {
      console.error('Failed to cancel subscription:', error);
      return new Response('Server Error', { status: 500 });
    }

    if (!subFetchError && subData?.user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(subData.user_id);
      const userEmail = userData?.user?.email;

      // grantユーザーはapp_metadataを上書きしない
      const { data: grant } = await supabase
        .from('user_grants')
        .select('id')
        .eq('user_id', subData.user_id)
        .single();

      if (!grant) {
        await supabase.auth.admin.updateUserById(subData.user_id, {
          app_metadata: { plan: 'free' },
        });
      }

      const jst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      await Promise.all([
        sendAdminEmail(
          'Proユーザー解約',
          `<p>Proプランユーザーが解約しました。</p>
           <ul>
             <li>メールアドレス: ${userEmail ?? '不明'}</li>
             <li>解約日時: ${jst}</li>
           </ul>`,
        ),
        userEmail && sendEmail(
          userEmail,
          'SitePrinter Pro サブスクリプション解約のお知らせ',
          `<p>${userEmail} 様</p>
           <p>SitePrinter Pro プランのサブスクリプションが解約されました。</p>
           <p>ご利用期間中ありがとうございました。</p>
           <p>今後ともご利用をご検討いただければ幸いです。</p>
           <br>
           <p>SitePrinter サポートチーム</p>`,
        ),
      ]);
    }

    console.log('Subscription canceled for customer:', customerId);
  }

  // 決済失敗
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const customerEmail = invoice.customer_email;
    const nextAttempt = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toLocaleString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

    if (customerEmail) {
      await sendEmail(
        customerEmail,
        'SitePrinter Pro お支払いに失敗しました',
        `<p>${customerEmail} 様</p>
         <p>SitePrinter Pro プランのお支払い処理に失敗しました。</p>
         <p>クレジットカードの有効期限切れや残高不足が考えられます。</p>
         ${nextAttempt ? `<p>次回の自動再試行日: <strong>${nextAttempt}</strong></p>` : ''}
         <p>お支払い情報の更新は Stripe のカスタマーポータルよりお願いします。</p>
         <p>解決しない場合は support@siteprinter.jp までお問い合わせください。</p>
         <br>
         <p>SitePrinter サポートチーム</p>`,
      );
      console.log('Payment failed email sent to:', customerEmail);
    }
  }

  return new Response('ok', { status: 200 });
});
