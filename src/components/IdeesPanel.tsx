"use client";

// Boîte à idées (demande d'Angelo, 07/09/2026) : chaque collaborateur propose
// une amélioration, peut la soutenir par un vote, et voit les idées des
// autres une fois validées par un admin (voir 0021_boite_a_idees.sql pour
// les règles de visibilité exactes — la RLS fait le tri, ce composant
// affiche simplement ce que Supabase renvoie).
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Idee, RoleUtilisateur } from "@/types/database";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function IconePouce({ plein }: { plein: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={plein ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v11" />
      <path d="M20.4 10.6a2 2 0 0 0-1.8-1.1H14l1-4.3a1.7 1.7 0 0 0-3.1-1.3L8 10v11h9.3a2 2 0 0 0 2-1.6l1.2-6.7a2 2 0 0 0-.1-1.1Z" />
    </svg>
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

  const recharger = useCallback(async () => {
    const { data: liste } = await supabase.from("idees").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    setIdees(liste ?? []);

    const ids = (liste ?? []).map((i) => i.id);
    if (ids.length === 0) {
      setVotes({});
      setMesVotes(new Set());
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
  }, [supabase, currentUserId]);

  useEffect(() => {
    const channel = supabase
      .channel("idees-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "idees" }, () => recharger())
      .on("postgres_changes", { event: "*", schema: "public", table: "idees_votes" }, () => recharger())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function proposer(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim()) return;
    setErreur(null);
    setEnvoi(true);
    const { error } = await supabase.from("idees").insert({
      auteur_id: currentUserId,
      titre: titre.trim(),
      description: description.trim() || null,
    } as never);
    setEnvoi(false);
    if (error) {
      setErreur("Impossible d'envoyer l'idée : " + error.message);
      return;
    }
    setTitre("");
    setDescription("");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 760 }}>
      {erreur && (
        <div style={{ background: "#fdecea", border: "1px solid var(--urgent)", color: "var(--urgent)", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}>
          {erreur}
        </div>
      )}

      <section className="card-2">
        <h3 style={{ color: "var(--navy)", marginTop: 0, marginBottom: 4 }}>Proposer une idée</h3>
        <p style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Une amélioration, un irritant à corriger, une fonctionnalité qui te manque : c&apos;est ici.
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
  );
}
