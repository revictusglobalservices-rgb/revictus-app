// Écran Kanban — section 7 du cadrage : colonnes configurables, glisser-déposer,
// synchronisation temps réel (< 10s) entre collaborateurs.
// La RLS filtre déjà les données : un collaborateur ne voit que ses tâches assignées
// et celles qu'il a créées ; un manager/admin voit toute l'équipe/l'entreprise
// (policies "read accessible tasks" / "team managers manage tasks", section 12).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import KanbanBoard from "@/components/KanbanBoard";

export default async function KanbanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("id, entreprise_id, nom, role")
    .eq("id", user.id)
    .single();

  if (!profil) redirect("/login");

  return (
    <main style={{ padding: "24px 32px", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <a href={profil.role === "collaborateur" ? "/dashboard" : "/manager"} style={{ fontSize: 14, color: "var(--ink-2)" }}>
            &larr; Tableau de bord
          </a>
          <h1 style={{ color: "var(--navy)", margin: "4px 0 0" }}>Kanban</h1>
        </div>
      </div>
      <KanbanBoard entrepriseId={profil.entreprise_id} currentUserId={profil.id} />
    </main>
  );
}
