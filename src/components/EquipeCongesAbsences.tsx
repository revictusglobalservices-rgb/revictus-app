"use client";

// Congés / absences — vue globale équipe (`/manager/conges`). Décision
// (Valider/Refuser) directement depuis la liste, via les mêmes RPC que
// `CongesEditor` (voir 0016_conges_absences.sql).
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NATURE_LABEL, STATUT_COULEUR, STATUT_LABEL, TYPE_LABEL, formatPeriode } from "@/lib/congesAbsences";
import type { CongeAbsence } from "@/types/database";

export default function EquipeCongesAbsences({
  demandesInitiales,
  noms,
}: {
  demandesInitiales: CongeAbsence[];
  noms: Record<string, string>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [demandes, setDemandes] = useState<CongeAbsence[]>(demandesInitiales);
  const [erreur, setErreur] = useState<string | null>(null);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  async function rafraichir() {
    const ids = Object.keys(noms);
    if (ids.length === 0) return;
    const { data } = await supabase
      .from("conges_absences")
      .select("*")
      .in("utilisateur_id", ids)
      .is("deleted_at", null)
      .order("date_debut", { ascending: false });
    setDemandes((data ?? []) as CongeAbsence[]);
  }

  async function valider(id: string) {
    setErreur(null);
    setActionEnCours(id);
    const { error } = await supabase.rpc("valider_conge_absence", { p_id: id });
    setActionEnCours(null);
    if (error) {
      setErreur("Impossible de valider cette demande : " + error.message);
      return;
    }
    await rafraichir();
  }

  async function refuser(id: string) {
    const motif = window.prompt("Motif du refus (optionnel) :") ?? undefined;
    setErreur(null);
    setActionEnCours(id);
    const { error } = await supabase.rpc("refuser_conge_absence", { p_id: id, p_motif: motif || null });
    setActionEnCours(null);
    if (error) {
      setErreur("Impossible de refuser cette demande : " + error.message);
      return;
    }
    await rafraichir();
  }

  const enAttente = demandes.filter((d) => d.statut === "en_attente");
  const traitees = demandes.filter((d) => d.statut !== "en_attente").slice(0, 30);

  function Ligne({ d, actions }: { d: CongeAbsence; actions: boolean }) {
    return (
      <div
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
          <strong>{noms[d.utilisateur_id] ?? "—"}</strong> · {NATURE_LABEL[d.nature]} · {TYPE_LABEL[d.type]} ·{" "}
          {formatPeriode(d.date_debut, d.date_fin)}
          {d.commentaire ? <span style={{ color: "var(--ink-2)" }}> — {d.commentaire}</span> : null}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="badge" style={{ background: STATUT_COULEUR[d.statut].bg, color: STATUT_COULEUR[d.statut].fg }}>
            {STATUT_LABEL[d.statut]}
          </span>
          {actions && (
            <>
              <button
                onClick={() => valider(d.id)}
                disabled={actionEnCours === d.id}
                style={{ background: "var(--normal)", color: "#fff", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
              >
                Valider
              </button>
              <button
                onClick={() => refuser(d.id)}
                disabled={actionEnCours === d.id}
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "var(--urgent)" }}
              >
                Refuser
              </button>
            </>
          )}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {erreur && (
        <div style={{ background: "#fdecea", border: "1px solid var(--urgent)", color: "var(--urgent)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
          {erreur}
        </div>
      )}

      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--navy)" }}>En attente ({enAttente.length})</h4>
        {enAttente.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Aucune demande en attente.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {enAttente.map((d) => (
              <Ligne key={d.id} d={d} actions />
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--navy)" }}>Traitées récemment</h4>
        {traitees.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Aucune demande traitée pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {traitees.map((d) => (
              <Ligne key={d.id} d={d} actions={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
