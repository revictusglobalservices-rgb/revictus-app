// Vue détaillée par collaborateur (section 9) — accessible au manager direct
// et à l'admin uniquement (RLS : is_manager_of(id) or is_admin() sur
// `utilisateurs`, et peut_acceder(utilisateur_id) sur pointages/taches/sessions
// — si la ligne cible n'est pas visible pour le viewer, `.maybeSingle()`
// renvoie simplement `null` et on redirige).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PlanningEditor from "@/components/PlanningEditor";
import CongesEditor from "@/components/CongesEditor";
import type { CongeAbsence, OccurrencePlanning, PlanningRecurrence, PrioriteTache, StatutTache, StatutUtilisateur } from "@/types/database";

function dansNJours(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const STATUT_LABEL: Record<StatutTache, string> = {
  a_faire: "à faire",
  en_cours: "en cours",
  en_attente: "en attente",
  terminee: "terminée",
};

const PRIORITE_LABEL: Record<PrioriteTache, string> = { urgent: "Urgent", important: "Important", normal: "Normal" };
const PRIORITE_COLOR: Record<PrioriteTache, string> = {
  urgent: "var(--urgent)",
  important: "var(--important)",
  normal: "var(--normal)",
};
const STATUT_UTIL_LABEL: Record<StatutUtilisateur, string> = {
  actif: "Actif",
  invite: "Invité",
  suspendu: "Suspendu",
  archive: "Archivé",
};

function formatDuree(totalSecondes: number | null) {
  const s = Math.max(0, Math.floor(totalSecondes ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatHeure(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default async function DetailCollaborateur({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: collaborateur } = await supabase.from("utilisateurs").select("*").eq("id", params.id).maybeSingle();

  // Non trouvé ou non autorisé (RLS) → retour au dashboard manager.
  if (!collaborateur) redirect("/manager");

  const ilYA14Jours = new Date();
  ilYA14Jours.setDate(ilYA14Jours.getDate() - 14);
  const depuis = ilYA14Jours.toISOString().slice(0, 10);

  const [{ data: pointages }, { data: sessionActive }, { data: taches }, { data: corrections }] = await Promise.all([
    supabase
      .from("pointages")
      .select("*")
      .eq("utilisateur_id", params.id)
      .gte("date", depuis)
      .order("date", { ascending: false }),
    supabase.from("sessions_temps").select("*").eq("utilisateur_id", params.id).is("fin", null).maybeSingle(),
    supabase
      .from("taches")
      .select("id, titre, statut, priorite, echeance")
      .eq("assigne_id", params.id)
      .is("deleted_at", null)
      .order("echeance", { ascending: true, nullsFirst: false }),
    supabase
      .from("corrections")
      .select("*")
      .eq("auteur_id", params.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const [{ data: recurrencesPlanning }, { data: occurrencesPlanning }, { data: congesAbsences }] = await Promise.all([
    supabase
      .from("planning_recurrences")
      .select("*")
      .eq("utilisateur_id", params.id)
      .eq("actif", true)
      .order("jour_semaine"),
    supabase.rpc("obtenir_planning", {
      p_utilisateur_id: params.id,
      p_debut: new Date().toISOString().slice(0, 10),
      p_fin: dansNJours(60),
    }),
    supabase
      .from("conges_absences")
      .select("*")
      .eq("utilisateur_id", params.id)
      .is("deleted_at", null)
      .order("date_debut", { ascending: false }),
  ]);

  let tacheActiveTitre: string | null = null;
  if (sessionActive) {
    const { data: t } = await supabase.from("taches").select("titre").eq("id", sessionActive.tache_id).single();
    tacheActiveTitre = t?.titre ?? null;
  }

  const totalSecondes14j = (pointages ?? []).reduce((acc, p) => acc + (p.duree_secondes ?? 0), 0);
  const taches2 = taches ?? [];
  const compteursStatut: Record<StatutTache, number> = { a_faire: 0, en_cours: 0, en_attente: 0, terminee: 0 };
  for (const t of taches2) compteursStatut[t.statut]++;
  const tachesEnCours = taches2.filter((t) => t.statut !== "terminee");

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
      <a href="/manager" style={{ fontSize: 14, color: "var(--ink-2)" }}>
        &larr; Tableau de bord manager
      </a>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>{collaborateur.nom}</h1>
        <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{STATUT_UTIL_LABEL[collaborateur.statut]}</span>
      </div>
      <p style={{ color: "var(--ink-2)", marginTop: 4 }}>{collaborateur.email}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
        <section className="card">
          <h3>Chrono actif</h3>
          {sessionActive ? (
            <p style={{ color: "var(--ink-2)" }}>En cours sur « {tacheActiveTitre ?? "Tâche"} », depuis {formatHeure(sessionActive.debut)}.</p>
          ) : (
            <p style={{ color: "var(--ink-2)" }}>Aucune session en cours.</p>
          )}
        </section>

        <section className="card">
          <h3>Temps travaillé (14 derniers jours)</h3>
          <p style={{ fontSize: 24, fontWeight: 700, color: "var(--navy)", margin: "4px 0 0" }}>{formatDuree(totalSecondes14j)}</p>
          <p style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 4 }}>{(pointages ?? []).length} jour(s) pointé(s)</p>
        </section>

        <section className="card">
          <h3>Tâches</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "var(--ink-2)" }}>
            {(Object.keys(STATUT_LABEL) as StatutTache[]).map((statut) => (
              <span key={statut}>
                {compteursStatut[statut]} {STATUT_LABEL[statut]}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section style={{ marginTop: 32 }}>
        <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Planning</h3>
        <PlanningEditor
          utilisateurId={params.id}
          entrepriseId={collaborateur.entreprise_id}
          createurId={user.id}
          recurrencesInitiales={(recurrencesPlanning ?? []) as PlanningRecurrence[]}
          occurrencesInitiales={(occurrencesPlanning ?? []) as OccurrencePlanning[]}
        />
      </section>

      <section style={{ marginTop: 32 }}>
        <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Congés & absences</h3>
        <CongesEditor
          utilisateurId={params.id}
          entrepriseId={collaborateur.entreprise_id}
          createurId={user.id}
          demandesInitiales={(congesAbsences ?? []) as CongeAbsence[]}
        />
      </section>

      <section style={{ marginTop: 32 }}>
        <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Historique de pointage (14 derniers jours)</h3>
        {(pointages ?? []).length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Aucun pointage sur cette période.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(pointages ?? []).map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 14px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <span style={{ textTransform: "capitalize" }}>{formatDate(p.date)}</span>
                <span style={{ color: "var(--ink-2)" }}>
                  {formatHeure(p.check_in)} → {formatHeure(p.check_out)}
                </span>
                <span style={{ fontWeight: 600, color: "var(--navy)" }}>
                  {p.statut === "ouvert" ? "en cours" : formatDuree(p.duree_secondes)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Tâches en cours</h3>
        {tachesEnCours.length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Aucune tâche en cours.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tachesEnCours.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 14px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <span>{t.titre}</span>
                <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "var(--ink-2)", fontSize: 13 }}>{STATUT_LABEL[t.statut]}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITE_COLOR[t.priorite], textTransform: "uppercase" }}>
                    {PRIORITE_LABEL[t.priorite]}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {(corrections ?? []).length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Demandes de correction récentes</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(corrections ?? []).map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 14px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <span>{c.motif}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: c.statut === "approuvee" ? "var(--normal)" : c.statut === "refusee" ? "var(--urgent)" : "var(--important)",
                  }}
                >
                  {c.statut === "approuvee" ? "Approuvée" : c.statut === "refusee" ? "Refusée" : "En attente"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
