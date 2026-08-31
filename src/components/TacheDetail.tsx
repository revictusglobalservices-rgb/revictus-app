"use client";

// Panneau de détail d'une tâche Kanban (décision du 30/08/2026) : description,
// échéance, assigné, priorité modifiables, + commentaires avec mention d'une
// personne. La mention se saisit directement dans le champ, en tapant "@" :
// une liste de suggestions apparaît alors (façon Slack/GitHub), on choisit un
// nom au clic ou au clavier et il s'insère dans le texte (décision du
// 01/09/2026 — pas de boutons de tag séparés). Voir 0017_kanban_mentions.sql.
// Pièces jointes (02/09/2026) : bucket privé "taches-pieces-jointes" (15 Mo
// max/fichier) + table pieces_jointes, voir 0019_kanban_pieces_jointes.sql —
// suppression immédiate (pas de corbeille), téléchargement via URL signée
// (bucket privé, pas d'URL publique).
// RLS déjà en place (0003_policies.sql, 0018/0019) : modification si
// peut_acceder(assigne_id) ou peut_acceder(createur_id), ou tâche en espace
// partagé — donc collaborateur sur ses propres tâches, manager/admin sur
// celles de leur périmètre, tout le monde sur l'espace partagé.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Commentaire, PieceJointe, PrioriteTache, StatutTache, Tache } from "@/types/database";

type Membre = { id: string; nom: string };

const PRIORITE_LABEL: Record<PrioriteTache, string> = { urgent: "Urgent", important: "Important", normal: "Normal" };
const PRIORITE_COLOR: Record<PrioriteTache, string> = {
  urgent: "var(--urgent)",
  important: "var(--important)",
  normal: "var(--normal)",
};

const BUCKET_PIECES_JOINTES = "taches-pieces-jointes";
const TAILLE_MAX_OCTETS = 15 * 1024 * 1024; // 15 Mo, aligné sur file_size_limit du bucket.

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
function formatTaille(octets: number) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
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
  const [mentionsSelectionnees, setMentionsSelectionnees] = useState<{ id: string; nom: string }[]>([]);
  const [envoiCommentaire, setEnvoiCommentaire] = useState(false);
  const [suggestionsOuvertes, setSuggestionsOuvertes] = useState(false);
  const [suggestionRequete, setSuggestionRequete] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const commentaireRef = useRef<HTMLTextAreaElement | null>(null);

  const [piecesJointes, setPiecesJointes] = useState<PieceJointe[]>([]);
  const [chargementPieces, setChargementPieces] = useState(true);
  const [televersementEnCours, setTeleversementEnCours] = useState(false);
  const fichierRef = useRef<HTMLInputElement | null>(null);

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

  const chargerPiecesJointes = useCallback(async () => {
    setChargementPieces(true);
    const { data } = await supabase
      .from("pieces_jointes")
      .select("*")
      .eq("tache_id", tache.id)
      .order("created_at", { ascending: true });
    setPiecesJointes((data ?? []) as PieceJointe[]);
    setChargementPieces(false);
  }, [supabase, tache.id]);

  useEffect(() => {
    setTitre(tache.titre);
    setDescription(tache.description ?? "");
    setEcheance(toDateInputValue(tache.echeance));
    setAssigneId(tache.assigne_id ?? "");
    setPriorite(tache.priorite);
    setNouveauCommentaire("");
    setMentionsSelectionnees([]);
    setSuggestionsOuvertes(false);
    chargerCommentaires();
    chargerPiecesJointes();
  }, [tache, chargerCommentaires, chargerPiecesJointes]);

  const nomMembre = useCallback((id: string | null) => membres.find((m) => m.id === id)?.nom ?? "—", [membres]);

  const suggestionsFiltrees = useMemo(
    () =>
      membres.filter(
        (m) => m.id !== currentUserId && m.nom.toLowerCase().includes(suggestionRequete.toLowerCase())
      ),
    [membres, currentUserId, suggestionRequete]
  );

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

  async function televerserFichiers(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setErreur(null);
    setTeleversementEnCours(true);
    for (const fichier of Array.from(fichiers)) {
      if (fichier.size > TAILLE_MAX_OCTETS) {
        setErreur(`« ${fichier.name} » dépasse 15 Mo — pas envoyé.`);
        continue;
      }
      const chemin = `${tache.id}/${crypto.randomUUID()}-${fichier.name}`;
      const { error: erreurEnvoi } = await supabase.storage.from(BUCKET_PIECES_JOINTES).upload(chemin, fichier);
      if (erreurEnvoi) {
        setErreur(`Impossible d'envoyer « ${fichier.name} » : ${erreurEnvoi.message}`);
        continue;
      }
      const { error: erreurLigne } = await supabase.from("pieces_jointes").insert({
        tache_id: tache.id,
        chemin_stockage: chemin,
        nom_fichier: fichier.name,
        taille_octets: fichier.size,
        type_mime: fichier.type || null,
        auteur_id: currentUserId,
      } as never);
      if (erreurLigne) {
        setErreur(`Impossible d'enregistrer « ${fichier.name} » : ${erreurLigne.message}`);
      }
    }
    setTeleversementEnCours(false);
    if (fichierRef.current) fichierRef.current.value = "";
    await chargerPiecesJointes();
  }

  async function telechargerPieceJointe(p: PieceJointe) {
    const { data, error } = await supabase.storage.from(BUCKET_PIECES_JOINTES).createSignedUrl(p.chemin_stockage, 60);
    if (error || !data) {
      setErreur("Impossible de générer le lien de téléchargement : " + (error?.message ?? ""));
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function supprimerPieceJointe(p: PieceJointe) {
    if (!window.confirm(`Supprimer « ${p.nom_fichier} » ?`)) return;
    setErreur(null);
    const { error: erreurStockage } = await supabase.storage.from(BUCKET_PIECES_JOINTES).remove([p.chemin_stockage]);
    if (erreurStockage) {
      setErreur("Impossible de supprimer le fichier : " + erreurStockage.message);
      return;
    }
    const { error: erreurLigne } = await supabase.from("pieces_jointes").delete().eq("id", p.id);
    if (erreurLigne) {
      setErreur("Impossible de supprimer la pièce jointe : " + erreurLigne.message);
      return;
    }
    await chargerPiecesJointes();
  }

  // Détecte un "@" en cours de saisie (précédé d'un début de ligne ou d'un
  // espace, suivi d'aucun espace jusqu'au curseur) pour ouvrir la liste de
  // suggestions — la mention se tape directement dans le texte, pas de bouton.
  function onChangeCommentaire(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const valeur = e.target.value;
    setNouveauCommentaire(valeur);
    const caret = e.target.selectionStart ?? valeur.length;
    const avant = valeur.slice(0, caret);
    const correspondance = avant.match(/(?:^|\s)@([^\s@]*)$/);
    if (correspondance) {
      setSuggestionRequete(correspondance[1]);
      setSuggestionIndex(0);
      setSuggestionsOuvertes(true);
    } else {
      setSuggestionsOuvertes(false);
    }
  }

  function choisirMention(membre: Membre) {
    const el = commentaireRef.current;
    const caret = el ? el.selectionStart ?? nouveauCommentaire.length : nouveauCommentaire.length;
    const avant = nouveauCommentaire.slice(0, caret);
    const apres = nouveauCommentaire.slice(caret);
    const avantComplete = avant.replace(/@([^\s@]*)$/, "@" + membre.nom + " ");
    const texte = avantComplete + apres;
    setNouveauCommentaire(texte);
    setMentionsSelectionnees((prev) => (prev.some((m) => m.id === membre.id) ? prev : [...prev, membre]));
    setSuggestionsOuvertes(false);
    setSuggestionRequete("");
    requestAnimationFrame(() => {
      if (!el) return;
      const position = avantComplete.length;
      el.focus();
      el.setSelectionRange(position, position);
    });
  }

  function onKeyDownCommentaire(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!suggestionsOuvertes || suggestionsFiltrees.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestionIndex((i) => (i + 1) % suggestionsFiltrees.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestionIndex((i) => (i - 1 + suggestionsFiltrees.length) % suggestionsFiltrees.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choisirMention(suggestionsFiltrees[suggestionIndex] ?? suggestionsFiltrees[0]);
    } else if (e.key === "Escape") {
      setSuggestionsOuvertes(false);
    }
  }

  async function envoyerCommentaire() {
    const contenu = nouveauCommentaire.trim();
    if (!contenu) return;
    // Ne notifie que les personnes dont la mention est encore présente dans le
    // texte final (si le nom a été effacé après sélection, pas de notification).
    const mentions = mentionsSelectionnees.filter((m) => contenu.includes("@" + m.nom)).map((m) => m.id);
    setEnvoiCommentaire(true);
    const { error } = await supabase.from("commentaires").insert({
      tache_id: tache.id,
      auteur_id: currentUserId,
      contenu,
      mentions,
    } as never);
    setEnvoiCommentaire(false);
    if (error) {
      setErreur("Impossible d'envoyer le commentaire : " + error.message);
      return;
    }
    setNouveauCommentaire("");
    setMentionsSelectionnees([]);
    setSuggestionsOuvertes(false);
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

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0, fontSize: 14, color: "var(--navy)" }}>Pièces jointes</h4>
            <label
              style={{
                fontSize: 12,
                color: "var(--navy)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: televersementEnCours ? "default" : "pointer",
                opacity: televersementEnCours ? 0.6 : 1,
              }}
            >
              {televersementEnCours ? "Envoi…" : "+ Ajouter"}
              <input
                ref={fichierRef}
                type="file"
                multiple
                disabled={televersementEnCours}
                onChange={(e) => televerserFichiers(e.target.files)}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {chargementPieces ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Chargement…</p>
          ) : piecesJointes.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Aucune pièce jointe.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {piecesJointes.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--bg)",
                    borderRadius: 8,
                    padding: "6px 10px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.nom_fichier}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                      {formatTaille(p.taille_octets)} · {nomMembre(p.auteur_id)} · {formatDateTime(p.created_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => telechargerPieceJointe(p)}
                      style={{ background: "transparent", border: "none", color: "var(--accent-2)", cursor: "pointer", fontSize: 12 }}
                    >
                      Télécharger
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimerPieceJointe(p)}
                      style={{ background: "transparent", border: "none", color: "var(--urgent)", cursor: "pointer", fontSize: 12 }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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

          <div style={{ position: "relative" }}>
            <textarea
              ref={commentaireRef}
              value={nouveauCommentaire}
              onChange={onChangeCommentaire}
              onKeyDown={onKeyDownCommentaire}
              onBlur={() => window.setTimeout(() => setSuggestionsOuvertes(false), 150)}
              placeholder="Écrire un commentaire… (@ pour taguer quelqu'un)"
              rows={2}
              style={{ ...champStyle(), resize: "vertical" }}
            />
            {suggestionsOuvertes && suggestionsFiltrees.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "var(--card-shadow)",
                  overflow: "hidden",
                  minWidth: 180,
                  zIndex: 5,
                }}
              >
                {suggestionsFiltrees.map((m, idx) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choisirMention(m);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      border: "none",
                      background: idx === suggestionIndex ? "var(--bg)" : "transparent",
                      color: "var(--ink)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    @{m.nom}
                  </button>
                ))}
              </div>
            )}
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
