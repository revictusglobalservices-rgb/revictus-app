// Dashboard manager — contenu validé section 9 :
// présence équipe, tâches en retard, Kanban global, corrections en attente.
// Le manager lit ET modifie toutes les données de son équipe (décision du 27/08/2026).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import type { StatutTache, StatutUtilisateur } from "@/types/database";

const STATUT_COMPTEUR_LABEL: Record<StatutTache, string> = {
  a_faire: "à faire",
  en_cours: "en cours",
  en_attente: "en attente",
  terminee: "terminées",
};

const STATUT_UTIL_LABEL: Record<StatutUtilisateur, string> = {
  actif: "Actif",
  invite: "Invité",
  suspendu: "Suspendu",
  archive: "Archivé",
};

export default async function DashboardManager() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const maintenant = new Date().toISOString();

  const [{ data: profil }, { data: equipe }, { data: enRetard }, { data: tachesGlobales }, { data: corrections }] =
    await Promise.all([
      supabase.from("utilisateurs").select("nom").eq("id", user.id).single(),
      supabase.from("utilisateurs").select("id, nom, statut").eq("manager_id", user.id),
      supabase
        .from("taches")
        .select("id, titre, echeance")
        .lt("echeance", maintenant)
        .neq("statut", "terminee")
        .is("deleted_at", null)
        .order("echeance", { ascending: true })
        .limit(5),
      supabase.from("taches").select("statut").is("deleted_at", null),
      supabase.from("corrections").select("id").eq("statut", "en_attente"),
    ]);

  const compteursStatut: Record<StatutTache, number> = { a_faire: 0, en_cours: 0, en_attente: 0, terminee: 0 };
  for (const t of tachesGlobales ?? []) compteursStatut[t.statut]++;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
      <TopNav nom={profil?.nom ?? ""} userId={user.id} />
      <h1 style={{ color: "var(--navy)" }}>Tableau de bord manager</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
        <section className="card">
          <h3>Présence équipe</h3>
          <p style={{ color: "var(--ink-2)" }}>{equipe?.length ?? 0} collaborateur(s) rattaché(s).</p>
          {(equipe ?? []).length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 4 }}>
              {(equipe ?? []).slice(0, 5).map((m) => (
                <li key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <a href={`/manager/equipe/${m.id}`} style={{ color: "var(--navy)", fontWeight: 600 }}>
                    {m.nom}
                  </a>
                  <span style={{ color: "var(--ink-2)" }}>{STATUT_UTIL_LABEL[m.statut]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Tâches en retard</h3>
          {(enRetard ?? []).length === 0 ? (
            <p style={{ color: "var(--ink-2)" }}>Aucune tâche en retard.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {(enRetard ?? []).map((t) => (
                <li key={t.id} style={{ fontSize: 14, color: "var(--urgent)" }}>
                  {t.titre}
                </li>
              ))}
            </ul>
          )}
          <a href="/kanban" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 8, display: "inline-block" }}>
            Voir &rarr;
          </a>
        </section>

        <section className="card">
          <h3>Kanban global</h3>
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

        <section className="card">
          <h3>Corrections en attente</h3>
          <p style={{ color: "var(--ink-2)" }}>{(corrections ?? []).length} saisie(s) à valider sous 48h.</p>
          <a href="/corrections" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600, marginTop: 8, display: "inline-block" }}>
            Traiter &rarr;
          </a>
        </section>
      </div>
    </main>
  );
}
