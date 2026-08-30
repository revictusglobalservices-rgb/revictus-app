// Planning / agenda personnel — demande du 30/08/2026, refonte visuelle du
// même jour (maquettes fournies) : vue semaine par défaut, sans axe horaire
// ni tâches — uniquement les horaires de travail (couleur = catégorie) et
// "Repos" pour les jours sans occurrence. Les événements ponctuels sont
// volontairement sortis de la grille (règle UX de la maquette : le planning
// répond à "quand est-ce que je travaille ?", pas "qu'est-ce qui est prévu ?")
// et listés à part, sous "Événements à venir". Vue mois conservée en option
// pour une vision d'ensemble. Lecture seule : seul le manager/admin modifie
// (voir `/manager/equipe/[id]` et, pour la vue globale, `/manager/planning`).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CATEGORIE_COULEUR, CATEGORIE_LABEL, EVENEMENT_COULEUR, REPOS_COULEUR } from "@/lib/planningCategories";
import type { OccurrencePlanning } from "@/types/database";

const JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_LABEL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function versISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function heureCourte(heure: string | null) {
  return heure ? heure.slice(0, 5) : "";
}

// Lundi de la semaine contenant `d` (semaine FR : lundi → dimanche).
function lundiDe(d: Date) {
  const jour = d.getDay(); // 0 = dimanche
  const decalage = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(d);
  lundi.setDate(d.getDate() + decalage);
  return lundi;
}

function parseDateParam(param: string | undefined): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return new Date(param + "T00:00:00");
  return new Date();
}

function parseMoisParam(param: string | undefined): { annee: number; mois: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [a, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { annee: a, mois: m - 1 };
  }
  const maintenant = new Date();
  return { annee: maintenant.getFullYear(), mois: maintenant.getMonth() };
}

function Bloc({ occurrence }: { occurrence: OccurrencePlanning }) {
  const estEvenement = occurrence.type === "evenement";
  const couleur = estEvenement ? EVENEMENT_COULEUR : CATEGORIE_COULEUR[occurrence.categorie ?? "matin"];
  return (
    <div style={{ background: couleur.bg, color: couleur.fg, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>
        {occurrence.toute_journee ? "Journée" : `${heureCourte(occurrence.heure_debut)} – ${heureCourte(occurrence.heure_fin)}`}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
        {estEvenement ? occurrence.titre ?? "Événement" : CATEGORIE_LABEL[occurrence.categorie ?? "matin"]}
      </span>
    </div>
  );
}

export default async function PlanningPage({ searchParams }: { searchParams: { vue?: string; semaine?: string; mois?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase.from("utilisateurs").select("id, nom, role").eq("id", user.id).single();
  if (!profil) redirect("/login");

  const vue = searchParams.vue === "mois" ? "mois" : "semaine";

  // ---------------------------------------------------------------- vue semaine
  if (vue === "semaine") {
    const lundi = lundiDe(parseDateParam(searchParams.semaine));
    const jours = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lundi);
      d.setDate(lundi.getDate() + i);
      return d;
    });
    const pDebut = versISO(jours[0]);
    const pFin = versISO(jours[6]);

    const { data: occurrencesData } = await supabase.rpc("obtenir_planning", {
      p_utilisateur_id: profil.id,
      p_debut: pDebut,
      p_fin: pFin,
    });
    const occurrences = (occurrencesData ?? []) as OccurrencePlanning[];
    const shifts = occurrences.filter((o) => o.type === "horaire_travail");
    const parJour = new Map<string, OccurrencePlanning[]>();
    for (const o of shifts) parJour.set(o.jour, [...(parJour.get(o.jour) ?? []), o]);

    // Événements à venir (30 jours), séparés de la grille par design.
    const { data: evenementsData } = await supabase.rpc("obtenir_planning", {
      p_utilisateur_id: profil.id,
      p_debut: versISO(new Date()),
      p_fin: versISO(new Date(Date.now() + 30 * 86400000)),
    });
    const evenements = ((evenementsData ?? []) as OccurrencePlanning[]).filter((o) => o.type === "evenement").slice(0, 8);

    const semainePrecedente = new Date(lundi);
    semainePrecedente.setDate(lundi.getDate() - 7);
    const semaineSuivante = new Date(lundi);
    semaineSuivante.setDate(lundi.getDate() + 7);
    const aujourdhui = new Date();

    return (
      <main style={{ padding: "24px 32px" }}>
        <EnTete vue={vue} />

        <div className="card-2" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
              {jours[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – {jours[6].toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} {jours[6].getFullYear()}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a href={`/planning?vue=semaine&semaine=${versISO(semainePrecedente)}`} style={navBtn()}>
                &larr;
              </a>
              <a href="/planning?vue=semaine" style={navBtn()}>
                Aujourd&apos;hui
              </a>
              <a href={`/planning?vue=semaine&semaine=${versISO(semaineSuivante)}`} style={navBtn()}>
                &rarr;
              </a>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
            {jours.map((d) => {
              const iso = versISO(d);
              const estAujourdhui = versISO(aujourdhui) === iso;
              const entrees = parJour.get(iso) ?? [];
              return (
                <div key={iso} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>{JOURS_COURTS[d.getDay()]}. {pad2(d.getDate())}/{pad2(d.getMonth() + 1)}</div>
                    {estAujourdhui && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", margin: "4px auto 0" }} />}
                  </div>
                  {entrees.length > 0 ? (
                    entrees.map((o, i) => <Bloc key={i} occurrence={o} />)
                  ) : (
                    <div style={{ background: REPOS_COULEUR.bg, color: REPOS_COULEUR.fg, borderRadius: 10, padding: "10px 12px", textAlign: "center", fontSize: 12, fontWeight: 700 }}>
                      OFF
                      <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>(Repos)</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Legende />
        </div>

        <EvenementsAVenir evenements={evenements} />

        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>
          Ce planning est géré par ton manager (ou un admin). Pour toute modification, adresse-toi à lui directement.
        </p>
      </main>
    );
  }

  // ---------------------------------------------------------------- vue mois
  const { annee, mois } = parseMoisParam(searchParams.mois);
  const premierJour = new Date(annee, mois, 1);
  const dernierJour = new Date(annee, mois + 1, 0);
  const pDebut = `${annee}-${pad2(mois + 1)}-01`;
  const pFin = versISO(dernierJour);

  const { data: occurrencesData } = await supabase.rpc("obtenir_planning", {
    p_utilisateur_id: profil.id,
    p_debut: pDebut,
    p_fin: pFin,
  });
  const occurrences = ((occurrencesData ?? []) as OccurrencePlanning[]).filter((o) => o.type === "horaire_travail");
  const parJour = new Map<string, OccurrencePlanning[]>();
  for (const o of occurrences) parJour.set(o.jour, [...(parJour.get(o.jour) ?? []), o]);

  const moisPrecedent = new Date(annee, mois - 1, 1);
  const moisSuivant = new Date(annee, mois + 1, 1);
  const moisPrecedentParam = `${moisPrecedent.getFullYear()}-${pad2(moisPrecedent.getMonth() + 1)}`;
  const moisSuivantParam = `${moisSuivant.getFullYear()}-${pad2(moisSuivant.getMonth() + 1)}`;

  const premierJourSemaine = (premierJour.getDay() + 6) % 7; // grille lundi-dimanche
  const nbJours = dernierJour.getDate();
  const cellules: (number | null)[] = [...Array(premierJourSemaine).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];
  while (cellules.length % 7 !== 0) cellules.push(null);

  const aujourdhui = new Date();
  const estMoisCourant = aujourdhui.getFullYear() === annee && aujourdhui.getMonth() === mois;

  return (
    <main style={{ padding: "24px 32px" }}>
      <EnTete vue={vue} />

      <div className="card-2" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
            {MOIS_LABEL[mois]} {annee}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href={`/planning?vue=mois&mois=${moisPrecedentParam}`} style={navBtn()}>
              &larr;
            </a>
            <a href="/planning?vue=mois" style={navBtn()}>
              Aujourd&apos;hui
            </a>
            <a href={`/planning?vue=mois&mois=${moisSuivantParam}`} style={navBtn()}>
              &rarr;
            </a>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((j) => (
            <div key={j} style={{ padding: "10px 8px", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", textAlign: "center" }}>
              {j}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cellules.map((jourNum, idx) => {
            if (jourNum === null) {
              return <div key={idx} style={{ minHeight: 88, borderTop: "1px solid var(--border)", borderLeft: idx % 7 !== 0 ? "1px solid var(--border)" : undefined, background: "var(--bg)" }} />;
            }
            const dateStr = `${annee}-${pad2(mois + 1)}-${pad2(jourNum)}`;
            const entrees = parJour.get(dateStr) ?? [];
            const estAujourdhui = estMoisCourant && aujourdhui.getDate() === jourNum;
            return (
              <div key={idx} style={{ minHeight: 88, padding: 6, borderTop: "1px solid var(--border)", borderLeft: idx % 7 !== 0 ? "1px solid var(--border)" : undefined, display: "flex", flexDirection: "column", gap: 3 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: estAujourdhui ? 700 : 500,
                    color: estAujourdhui ? "#fff" : "var(--ink-2)",
                    background: estAujourdhui ? "var(--accent)" : "transparent",
                    borderRadius: 999,
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {jourNum}
                </span>
                {entrees.length === 0 ? (
                  <span style={{ fontSize: 10, fontWeight: 600, color: REPOS_COULEUR.fg }}>OFF</span>
                ) : (
                  entrees.map((o, i) => (
                    <span
                      key={i}
                      className="badge"
                      style={{
                        background: CATEGORIE_COULEUR[o.categorie ?? "matin"].bg,
                        color: CATEGORIE_COULEUR[o.categorie ?? "matin"].fg,
                        display: "block",
                        textAlign: "left",
                        whiteSpace: "normal",
                        lineHeight: 1.3,
                      }}
                    >
                      {heureCourte(o.heure_debut)}–{heureCourte(o.heure_fin)}
                    </span>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 16 }}>
        Ce planning est géré par ton manager (ou un admin). Pour toute modification, adresse-toi à lui directement.
      </p>
    </main>
  );
}

function EnTete({ vue }: { vue: "semaine" | "mois" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
      <h1 style={{ color: "var(--navy)", margin: 0 }}>Mon planning</h1>
      <div style={{ display: "flex", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
        <a href="/planning?vue=semaine" style={toggleBtn(vue === "semaine")}>
          Semaine
        </a>
        <a href="/planning?vue=mois" style={toggleBtn(vue === "mois")}>
          Mois
        </a>
      </div>
    </div>
  );
}

function Legende() {
  const items: { label: string; couleur: { bg: string; fg: string } }[] = [
    { label: "Matin", couleur: CATEGORIE_COULEUR.matin },
    { label: "Après-midi", couleur: CATEGORIE_COULEUR.apres_midi },
    { label: "Journée", couleur: CATEGORIE_COULEUR.journee },
    { label: "Soir / Télétravail / Formation", couleur: CATEGORIE_COULEUR.soir },
    { label: "Repos", couleur: REPOS_COULEUR },
  ];
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: it.couleur.fg, display: "inline-block" }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function EvenementsAVenir({ evenements }: { evenements: OccurrencePlanning[] }) {
  return (
    <div className="card-2" style={{ padding: 20 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--navy)" }}>Événements à venir</h3>
      {evenements.length === 0 ? (
        <p style={{ color: "var(--ink-2)", fontSize: 14, margin: 0 }}>Aucun événement prévu.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {evenements.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg)", borderRadius: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: "var(--navy)" }}>{e.titre ?? "Événement"}</span>
              <span style={{ color: "var(--ink-2)" }}>
                {new Date(e.jour + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                {e.toute_journee ? "" : ` · ${e.heure_debut?.slice(0, 5)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function navBtn() {
  return { padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "var(--navy)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 6 } as const;
}

function toggleBtn(actif: boolean) {
  return {
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: actif ? "#fff" : "var(--ink-2)",
    background: actif ? "var(--navy)" : "transparent",
    borderRadius: 6,
    textDecoration: "none",
  } as const;
}
