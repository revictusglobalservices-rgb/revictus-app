"use client";

// Gestion des colonnes Kanban — réservé admin (RLS "colonnes: gestion admin",
// 0003_policies.sql, déjà en place). Renommer, réordonner (haut/bas),
// ajouter, supprimer (bloqué si la colonne contient encore des tâches, pour
// ne jamais orpheliner une tâche silencieusement).
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ColonneKanban, StatutTache, Tache } from "@/types/database";

const STATUT_LABEL: Record<StatutTache, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  en_attente: "En attente",
  terminee: "Terminée",
};

function champStyle() {
  return { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 };
}

export default function GestionColonnes({
  entrepriseId,
  colonnes,
  tachesParColonne,
  onClose,
  onChanged,
}: {
  entrepriseId: string;
  colonnes: ColonneKanban[];
  tachesParColonne: Map<string, Tache[]>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [erreur, setErreur] = useState<string | null>(null);
  const [renommage, setRenommage] = useState<Record<string, string>>({});
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauStatut, setNouveauStatut] = useState<StatutTache>("a_faire");
  const [enCours, setEnCours] = useState(false);

  const triees = [...colonnes].sort((a, b) => a.ordre - b.ordre);

  async function renommer(colonne: ColonneKanban) {
    const nom = (renommage[colonne.id] ?? colonne.nom).trim();
    if (!nom || nom === colonne.nom) return;
    const { error } = await supabase.from("colonnes_kanban").update({ nom } as never).eq("id", colonne.id);
    if (error) {
      setErreur("Impossible de renommer : " + error.message);
      return;
    }
    onChanged();
  }

  async function deplacer(colonne: ColonneKanban, sens: -1 | 1) {
    const idx = triees.findIndex((c) => c.id === colonne.id);
    const voisin = triees[idx + sens];
    if (!voisin) return;
    setErreur(null);
    const { error: e1 } = await supabase.from("colonnes_kanban").update({ ordre: voisin.ordre } as never).eq("id", colonne.id);
    const { error: e2 } = await supabase.from("colonnes_kanban").update({ ordre: colonne.ordre } as never).eq("id", voisin.id);
    if (e1 || e2) {
      setErreur("Impossible de réordonner : " + (e1 ?? e2)!.message);
      return;
    }
    onChanged();
  }

  async function supprimer(colonne: ColonneKanban) {
    if ((tachesParColonne.get(colonne.id) ?? []).length > 0) {
      setErreur("Déplace ou termine d'abord les tâches de cette colonne avant de la supprimer.");
      return;
    }
    if (!window.confirm(`Supprimer la colonne « ${colonne.nom} » ?`)) return;
    setErreur(null);
    const { error } = await supabase.from("colonnes_kanban").delete().eq("id", colonne.id);
    if (error) {
      setErreur("Impossible de supprimer : " + error.message);
      return;
    }
    onChanged();
  }

  async function ajouter() {
    const nom = nouveauNom.trim();
    if (!nom) return;
    setErreur(null);
    setEnCours(true);
    const ordreCible = Math.max(0, ...colonnes.map((c) => c.ordre)) + 1;
    const { error } = await supabase.from("colonnes_kanban").insert({
      entreprise_id: entrepriseId,
      nom,
      statut_lie: nouveauStatut,
      ordre: ordreCible,
    } as never);
    setEnCours(false);
    if (error) {
      setErreur("Impossible d'ajouter la colonne : " + error.message);
      return;
    }
    setNouveauNom("");
    onChanged();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15, 27, 46, 0.35)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div className="card-2" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "90%", maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "var(--navy)" }}>Gérer les colonnes</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--ink-2)" }}>
            ✕
          </button>
        </div>

        {erreur && (
          <div style={{ background: "#fdecea", border: "1px solid var(--urgent)", color: "var(--urgent)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
            {erreur}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {triees.map((colonne, idx) => (
            <div key={colonne.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 8 }}>
              <input
                value={renommage[colonne.id] ?? colonne.nom}
                onChange={(e) => setRenommage((prev) => ({ ...prev, [colonne.id]: e.target.value }))}
                onBlur={() => renommer(colonne)}
                style={{ ...champStyle(), flex: 1 }}
              />
              <span style={{ fontSize: 11, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{STATUT_LABEL[colonne.statut_lie]}</span>
              <button onClick={() => deplacer(colonne, -1)} disabled={idx === 0} style={fleche()}>
                ↑
              </button>
              <button onClick={() => deplacer(colonne, 1)} disabled={idx === triees.length - 1} style={fleche()}>
                ↓
              </button>
              <button onClick={() => supprimer(colonne)} style={{ background: "transparent", border: "none", color: "var(--urgent)", cursor: "pointer", fontSize: 12 }}>
                Supprimer
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            Nouvelle colonne
            <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} placeholder="Ex. Relecture" style={champStyle()} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>
            Statut lié
            <select value={nouveauStatut} onChange={(e) => setNouveauStatut(e.target.value as StatutTache)} style={champStyle()}>
              {(Object.keys(STATUT_LABEL) as StatutTache[]).map((s) => (
                <option key={s} value={s}>
                  {STATUT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={ajouter}
            disabled={enCours}
            style={{ padding: "7px 14px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function fleche() {
  return { background: "transparent", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, cursor: "pointer", color: "var(--navy)" } as const;
}
