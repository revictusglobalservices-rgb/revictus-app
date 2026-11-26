import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export function moduleActif() {
  return process.env.VERCEL_ENV === "production" && process.env.REVICTUS_COLLABORATEURS_ENABLED === "true";
}
export async function administration() {
  if (!moduleActif()) return null;
  const { data: { user } } = await createClient().auth.getUser();
  const ids = (process.env.REVICTUS_COLLABORATEURS_ADMIN_IDS ?? "").split(",").map(x => x.trim());
  if (!user || !user.email_confirmed_at || !ids.includes(user.id)) return null;
  const service = createServiceClient();
  const { data: profil, error } = await service.from("utilisateurs").select("id, entreprise_id, role, statut, deleted_at").eq("id",user.id).single();
  if (error || !profil || profil.role !== "admin" || profil.statut !== "actif" || profil.deleted_at) return null;
  return { service, profil };
}
