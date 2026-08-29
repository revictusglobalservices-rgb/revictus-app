// Écran Corrections en attente (section 6) : un collaborateur demande la
// correction d'un pointage clos ; son manager (ou un admin) approuve ou
// refuse. Visible par tous (chacun peut demander une correction), mais
// seuls les managers/admins voient des demandes à traiter.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CorrectionsPanel from "@/components/CorrectionsPanel";

export default async function CorrectionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profil }, { data: aValider }, { data: mesDemandes }] = await Promise.all([
    supabase.from("utilisateurs").select("id, nom, role").eq("id", user.id).single(),
    supabase
      .from("corrections")
      .select("*")
      .eq("statut", "en_attente")
      .neq("auteur_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.from("corrections").select("*").eq("auteur_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (!profil) redirect("/login");

  const auteurIds = Array.from(new Set((aValider ?? []).map((c) => c.auteur_id)));
  let noms: Record<string, string> = {};
  if (auteurIds.length > 0) {
    const { data: utilisateurs } = await supabase.from("utilisateurs").select("id, nom").in("id", auteurIds);
    noms = Object.fromEntries((utilisateurs ?? []).map((u) => [u.id, u.nom]));
  }

  return (
    <main style={{ padding: "24px 32px" }}>
      <h1 style={{ color: "var(--navy)", margin: "0 0 24px" }}>Corrections en attente</h1>
      <CorrectionsPanel
        currentUserId={profil.id}
        aValiderInitial={aValider ?? []}
        mesDemandesInitiales={mesDemandes ?? []}
        nomsAuteurs={noms}
      />
    </main>
  );
}
