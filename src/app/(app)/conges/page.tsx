// Congés / absences — vue personnelle (tous rôles : chacun peut demander un
// congé ou signaler une absence pour lui-même, décision du 30/08/2026).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MesCongesAbsences from "@/components/MesCongesAbsences";
import type { CongeAbsence } from "@/types/database";

export default async function CongesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase.from("utilisateurs").select("id, entreprise_id").eq("id", user.id).single();
  if (!profil) redirect("/login");

  const { data: demandes } = await supabase
    .from("conges_absences")
    .select("*")
    .eq("utilisateur_id", profil.id)
    .is("deleted_at", null)
    .order("date_debut", { ascending: false });

  return (
    <main style={{ padding: "24px 32px", maxWidth: 760 }}>
      <h1 style={{ color: "var(--navy)", margin: "0 0 4px" }}>Congés & absences</h1>
      <p style={{ color: "var(--ink-2)", marginTop: 0, marginBottom: 20 }}>
        Demande un congé ou signale une absence — ton manager (ou un admin) valide ou refuse ensuite.
      </p>
      <MesCongesAbsences utilisateurId={profil.id} entrepriseId={profil.entreprise_id} demandesInitiales={(demandes ?? []) as CongeAbsence[]} />
    </main>
  );
}
