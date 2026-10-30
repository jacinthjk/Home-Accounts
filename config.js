/* =====================================================================
   Home Accounts – connection to YOUR cloud (Supabase).
   Fill these in once, after setting up Supabase (see README → "Setting up
   the cloud"). Everyone who uses the app then signs up with their mobile
   number – they never see these settings.

   Both values are public by design (the "publishable" key only allows what
   cloud-setup.sql permits), so it is fine that they are in this file.
   ===================================================================== */
window.HA_CONFIG = window.HA_CONFIG || {
  supabaseUrl: 'https://hsgngocbycawmttmgisa.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZ25nb2NieWNhd210dG1naXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMjEyNzAsImV4cCI6MjEwODg5NzI3MH0.gQb213NyzAbBLoKnSPzZIVLLHtL-qVfMqYX-jKuDnTA',
};
