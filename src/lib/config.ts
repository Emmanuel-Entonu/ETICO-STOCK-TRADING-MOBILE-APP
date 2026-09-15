// Runtime configuration.
//
// Fallbacks are baked in so dev builds never crash at launch on missing env,
// BUT prod builds refuse to boot without the vars set — a stale preview
// domain baked into a release APK would silently proxy trades to the wrong
// backend. Supabase anon key is CLIENT-SAFE by design (RLS enforces per-user
// access). The proxy base URL is public. No secrets go here.
//
// To ship a release, set:
//   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_PROXY_BASE
// and run `npx expo run:android --variant release`.

const FALLBACK_SUPABASE_URL = 'https://cmrxwuqfagqskrjdmjte.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtcnh3dXFmYWdxc2tyamRtanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NTYwODEsImV4cCI6MjA5MDUzMjA4MX0.cHCxF1XJbZHqatZ8ImMWJPUplB1wfWqx3j_EjkAAZa0'
const FALLBACK_PROXY_BASE = 'https://moneta-app-ten.vercel.app'

function resolve(name: string, fallback: string): string {
  const v = process.env[name]
  if (v) return v
  if (!__DEV__) {
    // Warn loudly in release so a missing env doesn't silently point at a
    // stale preview backend — but don't hard-throw and brick the app.
    console.warn(`[config] ${name} not set — falling back to compiled default. Set it in eas.json / EAS env before shipping.`)
  }
  return fallback
}

export const config = {
  supabaseUrl:     resolve('EXPO_PUBLIC_SUPABASE_URL',      FALLBACK_SUPABASE_URL),
  supabaseAnonKey: resolve('EXPO_PUBLIC_SUPABASE_ANON_KEY', FALLBACK_SUPABASE_ANON_KEY),
  proxyBase:       resolve('EXPO_PUBLIC_PROXY_BASE',        FALLBACK_PROXY_BASE),
}
