import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

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
    }

    console.log('Subscription canceled for customer:', customerId);
  }

  return new Response('ok', { status: 200 });
});
