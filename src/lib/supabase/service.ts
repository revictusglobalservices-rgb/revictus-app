// Client "service role" — CONTOURNE la RLS. Réservé aux intégrations backend
// (assistant IA, synchronisation Airtable, jobs planifiés) décidées le 27/08/2026.
//
// Règles impératives :
//   1. Jamais importé depuis un composant client ("use client") ni exposé au navigateur.
//   2. Utilisé uniquement dans des Route Handlers / Server Actions / jobs serveur.
//   3. Chaque appel filtre explicitement sur les données dont il a besoin — ce client
//      n'a aucune protection RLS, la portée des requêtes est donc sous la responsabilité
//      du code qui l'utilise.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
