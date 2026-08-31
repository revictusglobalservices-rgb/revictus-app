"use client";

// Tableau Kanban — glisser-déposer entre colonnes, création rapide de tâches,
// synchronisation temps réel via Supabase Realtime (section 8 du cadrage : latence < 10s).
// Phase "panneau de tâche complet" (décision du 30/08/2026) : clic sur une carte
// ouvre TacheDetail (description, échéance, assigné, priorité, commentaires +
// mentions) ; assignation + échéance dès la création ; gestion des colonnes
// réservée à l'admin via GestionColonnes ; ouverture automatique d'une tâche
// via ?tache=<id> (lien de notification, ex. mention en commentaire).
// Espace personnel / espace partagé (décision du 01/09/2026) : deux onglets sur
// le même tableau (mêmes colonnes) — "Partagé" est visible et modifiable par
// toute l'entreprise (façon Trello), "Personnel" reste filtré à ses propres
// tâches (assigné/créateur/manager/admin), comportement historique inchangé.
// Le filtrage de visibilité est fait côté RLS (0018_kanban_espace.sql) ; le
// front ne fait que trier l'ensemble déjà reçu par `espace` pour l'affichage.
// Miniature de couverture (02/09/2026, retour d'Angelo) : si une tâche a une
// image en pièce jointe, la première sert de couverture sur la carte, façon
// Trello (0019_kanban_pieces_jointes.sql pour le détail/aperçu en grand).
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ColonneKanban, EspaceTache, PrioriteTache, RoleUtilisateur, Tache } from "@/types/database";
import TacheDetail from "./TacheDetail";
import GestionColonnes from "./GestionColonnes";

type Membre = { id: string; nom: string };

const PRIORITE_LABEL: Record<PrioriteTache, string> = {
  urgent: "Urgent",
  important: "Important",
  normal: "Normal",
};

const PRIORITE_COLOR: Record<PrioriteTache, string> = {
  urgent: "var(--urgent)",
  important: "var(--important)",
  normal: "var(--normal)",
};

const BUCKET_PIECES_JOINTES = "taches-pieces-jointes";

const COLONNES_DEFAUT: Array<{ nom: string; statut_lie: Tache["statut"]; ordre: number }> = [
  { nom: "À faire", statut_lie: "a_faire", ordre: 0 },
  { nom: "En cours", statut_lie: "en_cours", ordre: 1 },
  { nom: "En attente", statut_lie: "en_attente", ordre: 2 },
  { nom: "Terminée", statut_lie: "terminee", ordre: 3 },
];

function formatEcheance(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export default function KanbanBoard({
  entrepriseId,
  currentUserId,
  role,
}: {
  entrepriseId: string;
  currentUserId: string;
  role: RoleUtilisateur;
}) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [colonnes, setColonnes] = useState<ColonneKanban[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajoutColonneId, setAjoutColonneId] = useState<string | null>(null);
  const [nouveauTitre, setNouveauTitre] = useState("");
  const [nouvellePriorite, setNouvellePriorite] = useState<PrioriteTache>("normal");
  const [nouvelAssigneId, setNouvelAssigneId] = useState(currentUserId);
  const [nouvelleEcheance, setNouvelleEcheance] = useState("");
  const [dragTacheId, setDragTacheId] = useState<string | null>(null);
  const [tacheOuverteId, setTacheOuverteId] = useState<string | null>(null);
  const [panneauColonnesOuvert, setPanneauColonnesOuvert] = useState(false);
  const [espaceActif, setEspaceActif] = useState<EspaceTache>("partage");
  const [couverturesParTache, setCouverturesParTache] = useState<Map<string, string>>(new Map());
  const deepLinkTraite = useRef(false);

  // Couvertures : une requête groupée pour trouver la première image de
  // chaque tâche, puis une seule createSignedUrls pour toutes — pas un appel
  // par carte.
  const chargerCouvertures = useCallback(
    async (tachesActuelles: Tache[]) => {
      if (tachesActuelles.length === 0) {
        setCouverturesParTache(new Map());
        return;
      }
      const { data: pieces } = await supabase
        .from("pieces_jointes")
        .select("tache_id, chemin_stockage, type_mime, created_at")
        .in(
          "tache_id",
          tachesActuelles.map((t) => t.id)
        )
        .order("created_at", { ascending: true });

      const premiereImageParTache = new Map<string, string>();
      for (const p of (pieces ?? []) as { tache_id: string; chemin_stockage: string; type_mime: string | null }[]) {
        if (p.type_mime?.startsWith("image/") && !premiereImageParTache.has(p.tache_id)) {
          premiereImageParTache.set(p.tache_id, p.chemin_stockage);
        }
      }
      if (premiereImageParTache.size === 0) {
        setCouverturesParTache(new Map());
        return;
      }

      const chemins = Array.from(premiereImageParTache.values());
      const { data: signees } = await supabase.storage.from(BUCKET_PIECES_JOINTES).createSignedUrls(chemins, 3600);
      const urlParChemin = new Map<string, string>();
      (signees ?? []).forEach((s, idx) => {
        if (s?.signedUrl) urlParChemin.set(chemins[idx], s.signedUrl);
      });

      const resultat = new Map<string, string>();
      premiereImageParTache.forEach((chemin, tacheId) => {
        const url = urlParChemin.get(chemin);
        if (url) resultat.set(tacheId, url);
      });
      setCouverturesParTache(resultat);
    },
    [supabase]
  );

  const chargerTaches = useCallback(async () => {
    const { data, error } = await supabase
      .from("taches")
      .select("*")
      .is("deleted_at", null)
      .order("ordre", { ascending: true });
    if (error) {
      setErreur(error.message);
      return;
    }
    setTaches(data ?? []);
    chargerCouvertures(data ?? []);
  }, [supabase, chargerCouvertures]);

  const chargerColonnes = useCallback(async () => {
    const { data, error } = await supabase.from("colonnes_kanban").select("*").order("ordre", { ascending: true });
    if (!error) setColonnes(data ?? []);
  }, [supabase]);

  const chargerTout = useCallback(async () => {
    setLoading(true);
    setErreur(null);

    const [{ data: cols, error: colErr }, { data: users }] = await Promise.all([
      supabase.from("colonnes_kanban").select("*").order("ordre", { ascending: true }),
      supabase.from("utilisateurs").select("id, nom"),
    ]);

    if (colErr) {
      setErreur(colErr.message);
      setLoading(false);
      return;
    }

    let colonnesFinales = cols ?? [];

    // Première utilisation : aucune colonne configurée pour l'entreprise.
    // On crée les 4 colonnes par défaut (droit réservé à l'admin par la RLS).
    if (colonnesFinales.length === 0) {
      const { data: seed, error: seedErr } = await supabase
        .from("colonnes_kanban")
        .insert(
          COLONNES_DEFAUT.map((c) => ({ ...c, entreprise_id: entrepriseId })) as never
        )
        .select("*");
      if (!seedErr && seed) {
        colonnesFinales = seed;
      }
    }

    setColonnes(colonnesFinales);
    setMembres(users ?? []);
    await chargerTaches();
    setLoading(false);
  }, [supabase, entrepriseId, chargerTaches]);

  useEffect(() => {
    chargerTout();
  }, [chargerTout]);

  // Synchronisation temps réel : toute modification de tâche par un autre
  // collaborateur/manager rafraîchit le tableau (latence visée < 10s).
  useEffect(() => {
    const channel = supabase
      .channel(`kanban-${entrepriseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "taches", filter: `entreprise_id=eq.${entrepriseId}` },
        () => chargerTaches()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, entrepriseId, chargerTaches]);

  // Ouverture automatique d'une tâche via ?tache=<id> (lien de notification,
  // ex. mention en commentaire) — une seule fois, pour ne pas rouvrir le
  // panneau si l'utilisateur le ferme.
  useEffect(() => {
    if (deepLinkTraite.current || loading) return;
    const idParam = searchParams.get("tache");
    const cible = idParam ? taches.find((t) => t.id === idParam) : null;
    if (cible) {
      setEspaceActif(cible.espace);
      setTacheOuverteId(cible.id);
      deepLinkTraite.current = true;
    }
  }, [searchParams, taches, loading]);

  const tachesEspace = useMemo(() => taches.filter((t) => t.espace === espaceActif), [taches, espaceActif]);

  const tachesParColonne = useMemo(() => {
    const map = new Map<string, Tache[]>();
    for (const col of colonnes) map.set(col.id, []);
    for (const t of tachesEspace) {
      if (t.colonne_id && map.has(t.colonne_id)) map.get(t.colonne_id)!.push(t);
    }
    return map;
  }, [colonnes, tachesEspace]);

  // Toutes espaces confondus — sert uniquement à GestionColonnes pour bloquer
  // la suppression d'une colonne qui contient encore des tâches, même si
  // l'onglet actif n'en montre aucune.
  const tachesParColonneToutes = useMemo(() => {
    const map = new Map<string, Tache[]>();
    for (const col of colonnes) map.set(col.id, []);
    for (const t of taches) {
      if (t.colonne_id && map.has(t.colonne_id)) map.get(t.colonne_id)!.push(t);
    }
    return map;
  }, [colonnes, taches]);

  const nomMembre = useCallback(
    (id: string | null) => membres.find((m) => m.id === id)?.nom ?? null,
    [membres]
  );

  const tacheOuverte = useMemo(
    () => taches.find((t) => t.id === tacheOuverteId) ?? null,
    [taches, tacheOuverteId]
  );

  function fermerPanneauTache() {
    setTacheOuverteId(null);
    if (searchParams.get("tache")) router.replace("/kanban");
    // Une pièce jointe a pu être ajoutée/supprimée pendant que le panneau était
    // ouvert — les couvertures de carte ne suivent pas le realtime sur `taches`.
    chargerCouvertures(taches);
  }

  function tacheMiseAJour(t: Tache) {
    setTaches((prev) => prev.map((p) => (p.id === t.id ? t : p)));
  }

  function tacheSupprimee(id: string) {
    setTaches((prev) => prev.filter((t) => t.id !== id));
    setTacheOuverteId(null);
    if (searchParams.get("tache")) router.replace("/kanban");
  }

  async function deposerTache(colonneCible: ColonneKanban) {
    if (!dragTacheId) return;
    const tache = taches.find((t) => t.id === dragTacheId);
    setDragTacheId(null);
    if (!tache || tache.colonne_id === colonneCible.id) return;

    const ordreCible = Math.max(0, ...(tachesParColonne.get(colonneCible.id) ?? []).map((t) => t.ordre)) + 1;

    // Mise à jour optimiste de l'affichage, puis persistance en base.
    setTaches((prev) =>
      prev.map((t) =>
        t.id === tache.id ? { ...t, colonne_id: colonneCible.id, statut: colonneCible.statut_lie, ordre: ordreCible } : t
      )
    );

    const { error } = await supabase
      .from("taches")
      .update({ colonne_id: colonneCible.id, statut: colonneCible.statut_lie, ordre: ordreCible } as never)
      .eq("id", tache.id);

    if (error) {
      setErreur("Impossible de déplacer la tâche : " + error.message);
      chargerTaches();
    }
  }

  async function creerTache(colonne: ColonneKanban) {
    const titre = nouveauTitre.trim();
    if (!titre) return;

    const ordreCible = Math.max(0, ...(tachesParColonne.get(colonne.id) ?? []).map((t) => t.ordre)) + 1;

    const { data, error } = await supabase
      .from("taches")
      .insert({
        entreprise_id: entrepriseId,
        titre,
        priorite: nouvellePriorite,
        statut: colonne.statut_lie,
        colonne_id: colonne.id,
        createur_id: currentUserId,
        assigne_id: nouvelAssigneId || null,
        echeance: nouvelleEcheance ? new Date(nouvelleEcheance + "T23:59:59").toISOString() : null,
        espace: espaceActif,
        ordre: ordreCible,
      } as never)
      .select("*")
      .single();

    if (error) {
      setErreur("Impossible de créer la tâche : " + error.message);
      return;
    }
    if (data) setTaches((prev) => [...prev, data]);
    setNouveauTitre("");
    setNouvellePriorite("normal");
    setNouvelAssigneId(currentUserId);
    setNouvelleEcheance("");
    setAjoutColonneId(null);
  }

  if (loading) {
    return <p style={{ color: "var(--ink-2)" }}>Chargement du tableau…</p>;
  }

  if (colonnes.length === 0) {
    return (
      <p style={{ color: "var(--ink-2)" }}>
        Aucune colonne configurée pour ton entreprise. Demande à un administrateur de se connecter une première
        fois pour initialiser le tableau.
      </p>
    );
  }

  return (
    <div>
      {erreur && (
        <div
          style={{
            background: "#fdecea",
            border: "1px solid var(--urgent)",
            color: "var(--urgent)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {erreur}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, background: "var(--bg)", padding: 4, borderRadius: 10 }}>
          <button
            onClick={() => setEspaceActif("partage")}
            style={{
              padding: "6px 14px",
              borderRadius: 7,
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: espaceActif === "partage" ? "var(--navy)" : "transparent",
              color: espaceActif === "partage" ? "#fff" : "var(--ink-2)",
            }}
          >
            Espace partagé
          </button>
          <button
            onClick={() => setEspaceActif("personnel")}
            style={{
              padding: "6px 14px",
              borderRadius: 7,
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: espaceActif === "personnel" ? "var(--navy)" : "transparent",
              color: espaceActif === "personnel" ? "#fff" : "var(--ink-2)",
            }}
          >
            Mon espace personnel
          </button>
        </div>

        {role === "admin" && (
          <button
            onClick={() => setPanneauColonnesOuvert(true)}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--navy)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Gérer les colonnes
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 12px" }}>
        {espaceActif === "partage"
          ? "Toutes les tâches de l'entreprise — visibles et modifiables par tout le monde."
          : "Tes tâches (assignées à toi ou créées par toi) — visibles par toi, ton manager et les admins."}
      </p>

      <div style={{ display: "flex", gap: 16, overflowX: "auto", alignItems: "flex-start" }}>
        {colonnes.map((colonne) => (
          <div
            key={colonne.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => deposerTache(colonne)}
            style={{
              flex: "0 0 280px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--border)",
                fontWeight: 600,
                color: "var(--navy)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{colonne.nom}</span>
              <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 400 }}>
                {(tachesParColonne.get(colonne.id) ?? []).length}
              </span>
            </div>

            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {(tachesParColonne.get(colonne.id) ?? []).map((tache) => {
                const enRetard = tache.echeance && tache.statut !== "terminee" && new Date(tache.echeance) < new Date();
                return (
                  <div
                    key={tache.id}
                    draggable
                    onDragStart={() => setDragTacheId(tache.id)}
                    onClick={() => setTacheOuverteId(tache.id)}
                    className="card"
                    style={{
                      background: "var(--bg)",
                      border: enRetard ? "1px solid var(--urgent)" : "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      cursor: "grab",
                    }}
                  >
                    {couverturesParTache.get(tache.id) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={couverturesParTache.get(tache.id)}
                        alt=""
                        style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6, marginBottom: 8, display: "block" }}
                      />
                    )}
                    <div style={{ fontSize: 14, marginBottom: 6 }}>{tache.titre}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: PRIORITE_COLOR[tache.priorite],
                          textTransform: "uppercase",
                        }}
                      >
                        {PRIORITE_LABEL[tache.priorite]}
                      </span>
                      {tache.echeance && (
                        <span
                          className="badge"
                          style={{
                            background: enRetard ? "var(--urgent-bg)" : "var(--bg)",
                            color: enRetard ? "var(--urgent)" : "var(--ink-2)",
                            border: enRetard ? "none" : "1px solid var(--border)",
                          }}
                        >
                          {enRetard ? "En retard · " : ""}
                          {formatEcheance(tache.echeance)}
                        </span>
                      )}
                    </div>
                    {tache.assigne_id && (
                      <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6 }}>{nomMembre(tache.assigne_id)}</div>
                    )}
                  </div>
                );
              })}

              {ajoutColonneId === colonne.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    autoFocus
                    value={nouveauTitre}
                    onChange={(e) => setNouveauTitre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") creerTache(colonne);
                      if (e.key === "Escape") setAjoutColonneId(null);
                    }}
                    placeholder="Titre de la tâche"
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 }}
                  />
                  <select
                    value={nouvellePriorite}
                    onChange={(e) => setNouvellePriorite(e.target.value as PrioriteTache)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <select
                    value={nouvelAssigneId}
                    onChange={(e) => setNouvelAssigneId(e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
                  >
                    <option value="">— Personne —</option>
                    {membres.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nom}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={nouvelleEcheance}
                    onChange={(e) => setNouvelleEcheance(e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => creerTache(colonne)}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        background: "var(--navy)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Ajouter
                    </button>
                    <button
                      onClick={() => setAjoutColonneId(null)}
                      style={{
                        padding: "6px 8px",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAjoutColonneId(colonne.id);
                    setNouveauTitre("");
                    setNouvelAssigneId(currentUserId);
                    setNouvelleEcheance("");
                  }}
                  style={{
                    background: "transparent",
                    border: "1px dashed var(--border)",
                    borderRadius: 8,
                    padding: "8px",
                    color: "var(--ink-2)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  + Ajouter une tâche
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {tacheOuverte && (
        <TacheDetail
          tache={tacheOuverte}
          membres={membres}
          currentUserId={currentUserId}
          onClose={fermerPanneauTache}
          onUpdated={tacheMiseAJour}
          onDeleted={tacheSupprimee}
        />
      )}

      {panneauColonnesOuvert && (
        <GestionColonnes
          entrepriseId={entrepriseId}
          colonnes={colonnes}
          tachesParColonne={tachesParColonneToutes}
          onClose={() => setPanneauColonnesOuvert(false)}
          onChanged={chargerColonnes}
        />
      )}
    </div>
  );
}
