"use client";

// Boîte à idées (demande d'Angelo, 07/09/2026) : chaque collaborateur propose
// une amélioration, peut la soutenir par un vote, et voit les idées des
// autres une fois validées par un admin (voir 0021_boite_a_idees.sql pour
// les règles de visibilité exactes — la RLS fait le tri, ce composant
// affiche simplement ce que Supabase renvoie).
// Pièces jointes (demande d'Angelo, 08/09/2026) : capture d'écran ou fichier
// pour illustrer une idée — repris à l'identique du pattern du Kanban
// (TacheDetail.tsx / 0019_kanban_pieces_jointes.sql), voir
// 0022_idees_pieces_jointes.sql. Bucket privé (15 Mo max/fichier),
// suppression immédiate (pas de corbeille), aperçu via URL signée. Ajout
// possible dès la création de l'idée, et tant qu'elle est "en attente"
// depuis "Mes idées" (un admin peut aussi en ajouter/retirer à tout moment
// côté RLS, mais l'interface ne l'expose pas dans "À traiter" — pas utile
// pour valider/refuser).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Idee, IdeePieceJointe, RoleUtilisateur } from "@/types/database";

const STATUT_LABEL: Record<Idee["statut"], string> = {
  en_attente: "En attente",
  validee: "Validée",
  refusee: "Refusée",
};

const STATUT_COLOR: Record<Idee["statut"], string> = {
  en_attente: "var(--important)",
  validee: "var(--normal)",
  refusee: "var(--urgent)",
};

const BUCKET_PIECES_JOINTES_IDEES = "idees-pieces-jointes";
const TAILLE_MAX_OCTETS = 15 * 1024 * 1024; // 15 Mo, aligné sur file_size_limit du bucket (0022).

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTaille(octets: number) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

function IconePouce({ plein }: { plein: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={plein ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v11" />
      <path d="M20.4 10.6a2 2 0 0 0-1.8-1.1H14l1-4.3a1.7 1.7 0 0 0-3.1-1.3L8 10v11h9.3a2 2 0 0 0 2-1.6l1.2-6.7a2 2 0 0 0-.1-1.1Z" />
    </svg>
  );
}

// Liste compacte des pièces jointes d'une idée : miniature (images) ou icône
// générique, clic pour ouvrir l'aperçu. `onSupprimer` n'est fourni que là où
// la suppression est autorisée (voir peut_modifier_idee_id, 0022) — sa
// simple présence affiche ou non le bouton "✕".
function PiecesJointesListe({
  pieces,
  urlsMiniature,
  onOuvrir,
  onSupprimer,
}: {
  pieces: IdeePieceJointe[];
  urlsMiniature: Record<string, string>;
  onOuvrir: (p: IdeePieceJointe) => void;
  onSupprimer?: (p: IdeePieceJointe) => void;
}) {
  if (pieces.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg)",
            borderRadius: 8,
            padding: "4px 8px",
            maxWidth: 220,
          }}
        >
          <div
            onClick={() => onOuvrir(p)}
            title={`${p.nom_fichier} (${formatTaille(p.taille_octets)})`}
            style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, cursor: "pointer" }}
          >
            {urlsMiniature[p.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urlsMiniature[p.id]}
                alt=""
                style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 5, flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 5,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                📄
              </div>
            )}
            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom_fichier}</span>
          </div>
          {onSupprimer && (
            <button
              type="button"
              onClick={() => onSupprimer(p)}
              title="Supprimer la pièce jointe"
              style={{ background: "transparent", border: "none", color: "var(--ink-2)", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0 }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function IdeesPanel({
  currentUserId,
  role,
  ideesInitiales,
  votesInitiaux,
  mesVotesInitiaux,
}: {
  currentUserId: string;
  role: RoleUtilisateur;
  ideesInitiales: Idee[];
  votesInitiaux: Record<string, number>;
  mesVotesInitiaux: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [idees, setIdees] = useState<Idee[]>(ideesInitiales);
  const [votes, setVotes] = useState<Record<string, number>>(votesInitiaux);
  const [mesVotes, setMesVotes] = useState<Set<string>>(new Set(mesVotesInitiaux));
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [piecesJointes, setPiecesJointes] = useState<Record<string, IdeePieceJointe[]>>({});
  const [urlsMiniature, setUrlsMiniature] = useState<Record<string, string>>({});
  const [fichiersSelectionnes, setFichiersSelectionnes] = useState<File[]>([]);
  const [enCoursPiece, setEnCoursPiece] = useState<string | null>(null);
  const [apercu, setApercu] = useState<IdeePieceJointe | null>(null);
  const [apercuUrl, setApercuUrl] = useState<string | null>(null);
  const [chargementApercu, setChargementApercu] = useState(false);
  const fichierRef = useRef<HTMLInputElement | null>(null);

  const recharger = useCallback(async () => {
    const { data: liste } = await supabase.from("idees").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    setIdees(liste ?? []);

    const ids = (liste ?? []).map((i) => i.id);
    if (ids.length === 0) {
      setVotes({});
      setMesVotes(new Set());
      setPiecesJointes({});
      setUrlsMiniature({});
      return;
    }
    const { data: tousLesVotes } = await supabase.from("idees_votes").select("idee_id, utilisateur_id").in("idee_id", ids);
    const compteur: Record<string, number> = {};
    const miens = new Set<string>();
    for (const v of tousLesVotes ?? []) {
      compteur[v.idee_id] = (compteur[v.idee_id] ?? 0) + 1;
      if (v.utilisateur_id === currentUserId) miens.add(v.idee_id);
    }
    setVotes(compteur);
    setMesVotes(miens);

    const { data: pieces } = await supabase
      .from("idees_pieces_jointes")
      .select("*")
      .in("idee_id", ids)
      .order("created_at", { ascending: true });
    const toutesLesPieces = (pieces ?? []) as IdeePieceJointe[];
    const parIdee: Record<string, IdeePieceJointe[]> = {};
    for (const p of toutesLesPieces) {
      (parIdee[p.idee_id] ??= []).push(p);
    }
    setPiecesJointes(parIdee);

    // Miniatures : uniquement pour les images, une seule requête groupée
    // (createSignedUrls) plutôt qu'un appel par fichier.
    const images = toutesLesPieces.filter((p) => p.type_mime?.startsWith("image/"));
    if (images.length === 0) {
      setUrlsMiniature({});
      return;
    }
    const { data: signees } = await supabase.storage
      .from(BUCKET_PIECES_JOINTES_IDEES)
      .createSignedUrls(images.map((p) => p.chemin_stockage), 3600);
    const urls: Record<string, string> = {};
    images.forEach((p, idx) => {
      const url = signees?.[idx]?.signedUrl;
      if (url) urls[p.id] = url;
    });
    setUrlsMiniature(urls);
  }, [supabase, currentUserId]);

  useEffect(() => {
    const channel = supabase
      .channel("idees-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "idees" }, () => recharger())
      .on("postgres_changes", { event: "*", schema: "public", table: "idees_votes" }, () => recharger())
      .on("postgres_changes", { event: "*", schema: "public", table: "idees_pieces_jointes" }, () => recharger())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Envoie les fichiers passés vers le bucket de l'idée `ideeId` puis
  // enregistre leur métadonnée. N'actualise pas l'affichage lui-même —
  // l'appelant recharge après (création d'idée ou ajout depuis "Mes idées").
  async function televerserFichiers(ideeId: string, fichiers: File[]) {
    for (const fichier of fichiers) {
      if (fichier.size > TAILLE_MAX_OCTETS) {
        setErreur(`« ${fichier.name} » dépasse 15 Mo — pas envoyé.`);
        continue;
      }
      const chemin = `${ideeId}/${crypto.randomUUID()}-${fichier.name}`;
      const { error: erreurEnvoi } = await supabase.storage.from(BUCKET_PIECES_JOINTES_IDEES).upload(chemin, fichier);
      if (erreurEnvoi) {
        setErreur(`Impossible d'envoyer « ${fichier.name} » : ${erreurEnvoi.message}`);
        continue;
      }
      const { error: erreurLigne } = await supabase.from("idees_pieces_jointes").insert({
        idee_id: ideeId,
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
  }

  async function proposer(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim()) return;
    setErreur(null);
    setEnvoi(true);
    const { data, error } = await supabase
      .from("idees")
      .insert({
        auteur_id: currentUserId,
        titre: titre.trim(),
        description: description.trim() || null,
      } as never)
      .select("*")
      .single();
    if (error || !data) {
      setEnvoi(false);
      setErreur("Impossible d'envoyer l'idée : " + (error?.message ?? ""));
      return;
    }
    if (fichiersSelectionnes.length > 0) {
      await televerserFichiers(data.id, fichiersSelectionnes);
    }
    setEnvoi(false);
    setTitre("");
    setDescription("");
    setFichiersSelectionnes([]);
    recharger();
  }

  // Ajout de pièce(s) jointe(s) sur une idée déjà créée — bouton "+ Ajouter
  // un fichier" affiché sur "Mes idées" tant que le statut est "en attente".
  async function ajouterFichiers(ideeId: string, fichiers: FileList | null, inputEl: HTMLInputElement) {
    if (!fichiers || fichiers.length === 0) return;
    setErreur(null);
    setEnCoursPiece(ideeId);
    await televerserFichiers(ideeId, Array.from(fichiers));
    setEnCoursPiece(null);
    inputEl.value = "";
    recharger();
  }

  async function telechargerPieceJointe(p: IdeePieceJointe) {
    const { data, error } = await supabase.storage.from(BUCKET_PIECES_JOINTES_IDEES).createSignedUrl(p.chemin_stockage, 60);
    if (error || !data) {
      setErreur("Impossible de générer le lien de téléchargement : " + (error?.message ?? ""));
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function ouvrirApercu(p: IdeePieceJointe) {
    setApercu(p);
    setApercuUrl(null);
    const estPrevisualisable = p.type_mime?.startsWith("image/") || p.type_mime === "application/pdf";
    if (!estPrevisualisable) return;
    setChargementApercu(true);
    const { data, error } = await supabase.storage.from(BUCKET_PIECES_JOINTES_IDEES).createSignedUrl(p.chemin_stockage, 300);
    setChargementApercu(false);
    if (!error && data) setApercuUrl(data.signedUrl);
  }

  function fermerApercu() {
    setApercu(null);
    setApercuUrl(null);
  }

  async function supprimerPieceJointe(p: IdeePieceJointe) {
    if (!window.confirm(`Supprimer « ${p.nom_fichier} » ?`)) return;
    setErreur(null);
    const { error: erreurStockage } = await supabase.storage.from(BUCKET_PIECES_JOINTES_IDEES).remove([p.chemin_stockage]);
    if (erreurStockage) {
      setErreur("Impossible de supprimer le fichier : " + erreurStockage.message);
      return;
    }
    const { error: erreurLigne } = await supabase.from("idees_pieces_jointes").delete().eq("id", p.id);
    if (erreurLigne) {
      setErreur("Impossible de supprimer la pièce jointe : " + erreurLigne.message);
      return;
    }
    recharger();
  }

  async function basculerVote(idee: Idee) {
    setErreur(null);
    const déjàVoté = mesVotes.has(idee.id);
    // Optimiste : on met à jour l'affichage tout de suite, on corrige si ça échoue.
    setMesVotes((prev) => {
      const next = new Set(prev);
      déjàVoté ? next.delete(idee.id) : next.add(idee.id);
      return next;
    });
    setVotes((prev) => ({ ...prev, [idee.id]: (prev[idee.id] ?? 0) + (déjàVoté ? -1 : 1) }));

    const { error } = déjàVoté
      ? await supabase.from("idees_votes").delete().eq("idee_id", idee.id).eq("utilisateur_id", currentUserId)
      : await supabase.from("idees_votes").insert({ idee_id: idee.id, utilisateur_id: currentUserId } as never);

    if (error) {
      setErreur("Impossible d'enregistrer le vote : " + error.message);
      recharger();
    }
  }

  async function valider(id: string) {
    setErreur(null);
    setEnCours(id);
    const { error } = await supabase.rpc("valider_idee", { p_id: id });
    setEnCours(null);
    if (error) {
      setErreur("Impossible de valider : " + error.message);
      return;
    }
    recharger();
  }

  async function refuser(id: string) {
    setErreur(null);
    setEnCours(id);
    const { error } = await supabase.rpc("refuser_idee", { p_id: id });
    setEnCours(null);
    if (error) {
      setErreur("Impossible de refuser : " + error.message);
      return;
    }
    recharger();
  }

  async function supprimer(id: string) {
    if (!window.confirm("Retirer cette idée ?")) return;
    setErreur(null);
    setEnCours(id);
    const { error } = await supabase.from("idees").update({ deleted_at: new Date().toISOString() } as never).eq("id", id);
    setEnCours(null);
    if (error) {
      setErreur("Impossible de retirer cette idée : " + error.message);
      return;
    }
    setIdees((prev) => prev.filter((i) => i.id !== id));
  }

  const mesIdees = idees.filter((i) => i.auteur_id === currentUserId);
  // Filtre explicite sur "validee" : pour un collaborateur/manager la RLS ne
  // renvoie de toute façon jamais les idées non validées des autres, mais un
  // admin, lui, reçoit TOUTES les idées (RLS is_admin()) — sans ce filtre il
  // verrait ici des idées en attente ou refusées mélangées aux validées.
  const ideesDesAutres = idees
    .filter((i) => i.auteur_id !== currentUserId && i.statut === "validee")
    .sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0));

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 760 }}>
        {erreur && (
          <div style={{ background: "#fdecea", border: "1px solid var(--urgent)", color: "var(--urgent)", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}>
            {erreur}
          </div>
        )}

        <section className="card-2">
          <h3 style={{ color: "var(--navy)", marginTop: 0, marginBottom: 4 }}>Proposer une idée</h3>
          <p style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
            Une amélioration, un irritant à corriger, une fonctionnalité que te manque : c&apos;est ici.
          </p>
          <form onSubmit={proposer} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Titre de l'idée"
              maxLength={140}
              required
              style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Détails (optionnel)"
              rows={3}
              style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
            />
            <div>
              <label
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  color: "var(--navy)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                + Joindre une capture d&apos;écran ou un fichier
                <input
                  ref={fichierRef}
                  type="file"
                  multiple
                  onChange={(e) => {
                    setFichiersSelectionnes((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                    if (fichierRef.current) fichierRef.current.value = "";
                  }}
                  style={{ display: "none" }}
                />
              </label>
              {fichiersSelectionnes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {fichiersSelectionnes.map((f, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 12,
                        background: "var(--bg)",
                        borderRadius: 6,
                        padding: "3px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setFichiersSelectionnes((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ background: "transparent", border: "none", color: "var(--ink-2)", cursor: "pointer", fontSize: 12, padding: 0 }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <button
                type="submit"
                disabled={envoi || !titre.trim()}
                style={{
                  padding: "8px 18px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: envoi ? "default" : "pointer",
                  opacity: envoi || !titre.trim() ? 0.6 : 1,
                }}
              >
                {envoi ? "Envoi…" : "Envoyer l'idée"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>
            Idées de l&apos;équipe {ideesDesAutres.length > 0 && <span style={{ color: "var(--ink-2)", fontWeight: 400 }}>({ideesDesAutres.length})</span>}
          </h3>
          {ideesDesAutres.length === 0 ? (
            <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Aucune idée validée pour l&apos;instant.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ideesDesAutres.map((idee) => (
                <div key={idee.id} className="card" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <button
                    onClick={() => basculerVote(idee)}
                    title={mesVotes.has(idee.id) ? "Retirer mon soutien" : "Soutenir cette idée"}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${mesVotes.has(idee.id) ? "var(--accent)" : "var(--border)"}`,
                      background: mesVotes.has(idee.id) ? "var(--accent-2-bg)" : "transparent",
                      color: mesVotes.has(idee.id) ? "var(--accent)" : "var(--ink-2)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <IconePouce plein={mesVotes.has(idee.id)} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{votes[idee.id] ?? 0}</span>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 600 }}>{idee.titre}</span>
                      <span style={{ fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{formatDate(idee.created_at)}</span>
                    </div>
                    {idee.description && <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "4px 0 0" }}>{idee.description}</p>}
                    <PiecesJointesListe pieces={piecesJointes[idee.id] ?? []} urlsMiniature={urlsMiniature} onOuvrir={ouvrirApercu} />
                    <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "6px 0 0" }}>Proposé par {idee.auteur_nom}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Mes idées</h3>
          {mesIdees.length === 0 ? (
            <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Tu n&apos;as encore proposé aucune idée.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mesIdees.map((idee) => (
                <div key={idee.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600 }}>{idee.titre}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: STATUT_COLOR[idee.statut] }}>{STATUT_LABEL[idee.statut]}</span>
                  </div>
                  {idee.description && <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>{idee.description}</p>}
                  <PiecesJointesListe
                    pieces={piecesJointes[idee.id] ?? []}
                    urlsMiniature={urlsMiniature}
                    onOuvrir={ouvrirApercu}
                    onSupprimer={idee.statut === "en_attente" ? supprimerPieceJointe : undefined}
                  />
                  {idee.statut === "en_attente" && (
                    <label
                      style={{
                        alignSelf: "flex-start",
                        fontSize: 12,
                        color: "var(--navy)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "3px 9px",
                        cursor: enCoursPiece === idee.id ? "default" : "pointer",
                        opacity: enCoursPiece === idee.id ? 0.6 : 1,
                      }}
                    >
                      {enCoursPiece === idee.id ? "Envoi…" : "+ Ajouter un fichier"}
                      <input
                        type="file"
                        multiple
                        disabled={enCoursPiece === idee.id}
                        onChange={(e) => ajouterFichiers(idee.id, e.target.files, e.target)}
                        style={{ display: "none" }}
                      />
                    </label>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {formatDate(idee.created_at)} · {votes[idee.id] ?? 0} soutien{(votes[idee.id] ?? 0) > 1 ? "s" : ""}
                    </span>
                    {idee.statut === "en_attente" && (
                      <button
                        onClick={() => supprimer(idee.id)}
                        disabled={enCours === idee.id}
                        style={{ background: "transparent", border: "none", color: "var(--urgent)", fontSize: 12, cursor: "pointer", padding: 0 }}
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {role === "admin" && (
          <section>
            <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>À traiter</h3>
            {idees.filter((i) => i.statut === "en_attente" && i.auteur_id !== currentUserId).length === 0 ? (
              <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Aucune idée en attente de validation.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {idees
                  .filter((i) => i.statut === "en_attente" && i.auteur_id !== currentUserId)
                  .map((idee) => (
                    <div key={idee.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontWeight: 600 }}>{idee.titre}</span>
                        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{idee.auteur_nom}</span>
                      </div>
                      {idee.description && <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>{idee.description}</p>}
                      <PiecesJointesListe pieces={piecesJointes[idee.id] ?? []} urlsMiniature={urlsMiniature} onOuvrir={ouvrirApercu} />
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                          onClick={() => valider(idee.id)}
                          disabled={enCours === idee.id}
                          style={{
                            padding: "6px 16px",
                            background: "var(--normal)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: enCours === idee.id ? "default" : "pointer",
                            opacity: enCours === idee.id ? 0.6 : 1,
                          }}
                        >
                          Valider
                        </button>
                        <button
                          onClick={() => refuser(idee.id)}
                          disabled={enCours === idee.id}
                          style={{
                            padding: "6px 16px",
                            background: "transparent",
                            border: "1px solid var(--urgent)",
                            color: "var(--urgent)",
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: enCours === idee.id ? "default" : "pointer",
                            opacity: enCours === idee.id ? 0.6 : 1,
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
        )}
      </div>

      {apercu && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 27, 46, 0.7)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={fermerApercu}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {apercu.nom_fichier}
              </span>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => telechargerPieceJointe(apercu)}
                  style={{ background: "transparent", border: "none", color: "var(--accent-2)", cursor: "pointer", fontSize: 12 }}
                >
                  Télécharger
                </button>
                <button
                  type="button"
                  onClick={fermerApercu}
                  style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--ink-2)" }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div
              style={{
                padding: chargementApercu || !apercuUrl ? 32 : 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "auto",
              }}
            >
              {chargementApercu ? (
                <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Chargement de l&apos;aperçu…</p>
              ) : apercu.type_mime?.startsWith("image/") && apercuUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={apercuUrl} alt={apercu.nom_fichier} style={{ maxWidth: "88vw", maxHeight: "80vh", display: "block" }} />
              ) : apercu.type_mime === "application/pdf" && apercuUrl ? (
                <iframe src={apercuUrl} title={apercu.nom_fichier} style={{ width: "85vw", height: "80vh", border: "none" }} />
              ) : (
                <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0, maxWidth: 320, textAlign: "center" }}>
                  Aperçu non disponible pour ce type de fichier — utilise « Télécharger ».
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
