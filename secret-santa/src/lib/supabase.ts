import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabaseDatabase'

let supabaseClient: SupabaseClient<Database> | null = null

export function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !anonKey) {
    return null
  }

  supabaseClient = createClient<Database>(supabaseUrl, anonKey)
  return supabaseClient
}
