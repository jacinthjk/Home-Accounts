/* =====================================================================
   Home Accounts – connection to YOUR cloud (Supabase).
   Fill these in once, after setting up Supabase (see README → "Setting up
   the cloud"). Everyone who uses the app then signs up with their mobile
   number – they never see these settings.

   Both values are public by design (the "publishable" key only allows what
   cloud-setup.sql permits), so it is fine that they are in this file.
   ===================================================================== */
window.HA_CONFIG = window.HA_CONFIG || {
  supabaseUrl: '',   // e.g. 'https://abcdxyz.supabase.co'
  supabaseKey: '',   // e.g. 'sb_publishable_...'  (or the older "anon public" key)
};
