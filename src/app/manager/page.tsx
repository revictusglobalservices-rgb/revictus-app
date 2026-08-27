// Dashboard manager — contenu validé section 9 :
// présence équipe, tâches en retard, activités en cours, temps, performances, Kanban global.
// Le manager lit ET modifie toutes les données de son équipe (décision du 27/08/2026).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardManager() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: equipe } = await supabase
    .from("utilisateurs")
    .select("id, nom, statut")
    .eq("manager_id", user.id);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
      <h1 style={{ color: "var(--navy)" }}>Tableau de bord manager</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
        <section className="card">
          <h3>Présence équipe</h3>
          <p style={{ color: "var(--ink-2)" }}>{equipe?.length ?? 0} collaborateur(s) rattaché(s).</p>
        </section>
        <section className="card">
          <h3>Tâches en retard</h3>
          <p style={{ color: "var(--ink-2)" }}>Échéance dépassée, statut ≠ Terminée — à brancher sur `taches`.</p>
        </section>
        <section className="card">
          <h3>Kanban global</h3>
          <p style={{ color: "var(--ink-2)" }}>Toutes les tâches de l'équipe, filtrables par statut/priorité/date.</p>
        </section>
        <section className="card">
          <h3>Corrections en attente</h3>
          <p style={{ color: "var(--ink-2)" }}>Saisies manuelles à approuver sous 48h — table `corrections`.</p>
        </section>
      </div>
    </main>
  );
}
