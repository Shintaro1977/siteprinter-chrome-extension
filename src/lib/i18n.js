export const isJa = navigator.language.startsWith('ja');

const STRINGS = {
  // ── Common ──────────────────────────────────────────────────────────────────
  plan_free:   { ja: '無料',  en: 'Free' },
  plan_pro:    { ja: 'Pro',   en: 'Pro' },
  terms:       { ja: '利用規約',         en: 'Terms of Service' },
  privacy:     { ja: 'プライバシーポリシー', en: 'Privacy Policy' },
  contact:     { ja: 'お問い合わせ',     en: 'Contact' },
  cancel:      { ja: 'キャンセル',       en: 'Cancel' },
  retry:       { ja: '再試行',           en: 'Retry' },
  error_prefix:{ ja: 'エラー: ',         en: 'Error: ' },

  // ── Popup ───────────────────────────────────────────────────────────────────
  capture_target:       { ja: 'キャプチャ対象',           en: 'Capture Target' },
  current_tab:          { ja: '現在のタブ',               en: 'Current Tab' },
  multiple_tabs:        { ja: '複数タブを選択',           en: 'Select Multiple Tabs' },
  loading_tabs:         { ja: 'タブを読み込み中...',      en: 'Loading tabs...' },
  tabs_load_failed:     { ja: 'タブの読み込みに失敗しました', en: 'Failed to load tabs' },
  no_capturable_tabs:   { ja: 'キャプチャ可能なタブがありません', en: 'No capturable tabs found' },
  capture_btn:          { ja: 'スクリーンショットを取得', en: 'Capture Screenshot' },
  capturing_loading:    { ja: 'スクリーンショットを取得中...', en: 'Capturing screenshot...' },
  select_tabs_alert:    { ja: 'キャプチャするタブを選択してください', en: 'Please select tabs to capture' },
  settings_title_attr:  { ja: '設定', en: 'Settings' },

  // ── Options ─────────────────────────────────────────────────────────────────
  page_title_options:   { ja: 'SitePrinter 設定',        en: 'SitePrinter Settings' },
  pdf_settings:         { ja: 'PDF設定',                 en: 'PDF Settings' },
  image_format:         { ja: '画像形式',                en: 'Image Format' },
  jpeg_label:           { ja: 'JPEG（軽量）',            en: 'JPEG (Lightweight)' },
  png_label:            { ja: 'PNG（高画質）',           en: 'PNG (High Quality)' },
  png_note:             { ja: '長いページではエラーになる場合があります', en: 'May fail on very long pages' },
  force_reload_label:   { ja: '再読込取得',              en: 'Reload & Capture' },
  force_reload_desc:    { ja: 'スクリーンショット取得前にページを再読み込みします。\n一時的な表示変更を排除し、取得時点のページ状態をより正確に反映します。', en: 'Reloads the page before capturing.\nRemoves temporary display changes for a more accurate snapshot.' },
  force_reload_note:    { ja: 'ONにするとフッターに「再読込取得」と表示されます。', en: 'When ON, "Reload" is shown in the footer.' },
  context_menu_label:   { ja: '右クリックメニューに追加', en: 'Add to Right-Click Menu' },
  context_menu_desc:    { ja: 'ページ上で右クリックしたときに「印刷用PDFを作成」を表示します。', en: 'Shows "Create PDF" when right-clicking on a page.' },
  save_settings_label:  { ja: '前回の設定を保存する',   en: 'Save Last Settings' },
  save_settings_desc:   { ja: 'PDFダウンロード時の設定（用紙サイズ・列数・重複エリアなど）を保存し、次回に引き継ぎます。', en: 'Saves PDF settings (paper size, columns, overlap, etc.) for next use.' },
  account_info:         { ja: 'アカウント情報',          en: 'Account Info' },
  refresh_plan:         { ja: 'プラン情報を更新',        en: 'Refresh Plan' },
  email_label:          { ja: 'メールアドレス',          en: 'Email Address' },
  plan_label:           { ja: 'プラン',                  en: 'Plan' },
  period_end_label:     { ja: '利用期限',                en: 'Expiry Date' },
  plan_fetch_error:     { ja: 'プラン情報を取得できませんでした。接続を確認してください。', en: 'Failed to fetch plan info. Check your connection.' },
  upgrade_banner_title: { ja: 'Proプランにアップグレード', en: 'Upgrade to Pro' },
  upgrade_banner_desc:  { ja: 'A3対応・複数列レイアウト・ヘッダー／フッター付き出力などの機能が利用できます', en: 'Unlocks A3/Letter/Legal sizes, multi-column layout, header/footer output and more.' },
  upgrade_btn:          { ja: 'アップグレード',          en: 'Upgrade' },
  guest_pro_badge:      { ja: 'ゲストアカウントとしてProプランを利用中', en: 'Using Pro plan as a guest' },
  manage_subscription:  { ja: 'サブスクリプションを管理', en: 'Manage Subscription' },
  logout:               { ja: 'ログアウト',              en: 'Log Out' },
  delete_account:       { ja: 'アカウントを削除',        en: 'Delete Account' },
  account_settings:     { ja: 'アカウント設定',          en: 'Account Settings' },
  change_email_label:   { ja: 'メールアドレスの変更',   en: 'Change Email' },
  new_email_placeholder:{ ja: '新しいメールアドレス',   en: 'New email address' },
  send_confirm_email:   { ja: '確認メールを送信',        en: 'Send Confirmation Email' },
  change_password_label:{ ja: 'パスワードの変更',       en: 'Change Password' },
  new_pw_placeholder:   { ja: '新しいパスワード（6文字以上）', en: 'New password (6+ characters)' },
  confirm_pw_placeholder:{ ja: 'パスワード（確認）',    en: 'Confirm password' },
  change_pw_btn:        { ja: 'パスワードを変更',       en: 'Change Password' },
  account_section:      { ja: 'アカウント',              en: 'Account' },
  pro_login_required:   { ja: 'Proプランへのアップグレードにはログインが必要です。', en: 'Log in to upgrade to the Pro plan.' },
  agree_terms_google_html: {
    ja: '<a href="https://extension.siteprinter.jp/terms/" target="_blank">利用規約</a>・<a href="https://extension.siteprinter.jp/privacy/" target="_blank">プライバシーポリシー</a>に同意して続ける',
    en: 'Continue and agree to the <a href="https://extension.siteprinter.jp/terms/" target="_blank">Terms</a> &amp; <a href="https://extension.siteprinter.jp/privacy/" target="_blank">Privacy Policy</a>',
  },
  google_login_btn:     { ja: 'Googleでログイン / 登録', en: 'Sign in / Sign up with Google' },
  or_divider:           { ja: 'または',                  en: 'or' },
  login_tab:            { ja: 'ログイン',                en: 'Log In' },
  signup_tab:           { ja: 'アカウント作成',          en: 'Sign Up' },
  email_form_label:     { ja: 'メールアドレス',          en: 'Email Address' },
  password_form_label:  { ja: 'パスワード',              en: 'Password' },
  password_placeholder: { ja: 'パスワードを入力',        en: 'Enter password' },
  login_btn:            { ja: 'ログイン',                en: 'Log In' },
  resend_confirm:       { ja: '確認メールを再送信',      en: 'Resend Confirmation Email' },
  forgot_password_link: { ja: 'パスワードを忘れた場合', en: 'Forgot password?' },
  signup_pw_placeholder:{ ja: '6文字以上のパスワード',  en: 'Password (6+ characters)' },
  agree_terms_signup_html: {
    ja: '<a href="https://extension.siteprinter.jp/terms/" target="_blank">利用規約</a>・<a href="https://extension.siteprinter.jp/privacy/" target="_blank">プライバシーポリシー</a>に同意します',
    en: 'I agree to the <a href="https://extension.siteprinter.jp/terms/" target="_blank">Terms</a> &amp; <a href="https://extension.siteprinter.jp/privacy/" target="_blank">Privacy Policy</a>',
  },
  create_account_btn:   { ja: 'アカウントを作成',       en: 'Create Account' },
  reset_pw_title:       { ja: 'パスワードをリセット',   en: 'Reset Password' },
  reset_pw_desc:        { ja: '登録済みのメールアドレスを入力してください。パスワードリセット用のリンクを送信します。', en: 'Enter your registered email. We\'ll send you a password reset link.' },
  send_reset_btn:       { ja: 'リセットメールを送信',   en: 'Send Reset Email' },
  forgot_success_msg:   { ja: 'パスワードリセットメールを送信しました。メール内のリンクをクリックしてください。', en: 'Password reset email sent. Click the link in the email.' },
  back_to_login:        { ja: 'ログイン画面に戻る',     en: 'Back to Login' },
  email_sent_title:     { ja: '確認メールを送信しました', en: 'Confirmation Email Sent' },
  email_sent_desc:      { ja: 'メール内のリンクをクリックして、アカウントを有効化してください。', en: 'Click the link in the email to activate your account.' },
  review_request_html:  {
    ja: 'SitePrinter を気に入っていただけましたら、<a id="reviewLink" href="https://chromewebstore.google.com/detail/dcmapjdkohckbpddkgedhcjldhbcomij/reviews" target="_blank" class="review-link">レビューを書いていただけると嬉しいです ↗</a>',
    en: 'Enjoying SitePrinter? <a id="reviewLink" href="https://chromewebstore.google.com/detail/dcmapjdkohckbpddkgedhcjldhbcomij/reviews" target="_blank" class="review-link">Please leave a review ↗</a>',
  },
  footer_terms_html: {
    ja: '<a href="https://extension.siteprinter.jp" target="_blank" class="site-footer-link">extension.siteprinter.jp</a><span class="site-footer-sep">·</span><a href="https://extension.siteprinter.jp/terms/" target="_blank" class="site-footer-link">利用規約</a><span class="site-footer-sep">·</span><a href="https://extension.siteprinter.jp/privacy/" target="_blank" class="site-footer-link">プライバシーポリシー</a><span class="site-footer-sep">·</span><a href="https://extension.siteprinter.jp/contact/" target="_blank" class="site-footer-link">お問い合わせ</a>',
    en: '<a href="https://extension.siteprinter.jp" target="_blank" class="site-footer-link">extension.siteprinter.jp</a><span class="site-footer-sep">·</span><a href="https://extension.siteprinter.jp/terms/" target="_blank" class="site-footer-link">Terms</a><span class="site-footer-sep">·</span><a href="https://extension.siteprinter.jp/privacy/" target="_blank" class="site-footer-link">Privacy</a><span class="site-footer-sep">·</span><a href="https://extension.siteprinter.jp/contact/" target="_blank" class="site-footer-link">Contact</a>',
  },

  // ── toast messages (options.js) ──────────────────────────────────────────────
  toast_saved:              { ja: '設定を保存しました',          en: 'Settings saved' },
  toast_image_format:       { ja: '画像形式を保存しました',      en: 'Image format saved' },
  toast_force_reload_on:    { ja: '再読込取得をONにしました',    en: 'Reload & Capture enabled' },
  toast_force_reload_off:   { ja: '再読込取得をOFFにしました',   en: 'Reload & Capture disabled' },
  toast_context_menu_on:    { ja: '右クリックメニューをONにしました',  en: 'Right-click menu enabled' },
  toast_context_menu_off:   { ja: '右クリックメニューをOFFにしました', en: 'Right-click menu disabled' },
  toast_save_settings_on:   { ja: '設定の保存をONにしました',   en: 'Save settings enabled' },
  toast_save_settings_off:  { ja: '設定の保存をOFFにしました',  en: 'Save settings disabled' },
  toast_account_deleted:    { ja: 'アカウントを削除しました',   en: 'Account deleted' },
  toast_error:              { ja: 'エラーが発生しました: ',      en: 'An error occurred: ' },
  toast_cancel_pro_first:   { ja: 'Proプランを解約してからアカウントを削除してください', en: 'Please cancel your Pro plan before deleting your account' },
  confirm_delete_account:   { ja: 'アカウントを削除しますか？\n\nこの操作は取り消せません。アカウント情報がすべて削除されます。', en: 'Delete your account?\n\nThis action cannot be undone. All account data will be deleted.' },
  agree_required:           { ja: '利用規約・プライバシーポリシーへの同意が必要です', en: 'You must agree to the Terms and Privacy Policy' },
  authenticating:           { ja: '認証中...',            en: 'Authenticating...' },
  logging_in:               { ja: 'ログイン中...',        en: 'Logging in...' },
  login_failed:             { ja: 'メールアドレスまたはパスワードが正しくありません', en: 'Incorrect email or password' },
  email_not_confirmed:      { ja: 'メールアドレスの確認が完了していません。受信ボックスをご確認ください。', en: 'Email not confirmed. Please check your inbox.' },
  creating_account:         { ja: '作成中...',            en: 'Creating...' },
  pw_min_length:            { ja: 'パスワードは6文字以上で入力してください。', en: 'Password must be at least 6 characters.' },
  email_already_registered: { ja: 'このメールアドレスはすでに登録されています。ログインしてください。', en: 'This email is already registered. Please log in.' },
  server_error:             { ja: 'サーバーエラーが発生しました。しばらくしてから再度お試しください。', en: 'A server error occurred. Please try again later.' },
  sending:                  { ja: '送信中...',            en: 'Sending...' },
  resent:                   { ja: '再送信しました',       en: 'Resent' },
  reset_error:              { ja: 'エラーが発生しました。しばらくしてから再試行してください。', en: 'An error occurred. Please try again later.' },
  loading:                  { ja: '読み込み中...',        en: 'Loading...' },
  deleting:                 { ja: '削除中...',            en: 'Deleting...' },
  session_not_found:        { ja: 'セッションが見つかりません', en: 'Session not found' },
  delete_account_failed:    { ja: 'アカウントの削除に失敗しました', en: 'Failed to delete account' },
  change_email_confirm_html:{ ja: ' に確認メールを送信しました。メール内のリンクをクリックして変更を完了してください。', en: ' - confirmation email sent. Click the link to complete the change.' },
  pw_mismatch:              { ja: 'パスワードが一致しません。', en: 'Passwords do not match.' },
  pw_changed:               { ja: 'パスワードを変更しました', en: 'Password changed' },
  manage_loading:           { ja: '読み込み中...', en: 'Loading...' },

  // ── Preview ─────────────────────────────────────────────────────────────────
  page_title_preview:   { ja: 'SitePrinter - プレビュー', en: 'SitePrinter - Preview' },
  download_pdf:         { ja: 'PDFをダウンロード',        en: 'Download PDF' },
  preview_label:        { ja: 'プレビュー',               en: 'Preview' },
  settings_panel_title: { ja: '設定',                     en: 'Settings' },
  layout_section:       { ja: 'レイアウト',               en: 'Layout' },
  paper_size_label:     { ja: '用紙サイズ',               en: 'Paper Size' },
  columns_label:        { ja: '列数',                     en: 'Columns' },
  col_1:                { ja: '1列',  en: '1 col' },
  col_2:                { ja: '2列',  en: '2 cols' },
  col_3:                { ja: '3列',  en: '3 cols' },
  col_4:                { ja: '4列',  en: '4 cols' },
  overlap_label:        { ja: '重複エリア',               en: 'Overlap Area' },
  overlap_small:        { ja: '小',   en: 'S' },
  overlap_medium:       { ja: '中',   en: 'M' },
  overlap_large:        { ja: '大',   en: 'L' },
  overlap_desc:         { ja: 'セクション間の重なり量（2% / 5% / 8%）', en: 'Overlap between sections (2% / 5% / 8%)' },
  show_border:          { ja: '境界線を表示',             en: 'Show Border' },
  header_footer_section:{ ja: 'ヘッダー・フッター',       en: 'Header / Footer' },
  show_header:          { ja: 'ヘッダーを表示',           en: 'Show Header' },
  header_desc:          { ja: 'ページタイトルとURLを表示', en: 'Displays page title and URL' },
  show_footer:          { ja: 'フッターを表示',           en: 'Show Footer' },
  footer_desc:          { ja: '日時・ページ番号・ロゴを表示', en: 'Displays date, page number and logo' },
  screenshots_section:  { ja: 'スクリーンショット',       en: 'Screenshots' },
  image_format_label:   { ja: '画像形式',                 en: 'Image Format' },
  image_format_hint:    { ja: '画像形式はオプションから変更できます', en: 'Image format can be changed in Options' },
  preview_note:         { ja: 'プレビューと実際のPDFは完全に同一ではない場合があります', en: 'Preview may not exactly match the final PDF' },
  pro_required_title:   { ja: 'Pro機能が必要です',        en: 'Pro Plan Required' },
  pro_required_desc:    { ja: 'カスタム設定を使用したPDF生成はProプランでご利用いただけます。', en: 'Custom PDF settings are available in the Pro plan.' },
  feature_columns:      { ja: '自由な列数設定（2〜4列）', en: 'Custom column layout (2–4 columns)' },
  feature_header_footer:{ ja: 'ヘッダー・フッターのカスタマイズ', en: 'Header / footer customization' },
  feature_a3:           { ja: 'A3用紙サイズ対応',         en: 'A3 / Letter / Legal paper sizes' },
  upgrade_pro_btn:      { ja: 'Proプランにアップグレード', en: 'Upgrade to Pro' },
  after_upgrade_msg:    { ja: 'アップグレードが完了したら、この画面を再読み込みするとPDFを作成できます。', en: 'After upgrading, reload this page to create your PDF.' },
  reload_and_create:    { ja: '再読み込みしてPDFを作成', en: 'Reload & Create PDF' },
  generating_pdf:       { ja: 'PDFを生成中...',           en: 'Generating PDF...' },
  no_screenshots:       { ja: 'スクリーンショットが見つかりません', en: 'No screenshots found' },
  no_pdf_screenshots:   { ja: 'PDFを生成するスクリーンショットがありません', en: 'No screenshots available to generate PDF' },
  page_info_fmt:        { ja: '{n} ページ',   en: '{n} pages' },

  no_valid_screenshots:  { ja: '有効なスクリーンショットがありません', en: 'No valid screenshots' },
  pdf_gen_failed:        { ja: 'PDF生成に失敗しました: ',      en: 'Failed to generate PDF: ' },
  img_load_failed:       { ja: '画像の読み込みに失敗しました', en: 'Failed to load image' },
  auth_cancelled:        { ja: '認証がキャンセルされました',  en: 'Authentication cancelled' },
  subscription_active_until: {
    ja: '{date} まで利用可能（解約予約済み）',
    en: 'Active until {date} (cancellation scheduled)',
  },
  reload_label:         { ja: ' (再読込取得)',   en: ' (reloaded)' },
  captured_at:          { ja: '取得日時: ',      en: 'Captured: ' },
  display_may_differ:   { ja: '実際の画面表示とは異なる場合があります', en: 'Actual display may vary' },

  // ── Progress ─────────────────────────────────────────────────────────────────
  warning_no_switch:    { ja: '処理中はタブを切り替えないでください', en: 'Do not switch tabs during processing' },
  cancelling:           { ja: 'キャンセル中...',          en: 'Cancelling...' },
};

export function t(key) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return isJa ? entry.ja : entry.en;
}

export function applyI18n() {
  document.documentElement.lang = isJa ? 'ja' : 'en';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const val = t(el.dataset.i18n);
    if (val !== el.dataset.i18n) el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const val = t(el.dataset.i18nHtml);
    if (val !== el.dataset.i18nHtml) el.innerHTML = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const val = t(el.dataset.i18nPlaceholder);
    if (val !== el.dataset.i18nPlaceholder) el.placeholder = val;
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const val = t(el.dataset.i18nTitle);
    if (val !== el.dataset.i18nTitle) el.title = val;
  });

  const titleKey = document.documentElement.dataset.i18nTitle;
  if (titleKey) document.title = t(titleKey);
}
