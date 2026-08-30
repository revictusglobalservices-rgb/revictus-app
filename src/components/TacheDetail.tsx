"use client";

// Panneau de détail d'une tâche Kanban (décision du 30/08/2026) : description,
// échéance, assigné, priorité modifiables, + commentaires avec mention d'une
// personne (chips cliquables, pas de parsing "@Nom" — voir 0017_kanban_mentions.sql).
// RLS déjà en place (0003_policies.sql) : modification si peut_acceder(assigne_id)
// ou peut_acceder(createur_id) — donc collaborateur sur ses propres tâches,
// manager/admin sur celles de leur périmètre.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Commentaire, PrioriteTache, StatutTache, Tache } from "@/types/database";

type Membre = { id: string; nom: string };

const PRIORITE_LABEL: Record<PrioriteTache, string> = { urgent: "Urgent", important: "Important", normal: "Normal" };
const PRIORITE_COLOR: Record<PrioriteTache, string> = {
  urgent: "var(--urgent)",
  important: "var(--important)",
  normal: "var(--normal)",
};

function champStyle() {
  return { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, width: "100%" };
}
function labelStyle() {
  return { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: "var(--ink-2)" };
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function toDateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export default function TacheDetail({
  tache,
  membres,
  currentUserId,
  onClose,
  onUpdated,
}: {
  tache: Tache;
  membres: Membre[];
  currentUserId: string;
  onClose: () => void;
  onUpdated: (t: Tache) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [titre, setTitre] = useState(tache.titre);
  const [description, setDescription] = useState(tache.description ?? "");
  const [echeance, setEcheance] = useState(toDateInputValue(tache.echeance));
  const [assigneId, setAssigneId] = useState(tache.assigne_id ?? "");
  const [priorite, setPriorite] = useState<PrioriteTache>(tache.priorite);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [commentaires, setCommentaires] = useState<Commentaire[]>([]);
  const [chargementCommentaires, setChargementCommentaires] = useState(true);
  const [nouveauCommentaire, setNouveauCommentaire] = useState("");
  const [mentionsChoisies, setMentionsChoisies] = useState<string[]>([]);
  const [envoiCommentaire, setEnvoiCommentaire] = useState(false);

  const chargerCommentaires = useCallback(async () => {
    setChargementCommentaires(true);
    const { data } = await supabase
      .from("commentaires")
      .select("*")
      .eq("tache_id", tache.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setCommentaires((data ?? []) as Commentaire[]);
    setChargementCommentaires(false);
  }, [supabase, tache.id]);

  useEffect(() => {
    setTitre(tache.titre);
    setDescription(tache.description ?? "");
    setEcheance(toDateInputValue(tache.echeance));
    setAssigneId(tache.assigne_id ?? "");
    setPriorite(tache.priorite);
    chargerCommentaires();
  }, [tache, chargerCommentaires]);

  const nomMembre = useCallback((id: string | null) => membres.find((m) => m.id === id)?.nom ?? "—", [membres]);

  const estEnRetard = tache.echeance && tache.statut !== "terminee" && new Date(tache.echeance) < new Date();

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    const { data, error } = await supabase
      .from("taches")
      .update({
        titre: titre.trim() || tache.titre,
        description: description.trim() || null,
        echeance: echeance ? new Date(echeance + "T23:59:59").toISOString() : null,
        assigne_id: assigneId || null,
        priorite,
      } as never)
      .eq("id", tache.id)
      .select("*")
      .single();
    setEnregistrement(false);
    if (error) {
      setErreur("Impossible d'enregistrer : " + error.message);
      return;
    }
    if (data) onUpdated(data);
  }

  function basculerMention(id: string) {
    setMentionsChoisies((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function envoyerCommentaire() {
    const contenu = nouveauCommentaire.trim();
    if (!contenu) return;
    setEnvoiCommentaire(true);
    const { error } = await supabase.from("commentaires").insert({
      tache_id: tache.id,
      auteur_id: currentUserId,
      contenu,
      mentions: mentionsChoisies,
    } as never);
    setEnvoiCommentaire(false);
    if (error) {
      setErreur("Impossible d'envoyer le commentaire : " + error.message);
      return;
    }
    setNouveauCommentaire("");
    setMentionsChoisies([]);
    await chargerCommentaires();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15, 27, 46, 0.35)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <div
        className="card-2"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: "100%", height: "100%", borderRadius: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, padding: 24 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            style={{ ...champStyle(), fontSize: 16, fontWeight: 700, color: "var(--navy)", border: "1px solid transparent", padding: "4px 6px" }}
          />
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--ink-2)", marginLeft: 8 }}>
            ✕
          </button>
        </div>

        {erreur && (
          <div style={{ background: "#fdecea", border: "1px solid var(--urgent)", color: "var(--urgent)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
            {erreur}
          </div>
        )}

        {estEnRetard && (
          <span className="badge" style={{ background: "var(--urgent-bg)", color: "var(--urgent)", alignSelf: "flex-start" }}>
            En retard
          </span>
        )}

        <label style={labelStyle()}>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ ...champStyle(), resize: "vertical" }} />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...labelStyle(), flex: 1 }}>
            Échéance
            <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} style={champStyle()} />
          </label>
          <label style={{ ...labelStyle(), flex: 1 }}>
            Priorité
            <select value={priorite} onChange={(e) => setPriorite(e.target.value as PrioriteTache)} style={champStyle()}>
              {(Object.keys(PRIORITE_LABEL) as PrioriteTache[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={labelStyle()}>
          Assigné
          <select value={assigneId} onChange={(e) => setAssigneId(e.target.value)} style={champStyle()}>
            <option value="">— Personne —</option>
            {membres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={enregistrer}
          disabled={enregistrement}
          style={{ alignSelf: "flex-start", padding: "7px 16px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: enregistrement ? "default" : "pointer", opacity: enregistrement ? 0.6 : 1 }}
        >
          Enregistrer
        </button>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ margin: 0, fontSize: 14, color: "var(--navy)" }}>Commentaires</h4>

          {chargementCommentaires ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Chargement…</p>
          ) : commentaires.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Aucun commentaire pour l&apos;instant.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {commentaires.map((c) => (
                <div key={c.id} style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>
                    <strong style={{ color: "var(--navy)" }}>{nomMembre(c.auteur_id)}</strong>
                    <span>{formatDateTime(c.created_at)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13 }}>{c.contenu}</p>
                  {c.mentions.length > 0 && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--accent-2)" }}>
                      @{c.mentions.map((id) => nomMembre(id)).join(", @")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <textarea
            value={nouveauCommentaire}
            onChange={(e) => setNouveauCommentaire(e.target.value)}
            placeholder="Écrire un commentaire…"
            rows={2}
            style={{ ...champStyle(), resize: "vertical" }}
          />
          <div>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Taguer :</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {membres
                .filter((m) => m.id !== currentUserId)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => basculerMention(m.id)}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      fontSize: 11,
                      cursor: "pointer",
                      background: mentionsChoisies.includes(m.id) ? "var(--navy)" : "transparent",
                      color: mentionsChoisies.includes(m.id) ? "#fff" : "var(--ink-2)",
                    }}
                  >
                    @{m.nom}
                  </button>
                ))}
            </div>
          </div>
          <button
            onClick={envoyerCommentaire}
            disabled={envoiCommentaire || !nouveauCommentaire.trim()}
            style={{ alignSelf: "flex-start", padding: "6px 14px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", opacity: envoiCommentaire || !nouveauCommentaire.trim() ? 0.6 : 1 }}
          >
            Commenter
          </button>
        </div>
      </div>
    </div>
  );
}
