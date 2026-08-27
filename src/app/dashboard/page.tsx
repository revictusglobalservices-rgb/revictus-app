// Dashboard collaborateur — contenu validé section 9 :
// pointage du jour, chrono actif, tâches prioritaires, Kanban personnel, activité récente.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardCollaborateur() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("nom")
    .eq("id", user.id)
    .single();

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
      <h1 style={{ color: "var(--navy)" }}>Bonjour {profil?.nom ?? ""}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
        <section className="card">
          <h3>Pointage du jour</h3>
          <p style={{ color: "var(--ink-2)" }}>Check-in / check-out — à brancher sur la table `pointages`.</p>
        </section>
        <section className="card">
          <h3>Chrono actif</h3>
          <p style={{ color: "var(--ink-2)" }}>Session en cours — à brancher sur `sessions_temps`.</p>
        </section>
        <section className="card">
          <h3>Tâches prioritaires</h3>
          <p style={{ color: "var(--ink-2)" }}>Priorité Urgent / Important / Normal — à brancher sur `taches`.</p>
        </section>
        <section className="card">
          <h3>Kanban personnel</h3>
          <p style={{ color: "var(--ink-2)" }}>Mes tâches uniquement — statuts À faire / En cours / En attente / Terminée.</p>
        </section>
      </div>
    </main>
  );
}
