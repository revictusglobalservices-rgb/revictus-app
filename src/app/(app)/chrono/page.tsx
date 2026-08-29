// Écran Chrono — section 5/6 du cadrage : démarrage/arrêt d'une session de travail
// liée à une tâche, calcul automatique de la durée, historique des sessions.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ChronoPanel from "@/components/ChronoPanel";

export default async function ChronoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profil }, { data: taches }, { data: sessionActive }, { data: sessionsRecentes }] =
    await Promise.all([
      supabase.from("utilisateurs").select("id, entreprise_id, nom, role").eq("id", user.id).single(),
      supabase
        .from("taches")
        .select("id, titre, statut")
        .eq("assigne_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("sessions_temps").select("*").eq("utilisateur_id", user.id).is("fin", null).maybeSingle(),
      supabase
        .from("sessions_temps")
        .select("*")
        .eq("utilisateur_id", user.id)
        .not("fin", "is", null)
        .order("debut", { ascending: false })
        .limit(10),
    ]);

  if (!profil) redirect("/login");

  return (
    <main style={{ padding: "24px 32px" }}>
      <h1 style={{ color: "var(--navy)", margin: "0 0 24px" }}>Chrono</h1>
      <ChronoPanel
        currentUserId={profil.id}
        taches={taches ?? []}
        sessionActiveInitiale={sessionActive ?? null}
        sessionsRecentesInitiales={sessionsRecentes ?? []}
      />
    </main>
  );
}
