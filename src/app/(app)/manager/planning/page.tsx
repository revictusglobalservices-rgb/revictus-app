// Planning des employés — vue globale équipe (demande du 30/08/2026,
// maquette fournie) : une grille lisible en un coup d'œil, une ligne par
// collaborateur, une colonne par jour. Lecture seule ici — la modification
// reste sur la fiche détaillée de chaque collaborateur (`/manager/equipe/[id]`,
// section Planning) pour ne pas dupliquer l'éditeur ; on y renvoie via le nom
// cliquable de chaque ligne, comme le reste de l'appli (RLS déjà en place :
// `obtenir_planning` respecte peut_acceder(), donc un manager ne voit ici que
// son équipe et un admin toute l'entreprise).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CATEGORIE_COULEUR, CATEGORIE_LABEL, REPOS_COULEUR } from "@/lib/planningCategories";
import { ABSENCE_COULEUR, CONGE_COULEUR, NATURE_LABEL, couvre } from "@/lib/congesAbsences";
import type { CongeAbsence, OccurrencePlanning, Utilisateur } from "@/types/database";

const JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function versISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function heureCourte(heure: string | null) {
  return heure ? heure.slice(0, 5) : "";
}

function lundiDe(d: Date) {
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(d);
  lundi.setDate(d.getDate() + decalage);
  return lundi;
}

function parseDateParam(param: string | undefined): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return new Date(param + "T00:00:00");
  return new Date();
}

function navBtn() {
  return { padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "var(--navy)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 6 } as const;
}

export default async function PlanningEquipe({ searchParams }: { searchParams: { semaine?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase.from("utilisateurs").select("id, role, entreprise_id").eq("id", user.id).single();
  if (!profil || profil.role === "collaborateur") redirect("/planning");

  const requeteEquipe =
    profil.role === "admin"
      ? supabase.from("utilisateurs").select("*").eq("entreprise_id", profil.entreprise_id).is("deleted_at", null).order("nom")
      : supabase.from("utilisateurs").select("*").eq("manager_id", profil.id).is("deleted_at", null).order("nom");
  const { data: equipeData } = await requeteEquipe;
  const equipe = (equipeData ?? []) as Utilisateur[];

  const lundi = lundiDe(parseDateParam(searchParams.semaine));
  const jours = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    return d;
  });
  const pDebut = versISO(jours[0]);
  const pFin = versISO(jours[6]);

  const planningsParMembre = await Promise.all(
    equipe.map(async (m) => {
      const [{ data }, { data: congesData }] = await Promise.all([
        supabase.rpc("obtenir_planning", { p_utilisateur_id: m.id, p_debut: pDebut, p_fin: pFin }),
        supabase
          .from("conges_absences")
          .select("*")
          .eq("utilisateur_id", m.id)
          .eq("statut", "validee")
          .is("deleted_at", null)
          .lte("date_debut", pFin)
          .gte("date_fin", pDebut),
      ]);
      const parJour = new Map<string, OccurrencePlanning[]>();
      for (const o of (data ?? []) as OccurrencePlanning[]) {
        if (o.type !== "horaire_travail") continue; // les événements n'ont pas leur place dans cette grille
        parJour.set(o.jour, [...(parJour.get(o.jour) ?? []), o]);
      }
      return { membre: m, parJour, congesAbsences: (congesData ?? []) as CongeAbsence[] };
    })
  );

  // Un jour couvert par un congé/absence validé n'est pas compté (la personne
  // ne travaille pas ce jour-là, même si un horaire récurrent existe dessous).
  const totalHeures = planningsParMembre.reduce((acc, { parJour, congesAbsences }) => {
    let s = 0;
    for (const [jour, entrees] of parJour.entries()) {
      if (congesAbsences.some((c) => couvre(jour, c.date_debut, c.date_fin))) continue;
      for (const o of entrees) {
        if (!o.heure_debut || !o.heure_fin) continue;
        const [h1, m1] = o.heure_debut.split(":").map(Number);
        const [h2, m2] = o.heure_fin.split(":").map(Number);
        let duree = h2 * 60 + m2 - (h1 * 60 + m1);
        if (duree < 0) duree += 24 * 60; // horaire de nuit (ex. 17h-01h) : se termine le lendemain
        s += duree;
      }
    }
    return acc + s;
  }, 0);
  const nbTeletravail = planningsParMembre.reduce(
    (acc, { parJour, congesAbsences }) =>
      acc +
      [...parJour.entries()].filter(([jour]) => !congesAbsences.some((c) => couvre(jour, c.date_debut, c.date_fin)))
        .flatMap(([, entrees]) => entrees)
        .filter((o) => o.categorie === "teletravail").length,
    0
  );
  const nbFormation = planningsParMembre.reduce(
    (acc, { parJour, congesAbsences }) =>
      acc +
      [...parJour.entries()].filter(([jour]) => !congesAbsences.some((c) => couvre(jour, c.date_debut, c.date_fin)))
        .flatMap(([, entrees]) => entrees)
        .filter((o) => o.categorie === "formation").length,
    0
  );
  const nbConges = planningsParMembre.reduce(
    (acc, { congesAbsences }) => acc + congesAbsences.filter((c) => c.nature === "conge").length,
    0
  );
  const nbAbsences = planningsParMembre.reduce(
    (acc, { congesAbsences }) => acc + congesAbsences.filter((c) => c.nature === "absence").length,
    0
  );

  const semainePrecedente = new Date(lundi);
  semainePrecedente.setDate(lundi.getDate() - 7);
  const semaineSuivante = new Date(lundi);
  semaineSuivante.setDate(lundi.getDate() + 7);
  const aujourdhui = new Date();

  return (
    <main style={{ padding: "24px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>Planning des employés</h1>
      </div>
      <p style={{ color: "var(--ink-2)", marginTop: 4, marginBottom: 20 }}>Vue d&apos;ensemble des plannings de l&apos;équipe.</p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
          {jours[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – {jours[6].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} {jours[6].getFullYear()}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href={`/manager/planning?semaine=${versISO(semainePrecedente)}`} style={navBtn()}>
            &larr;
          </a>
          <a href="/manager/planning" style={navBtn()}>
            Aujourd&apos;hui
          </a>
          <a href={`/manager/planning?semaine=${versISO(semaineSuivante)}`} style={navBtn()}>
            &rarr;
          </a>
        </div>
      </div>

      {equipe.length === 0 ? (
        <div className="card-2" style={{ padding: 24 }}>
          <p style={{ color: "var(--ink-2)", margin: 0 }}>Aucun collaborateur rattaché pour l&apos;instant.</p>
        </div>
      ) : (
        <div className="card-2" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...cellTh(), textAlign: "left", position: "sticky", left: 0, background: "var(--surface)", zIndex: 1 }}>Employés</th>
                {jours.map((d) => (
                  <th key={versISO(d)} style={cellTh()}>
                    {JOURS_COURTS[d.getDay()]}. {pad2(d.getDate())}/{pad2(d.getMonth() + 1)}
                    {versISO(aujourdhui) === versISO(d) && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", margin: "3px auto 0" }} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planningsParMembre.map(({ membre, parJour, congesAbsences }) => (
                <tr key={membre.id}>
                  <td style={{ ...cellTd(), position: "sticky", left: 0, background: "var(--surface)", zIndex: 1 }}>
                    <a href={`/manager/equipe/${membre.id}`} style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "none", fontSize: 13 }}>
                      {membre.nom}
                    </a>
                  </td>
                  {jours.map((d) => {
                    const iso = versISO(d);
                    const entrees = parJour.get(iso) ?? [];
                    const conge = congesAbsences.find((c) => couvre(iso, c.date_debut, c.date_fin));
                    return (
                      <td key={iso} style={cellTd()}>
                        {conge ? (
                          <span
                            className="badge"
                            style={{
                              background: conge.nature === "conge" ? CONGE_COULEUR.bg : ABSENCE_COULEUR.bg,
                              color: conge.nature === "conge" ? CONGE_COULEUR.fg : ABSENCE_COULEUR.fg,
                              display: "block",
                              textAlign: "center",
                            }}
                          >
                            {NATURE_LABEL[conge.nature]}
                          </span>
                        ) : entrees.length === 0 ? (
                          <span
                            className="badge"
                            style={{ background: REPOS_COULEUR.bg, color: REPOS_COULEUR.fg, display: "block", textAlign: "center" }}
                          >
                            Repos
                          </span>
                        ) : (
                          entrees.map((o, i) => (
                            <span
                              key={i}
                              className="badge"
                              style={{
                                background: CATEGORIE_COULEUR[o.categorie ?? "matin"].bg,
                                color: CATEGORIE_COULEUR[o.categorie ?? "matin"].fg,
                                display: "block",
                                textAlign: "center",
                                whiteSpace: "normal",
                                lineHeight: 1.4,
                                marginBottom: i < entrees.length - 1 ? 4 : 0,
                              }}
                            >
                              {heureCourte(o.heure_debut)}–{heureCourte(o.heure_fin)}
                              <br />
                              {CATEGORIE_LABEL[o.categorie ?? "matin"]}
                            </span>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 20 }}>
        <div className="card-2">
          <h4 style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-2)" }}>Résumé de la semaine</h4>
          <p style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", margin: 0 }}>
            {Math.floor(totalHeures / 60)}h{String(totalHeures % 60).padStart(2, "0")}
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "2px 0 0" }}>Heures prévues cumulées</p>
        </div>
        <div className="card-2">
          <h4 style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-2)" }}>Télétravail</h4>
          <p style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", margin: 0 }}>{nbTeletravail}</p>
          <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "2px 0 0" }}>Créneau(x) cette semaine</p>
        </div>
        <div className="card-2">
          <h4 style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-2)" }}>Formation</h4>
          <p style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", margin: 0 }}>{nbFormation}</p>
          <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "2px 0 0" }}>Créneau(x) cette semaine</p>
        </div>
        <div className="card-2">
          <h4 style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-2)" }}>Congés / absences</h4>
          <p style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", margin: 0 }}>
            {nbConges} / {nbAbsences}
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "2px 0 0" }}>En cours cette semaine — <a href="/manager/conges" style={{ color: "var(--navy)", fontWeight: 600 }}>voir les demandes</a></p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>
        Clique sur le nom d&apos;un collaborateur pour modifier son planning.
      </p>
    </main>
  );
}

function cellTh() {
  return { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", textAlign: "center" as const, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" as const };
}

function cellTd() {
  return { padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" as const, minWidth: 108 };
}
