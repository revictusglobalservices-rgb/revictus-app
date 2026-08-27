// Écran Pointage — section 4 du cadrage : check-in/check-out journalier,
// gestion des pauses (petite pause / pause déjeuner / permission).
// Note : jour calculé en UTC pour le MVP — à affiner sur le fuseau de
// l'entreprise (Indian/Antananarivo) si des écarts sont constatés en test.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PointagePanel from "@/components/PointagePanel";
import type { Pause } from "@/types/database";

function dateDuJour() {
  return new Date().toISOString().slice(0, 10);
}

export default async function PointagePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aujourdhui = dateDuJour();

  const [{ data: profil }, { data: pointage }] = await Promise.all([
    supabase.from("utilisateurs").select("id, entreprise_id, nom, role").eq("id", user.id).single(),
    supabase.from("pointages").select("*").eq("utilisateur_id", user.id).eq("date", aujourdhui).maybeSingle(),
  ]);

  if (!profil) redirect("/login");

  let pauses: Pause[] = [];
  if (pointage) {
    const { data } = await supabase
      .from("pauses")
      .select("*")
      .eq("pointage_id", pointage.id)
      .order("debut", { ascending: true });
    pauses = data ?? [];
  }

  return (
    <main style={{ padding: "24px 32px", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <a href={profil.role === "collaborateur" ? "/dashboard" : "/manager"} style={{ fontSize: 14, color: "var(--ink-2)" }}>
          &larr; Tableau de bord
        </a>
        <h1 style={{ color: "var(--navy)", margin: "4px 0 0" }}>Pointage</h1>
      </div>
      <PointagePanel
        currentUserId={profil.id}
        dateDuJour={aujourdhui}
        pointageInitial={pointage ?? null}
        pausesInitiales={pauses}
      />
    </main>
  );
}
