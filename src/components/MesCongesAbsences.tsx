"use client";

// Demande de congé / signalement d'absence — collaborateur (page `/conges`).
// Le collaborateur ne peut agir que sur ses propres demandes : soumettre
// (reste "en_attente" jusqu'à décision du manager/admin — forcé côté base,
// voir 0016_conges_absences.sql) et annuler tant que non traitée.
import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NATURE_LABEL, STATUT_COULEUR, STATUT_LABEL, TYPES_PAR_NATURE, TYPE_LABEL, formatPeriode } from "@/lib/congesAbsences";
import type { CongeAbsence, NatureCongeAbsence, TypeCongeAbsence } from "@/types/database";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function champStyle() {
  return { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 };
}

function labelStyle() {
  return { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: "var(--ink-2)" };
}

export default function MesCongesAbsences({
  utilisateurId,
  entrepriseId,
  demandesInitiales,
}: {
  utilisateurId: string;
  entrepriseId: string;
  demandesInitiales: CongeAbsence[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [demandes, setDemandes] = useState<CongeAbsence[]>(demandesInitiales);
  const [erreur, setErreur] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    const { data } = await supabase
      .from("conges_absences")
      .select("*")
      .eq("utilisateur_id", utilisateurId)
      .is("deleted_at", null)
      .order("date_debut", { ascending: false });
    setDemandes((data ?? []) as CongeAbsence[]);
  }, [supabase, utilisateurId]);

  const [nature, setNature] = useState<NatureCongeAbsence>("conge");
  const [type, setType] = useState<TypeCongeAbsence>("conge_paye");
  const [dateDebut, setDateDebut] = useState(todayISO());
  const [dateFin, setDateFin] = useState(todayISO());
  const [commentaire, setCommentaire] = useState("");
  const [enCours, setEnCours] = useState(false);

  function changerNature(n: NatureCongeAbsence) {
    setNature(n);
    setType(TYPES_PAR_NATURE[n][0]);
  }

  async function soumettre() {
    if (dateFin < dateDebut) {
      setErreur("La date de fin doit être après la date de début.");
      return;
    }
    setErreur(null);
    setEnCours(true);
    const { error } = await supabase.from("conges_absences").insert({
      utilisateur_id: utilisateurId,
      entreprise_id: entrepriseId,
      nature,
      type,
      date_debut: dateDebut,
      date_fin: dateFin,
      commentaire: commentaire.trim() || null,
      createur_id: utilisateurId,
    });
    setEnCours(false);
    if (error) {
      setErreur("Impossible d'envoyer la demande : " + error.message);
      return;
    }
    setCommentaire("");
    await rafraichir();
  }

  async function annuler(id: string) {
    setErreur(null);
    const { error } = await supabase.from("conges_absences").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      setErreur("Impossible d'annuler cette demande : " + error.message);
      return;
    }
    await rafraichir();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {erreur && (
        <div style={{ background: "#fdecea", border: "1px solid var(--urgent)", color: "var(--urgent)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
          {erreur}
        </div>
      )}

      <div className="card-2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14, color: "var(--navy)" }}>Nouvelle demande</h4>
        <div style={{ display: "flex", gap: 6 }}>
          {(["conge", "absence"] as NatureCongeAbsence[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => changerNature(n)}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: nature === n ? "var(--navy)" : "transparent",
                color: nature === n ? "#fff" : "var(--ink-2)",
              }}
            >
              {NATURE_LABEL[n]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={labelStyle()}>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as TypeCongeAbsence)} style={champStyle()}>
              {TYPES_PAR_NATURE[nature].map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle()}>
            Du
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={champStyle()} />
          </label>
          <label style={labelStyle()}>
            Au
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={champStyle()} />
          </label>
        </div>
        <label style={labelStyle()}>
          Commentaire (optionnel)
          <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} style={{ ...champStyle(), resize: "vertical" }} />
        </label>
        <button
          onClick={soumettre}
          disabled={enCours}
          style={{ alignSelf: "flex-start", padding: "7px 16px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: enCours ? "default" : "pointer", opacity: enCours ? 0.6 : 1 }}
        >
          Envoyer la demande
        </button>
      </div>

      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--navy)" }}>Mes demandes</h4>
        {demandes.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Aucune demande pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {demandes.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span>
                  <strong>{NATURE_LABEL[d.nature]}</strong> · {TYPE_LABEL[d.type]} · {formatPeriode(d.date_debut, d.date_fin)}
                  {d.commentaire ? <span style={{ color: "var(--ink-2)" }}> — {d.commentaire}</span> : null}
                  {d.statut === "refusee" && d.motif_refus ? (
                    <span style={{ color: "var(--urgent)" }}> — Motif : {d.motif_refus}</span>
                  ) : null}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="badge" style={{ background: STATUT_COULEUR[d.statut].bg, color: STATUT_COULEUR[d.statut].fg }}>
                    {STATUT_LABEL[d.statut]}
                  </span>
                  {d.statut === "en_attente" && (
                    <button
                      onClick={() => annuler(d.id)}
                      style={{ background: "transparent", border: "none", color: "var(--urgent)", fontSize: 12, cursor: "pointer" }}
                    >
                      Annuler
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
