// Écran Kanban — section 7 du cadrage : colonnes configurables, glisser-déposer,
// synchronisation temps réel (< 10s) entre collaborateurs.
// La RLS filtre déjà les données : un collaborateur ne voit que ses tâches assignées
// et celles qu'il a créées ; un manager/admin voit toute l'équipe/l'entreprise
// (policies "read accessible tasks" / "team managers manage tasks", section 12).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
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
    <main style={{ padding: "24px 32px" }}>
      <h1 style={{ color: "var(--navy)", margin: "0 0 24px" }}>Kanban</h1>
      <Suspense fallback={<p style={{ color: "var(--ink-2)" }}>Chargement du tableau…</p>}>
        <KanbanBoard entrepriseId={profil.entreprise_id} currentUserId={profil.id} role={profil.role} />
      </Suspense>
    </main>
  );
}
