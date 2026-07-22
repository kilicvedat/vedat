import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Supabase ortam değişkenleri eksik. .env dosyanda VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı mı kontrol et."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
