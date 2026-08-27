"use client";

// Panneau Corrections — "À valider" (managers/admins, RLS-scopé à l'équipe)
// et "Mes demandes" (historique de ses propres demandes, tous statuts).
// L'approbation/le refus passent par RPC (voir 0006_corrections_rpc.sql) :
// la mutation du pointage cible doit rester côté serveur, jamais confiée à
// ce que le client renvoie.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Correction } from "@/types/database";

const STATUT_LABEL: Record<Correction["statut"], string> = {
  en_attente: "En attente",
  approuvee: "Approuvée",
  refusee: "Refusée",
};

const STATUT_COLOR: Record<Correction["statut"], string> = {
  en_attente: "var(--important)",
  approuvee: "var(--normal)",
  refusee: "var(--urgent)",
};

function formatHeure(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateHeure(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function champ(valeur: Record<string, unknown> | null, cle: string): string | null {
  if (!valeur) return null;
  const v = valeur[cle];
  return typeof v === "string" ? v : null;
}

export default function CorrectionsPanel({
  currentUserId,
  aValiderInitial,
  mesDemandesInitiales,
  nomsAuteurs,
}: {
  currentUserId: string;
  aValiderInitial: Correction[];
  mesDemandesInitiales: Correction[];
  nomsAuteurs: Record<string, string>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [aValider, setAValider] = useState<Correction[]>(aValiderInitial);
  const [mesDemandes, setMesDemandes] = useState<Correction[]>(mesDemandesInitiales);
  const [noms, setNoms] = useState<Record<string, string>>(nomsAuteurs);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const [{ data: v }, { data: m }] = await Promise.all([
      supabase.from("corrections").select("*").eq("statut", "en_attente").neq("auteur_id", currentUserId).order("created_at", { ascending: true }),
      supabase.from("corrections").select("*").eq("auteur_id", currentUserId).order("created_at", { ascending: false }),
    ]);
    setAValider(v ?? []);
    setMesDemandes(m ?? []);

    const idsManquants = Array.from(new Set((v ?? []).map((c) => c.auteur_id))).filter((id) => !(id in noms));
    if (idsManquants.length > 0) {
      const { data: utilisateurs } = await supabase.from("utilisateurs").select("id, nom").in("id", idsManquants);
      if (utilisateurs && utilisateurs.length > 0) {
        setNoms((prev) => ({ ...prev, ...Object.fromEntries(utilisateurs.map((u) => [u.id, u.nom])) }));
      }
    }
  }, [supabase, currentUserId, noms]);

  useEffect(() => {
    const channel = supabase
      .channel("corrections-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "corrections" }, () => recharger())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function approuver(id: string) {
    setErreur(null);
    setEnCours(id);
    const { error } = await supabase.rpc("approuver_correction", { p_id: id });
    setEnCours(null);
    if (error) {
      setErreur("Impossible d'approuver : " + error.message);
      return;
    }
    setAValider((prev) => prev.filter((c) => c.id !== id));
  }

  async function refuser(id: string) {
    setErreur(null);
    setEnCours(id);
    const { error } = await supabase.rpc("refuser_correction", { p_id: id });
    setEnCours(null);
    if (error) {
      setErreur("Impossible de refuser : " + error.message);
      return;
    }
    setAValider((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 720 }}>
      {erreur && (
        <div
          style={{
            background: "#fdecea",
            border: "1px solid var(--urgent)",
            color: "var(--urgent)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 14,
          }}
        >
          {erreur}
        </div>
      )}

      <section>
        <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>À valider</h3>
        {aValider.length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Aucune demande à traiter.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {aValider.map((c) => (
              <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600 }}>{noms[c.auteur_id] ?? "Collaborateur"}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{formatDateHeure(c.created_at)}</span>
                </div>
                {c.table_cible === "pointages" && (
                  <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
                    Arrivée {formatHeure(champ(c.ancienne_valeur, "check_in"))} → {formatHeure(champ(c.nouvelle_valeur, "check_in"))} · Départ{" "}
                    {formatHeure(champ(c.ancienne_valeur, "check_out"))} → {formatHeure(champ(c.nouvelle_valeur, "check_out"))}
                  </p>
                )}
                <p style={{ fontSize: 14, margin: 0 }}>
                  <em>{c.motif}</em>
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => approuver(c.id)}
                    disabled={enCours === c.id}
                    style={{
                      padding: "6px 16px",
                      background: "var(--normal)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: enCours === c.id ? "default" : "pointer",
                      opacity: enCours === c.id ? 0.6 : 1,
                    }}
                  >
                    Approuver
                  </button>
                  <button
                    onClick={() => refuser(c.id)}
                    disabled={enCours === c.id}
                    style={{
                      padding: "6px 16px",
                      background: "transparent",
                      border: "1px solid var(--urgent)",
                      color: "var(--urgent)",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: enCours === c.id ? "default" : "pointer",
                      opacity: enCours === c.id ? 0.6 : 1,
                    }}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Mes demandes</h3>
        {mesDemandes.length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Tu n&apos;as fait aucune demande de correction.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mesDemandes.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <span>{c.motif}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: STATUT_COLOR[c.statut] }}>{STATUT_LABEL[c.statut]}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
