// Boîte à idées (section ajoutée le 07/09/2026, demande d'Angelo) : chaque
// collaborateur propose une amélioration et peut soutenir celles des autres
// par un vote ; seul un admin valide ou refuse (voir IdeesPanel.tsx et
// 0021_boite_a_idees.sql). La visibilité (mes idées + idées validées des
// autres, jamais celles d'un admin) est entièrement portée par la RLS : ce
// composant se contente d'afficher ce que Supabase renvoie.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import IdeesPanel from "@/components/IdeesPanel";
import type { Idee } from "@/types/database";

export default async function IdeesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase.from("utilisateurs").select("id, nom, role").eq("id", user.id).single();
  if (!profil) redirect("/login");

  const { data: idees } = await supabase.from("idees").select("*").is("deleted_at", null).order("created_at", { ascending: false });

  const ids = (idees ?? []).map((i: Idee) => i.id);
  let votes: Record<string, number> = {};
  let mesVotes: string[] = [];
  if (ids.length > 0) {
    const { data: tousLesVotes } = await supabase.from("idees_votes").select("idee_id, utilisateur_id").in("idee_id", ids);
    for (const v of tousLesVotes ?? []) {
      votes[v.idee_id] = (votes[v.idee_id] ?? 0) + 1;
      if (v.utilisateur_id === profil.id) mesVotes.push(v.idee_id);
    }
  }

  return (
    <main style={{ padding: "24px 32px" }}>
      <h1 style={{ color: "var(--navy)", margin: "0 0 24px" }}>Boîte à idées</h1>
      <IdeesPanel
        currentUserId={profil.id}
        role={profil.role}
        ideesInitiales={idees ?? []}
        votesInitiaux={votes}
        mesVotesInitiaux={mesVotes}
      />
    </main>
  );
}
