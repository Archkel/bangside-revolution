// Bangside Revolution — initialize the Supabase browser client
(function () {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY) {
    console.error('Bangside Revolution: Supabase configuration or library is missing.');
    return;
  }

  const client = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY
  );

  window.bangsideSupabase = client;
  console.info('Bangside Revolution: Supabase client initialized.');
})();
