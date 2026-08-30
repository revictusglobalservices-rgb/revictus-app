// Congés / absences — vue globale équipe (demande du 30/08/2026) : les
// demandes en attente de toute l'équipe au même endroit, pour ne pas avoir à
// visiter la fiche de chaque collaborateur une par une. La décision
// (Valider/Refuser) et la création directe restent centralisées sur la
// fiche détaillée de chaque collaborateur (`CongesEditor`, dans
// `/manager/equipe/[id]`) — cette page ne fait qu'agréger et permet aussi de
// décider directement depuis ici, par cohérence avec l'attente d'une vue
// d'ensemble actionnable (RLS déjà en place : peut_acceder()/is_manager_of()
// limitent ce qu'un manager voit à son équipe, un admin à son entreprise).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EquipeCongesAbsences from "@/components/EquipeCongesAbsences";
import type { CongeAbsence, Utilisateur } from "@/types/database";

export default async function CongesEquipe() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase.from("utilisateurs").select("id, role, entreprise_id").eq("id", user.id).single();
  if (!profil || profil.role === "collaborateur") redirect("/conges");

  const requeteEquipe =
    profil.role === "admin"
      ? supabase.from("utilisateurs").select("id, nom").eq("entreprise_id", profil.entreprise_id).is("deleted_at", null).order("nom")
      : supabase.from("utilisateurs").select("id, nom").eq("manager_id", profil.id).is("deleted_at", null).order("nom");
  const { data: equipeData } = await requeteEquipe;
  const equipe = (equipeData ?? []) as Pick<Utilisateur, "id" | "nom">[];
  const ids = equipe.map((m) => m.id);

  const { data: demandesData } =
    ids.length > 0
      ? await supabase.from("conges_absences").select("*").in("utilisateur_id", ids).is("deleted_at", null).order("date_debut", { ascending: false })
      : { data: [] };
  const demandes = (demandesData ?? []) as CongeAbsence[];

  const noms = new Map(equipe.map((m) => [m.id, m.nom]));

  return (
    <main style={{ padding: "24px 32px" }}>
      <h1 style={{ color: "var(--navy)", margin: "0 0 4px" }}>Congés & absences — équipe</h1>
      <p style={{ color: "var(--ink-2)", marginTop: 0, marginBottom: 20 }}>
        Toutes les demandes de l&apos;équipe. Valide ou refuse directement, ou depuis la fiche du collaborateur.
      </p>
      {equipe.length === 0 ? (
        <div className="card-2" style={{ padding: 24 }}>
          <p style={{ color: "var(--ink-2)", margin: 0 }}>Aucun collaborateur rattaché pour l&apos;instant.</p>
        </div>
      ) : (
        <EquipeCongesAbsences demandesInitiales={demandes} noms={Object.fromEntries(noms)} />
      )}
    </main>
  );
}
