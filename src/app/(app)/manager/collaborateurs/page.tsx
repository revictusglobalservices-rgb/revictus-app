import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CollaborateursDemo from "@/components/CollaborateursDemo";

export default async function Page() {
  const supabase = createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {data:profil} = await supabase.from("utilisateurs").select("role, statut, deleted_at").eq("id",user.id).single();
  if (!profil || profil.role !== "admin" || profil.statut !== "actif" || profil.deleted_at) redirect("/");
  return <CollaborateursDemo/>;
}
