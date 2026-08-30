// Planning / agenda personnel — demande du 30/08/2026 : chaque collaborateur
// voit son planning (horaires de travail prévus + événements ponctuels) en
// lecture seule ; seul son manager ou un admin peut le modifier (voir
// `/manager/equipe/[id]`, section Planning). Vue mensuelle simple : la
// recomposition récurrences/exceptions est déjà faite côté base par
// `obtenir_planning()` (0013_planning.sql).
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { OccurrencePlanning } from "@/types/database";

const JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_LABEL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseMois(param: string | undefined): { annee: number; mois: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [a, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { annee: a, mois: m - 1 };
  }
  const maintenant = new Date();
  return { annee: maintenant.getFullYear(), mois: maintenant.getMonth() };
}

function heureCourte(heure: string | null) {
  return heure ? heure.slice(0, 5) : "";
}

export default async function PlanningPage({ searchParams }: { searchParams: { mois?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase.from("utilisateurs").select("id, nom, role").eq("id", user.id).single();
  if (!profil) redirect("/login");

  const { annee, mois } = parseMois(searchParams.mois);
  const premierJour = new Date(annee, mois, 1);
  const dernierJour = new Date(annee, mois + 1, 0);
  const pDebut = `${annee}-${pad2(mois + 1)}-01`;
  const pFin = `${dernierJour.getFullYear()}-${pad2(dernierJour.getMonth() + 1)}-${pad2(dernierJour.getDate())}`;

  const { data: occurrences } = await supabase.rpc("obtenir_planning", {
    p_utilisateur_id: profil.id,
    p_debut: pDebut,
    p_fin: pFin,
  });

  const parJour = new Map<string, OccurrencePlanning[]>();
  for (const o of (occurrences ?? []) as OccurrencePlanning[]) {
    const liste = parJour.get(o.jour) ?? [];
    liste.push(o);
    parJour.set(o.jour, liste);
  }
  for (const liste of parJour.values()) {
    liste.sort((a, b) => (a.toute_journee ? -1 : 1) - (b.toute_journee ? -1 : 1) || (a.heure_debut ?? "").localeCompare(b.heure_debut ?? ""));
  }

  const moisPrecedent = new Date(annee, mois - 1, 1);
  const moisSuivant = new Date(annee, mois + 1, 1);
  const moisPrecedentParam = `${moisPrecedent.getFullYear()}-${pad2(moisPrecedent.getMonth() + 1)}`;
  const moisSuivantParam = `${moisSuivant.getFullYear()}-${pad2(moisSuivant.getMonth() + 1)}`;

  const premierJourSemaine = premierJour.getDay(); // 0 = dimanche
  const nbJours = dernierJour.getDate();
  const cellules: (number | null)[] = [...Array(premierJourSemaine).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];
  while (cellules.length % 7 !== 0) cellules.push(null);

  const aujourdhui = new Date();
  const estMoisCourant = aujourdhui.getFullYear() === annee && aujourdhui.getMonth() === mois;

  return (
    <main style={{ padding: "24px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ color: "var(--navy)", margin: 0 }}>Planning</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href={`/planning?mois=${moisPrecedentParam}`} style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>
            &larr; Précédent
          </a>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)", minWidth: 150, textAlign: "center" }}>
            {MOIS_LABEL[mois]} {annee}
          </span>
          <a href={`/planning?mois=${moisSuivantParam}`} style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>
            Suivant &rarr;
          </a>
        </div>
      </div>

      <div className="card-2" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
          {JOURS_COURTS.map((j) => (
            <div key={j} style={{ padding: "10px 8px", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", textAlign: "center" }}>
              {j}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cellules.map((jourNum, idx) => {
            if (jourNum === null) {
              return <div key={idx} style={{ minHeight: 96, borderTop: "1px solid var(--border)", borderLeft: idx % 7 !== 0 ? "1px solid var(--border)" : undefined, background: "var(--bg)" }} />;
            }
            const dateStr = `${annee}-${pad2(mois + 1)}-${pad2(jourNum)}`;
            const entrees = parJour.get(dateStr) ?? [];
            const estAujourdhui = estMoisCourant && aujourdhui.getDate() === jourNum;
            return (
              <div
                key={idx}
                style={{
                  minHeight: 96,
                  padding: 6,
                  borderTop: "1px solid var(--border)",
                  borderLeft: idx % 7 !== 0 ? "1px solid var(--border)" : undefined,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
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
                {entrees.map((e, i) => (
                  <span
                    key={i}
                    className="badge"
                    style={{
                      background: e.type === "evenement" ? "var(--accent-2-bg)" : "var(--normal-bg)",
                      color: e.type === "evenement" ? "var(--accent-2)" : "var(--normal)",
                      display: "block",
                      textAlign: "left",
                      whiteSpace: "normal",
                      lineHeight: 1.3,
                    }}
                    title={e.description ?? undefined}
                  >
                    {e.toute_journee ? "Journée" : `${heureCourte(e.heure_debut)}–${heureCourte(e.heure_fin)}`}
                    {e.titre ? ` · ${e.titre}` : ""}
                  </span>
                ))}
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
