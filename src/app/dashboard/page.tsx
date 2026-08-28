// Dashboard collaborateur — contenu validé section 9 :
// pointage du jour, chrono actif, tâches prioritaires, Kanban personnel.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import ChronoWidget from "@/components/ChronoWidget";
import type { PrioriteTache, StatutTache } from "@/types/database";

const PRIORITE_ORDRE: Record<PrioriteTache, number> = { urgent: 0, important: 1, normal: 2 };
const PRIORITE_LABEL: Record<PrioriteTache, string> = { urgent: "Urgent", important: "Important", normal: "Normal" };
const PRIORITE_COLOR: Record<PrioriteTache, string> = {
  urgent: "var(--urgent)",
  important: "var(--important)",
  normal: "var(--normal)",
};
const STATUT_COMPTEUR_LABEL: Record<StatutTache, string> = {
  a_faire: "à faire",
  en_cours: "en cours",
  en_attente: "en attente",
  terminee: "terminées",
};

function dateDuJour() {
  return new Date().toISOString().slice(0, 10);
}

function formatDuree(totalSecondes: number) {
  const s = Math.max(0, Math.floor(totalSecondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardCollaborateur() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aujourdhui = dateDuJour();

  const [{ data: profil }, { data: pointage }, { data: sessionActive }, { data: tachesBrutes }] = await Promise.all([
    supabase.from("utilisateurs").select("nom").eq("id", user.id).single(),
    supabase.from("pointages").select("*").eq("utilisateur_id", user.id).eq("date", aujourdhui).maybeSingle(),
    supabase.from("sessions_temps").select("*").eq("utilisateur_id", user.id).is("fin", null).maybeSingle(),
    supabase.from("taches").select("id, titre, statut, priorite, echeance").eq("assigne_id", user.id).is("deleted_at", null),
  ]);

  let tacheActiveTitre: string | null = null;
  if (sessionActive) {
    const { data: t } = await supabase.from("taches").select("titre").eq("id", sessionActive.tache_id).single();
    tacheActiveTitre = t?.titre ?? null;
  }

  const taches = tachesBrutes ?? [];
  const compteursStatut: Record<StatutTache, number> = { a_faire: 0, en_cours: 0, en_attente: 0, terminee: 0 };
  for (const t of taches) compteursStatut[t.statut]++;

  const tachesPrioritaires = taches
    .filter((t) => t.statut !== "terminee")
    .slice()
    .sort((a, b) => {
      const diff = PRIORITE_ORDRE[a.priorite] - PRIORITE_ORDRE[b.priorite];
      if (diff !== 0) return diff;
      if (!a.echeance) return 1;
      if (!b.echeance) return -1;
      return a.echeance.localeCompare(b.echeance);
    })
    .slice(0, 5);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
      <TopNav nom={profil?.nom ?? ""} userId={user.id} />
      <h1 style={{ color: "var(--navy)" }}>Bonjour {profil?.nom ?? ""}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
        <section className="card">
          <h3>Pointage du jour</h3>
          {!pointage ? (
            <p style={{ color: "var(--ink-2)" }}>Pas encore pointé aujourd&apos;hui.</p>
          ) : pointage.statut === "ouvert" ? (
            <p style={{ color: "var(--ink-2)" }}>Arrivée à {formatHeure(pointage.check_in!)} — en cours.</p>
          ) : (
            <p style={{ color: "var(--ink-2)" }}>
              {formatHeure(pointage.check_in!)} → {formatHeure(pointage.check_out!)} (
              {formatDuree(pointage.duree_secondes ?? 0)})
            </p>
          )}
          <a href="/pointage" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>
            Pointer &rarr;
          </a>
        </section>

        <section className="card">
          <h3>Chrono actif</h3>
          <ChronoWidget sessionActive={sessionActive ?? null} tacheTitre={tacheActiveTitre} />
        </section>

        <section className="card">
          <h3>Tâches prioritaires</h3>
          {tachesPrioritaires.length === 0 ? (
            <p style={{ color: "var(--ink-2)" }}>Aucune tâche en attente.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {tachesPrioritaires.map((t) => (
                <li key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                  <span>{t.titre}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: PRIORITE_COLOR[t.priorite],
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {PRIORITE_LABEL[t.priorite]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <a href="/kanban" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 8, display: "inline-block" }}>
            Voir tout &rarr;
          </a>
        </section>

        <section className="card">
          <h3>Kanban personnel</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "var(--ink-2)" }}>
            {(Object.keys(STATUT_COMPTEUR_LABEL) as StatutTache[]).map((statut) => (
              <span key={statut}>
                {compteursStatut[statut]} {STATUT_COMPTEUR_LABEL[statut]}
              </span>
            ))}
          </div>
          <a href="/kanban" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 8, display: "inline-block" }}>
            Ouvrir &rarr;
          </a>
        </section>
      </div>
    </main>
  );
}
