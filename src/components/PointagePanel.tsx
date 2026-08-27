"use client";

// Panneau Pointage — check-in/check-out journalier + pauses.
// Le temps travaillé (duree_secondes) exclut le temps cumulé des pauses.
// Synchronisation temps réel via Supabase Realtime (nécessite `pointages` et
// `pauses` dans la publication `supabase_realtime`, comme pour `taches`).
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDecalageHorloge } from "@/lib/useDecalageHorloge";
import type { Correction, Pause, Pointage, TypePause } from "@/types/database";

const PAUSE_LABEL: Record<TypePause, string> = {
  petite_pause: "Petite pause",
  pause_dejeuner: "Pause déjeuner",
  permission: "Permission",
};

function formatDuree(totalSecondes: number) {
  const s = Math.max(0, Math.floor(totalSecondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function PointagePanel({
  currentUserId,
  dateDuJour,
  pointageInitial,
  pausesInitiales,
}: {
  currentUserId: string;
  dateDuJour: string;
  pointageInitial: Pointage | null;
  pausesInitiales: Pause[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const decalageMs = useDecalageHorloge(supabase);
  const [pointage, setPointage] = useState<Pointage | null>(pointageInitial);
  const [pauses, setPauses] = useState<Pause[]>(pausesInitiales);
  const [horlogeLocale, setHorlogeLocale] = useState(() => Date.now());
  const maintenant = horlogeLocale + decalageMs;
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Demande de correction (section 6) : uniquement possible une fois le
  // pointage clos. La demande elle-même est un insert direct (l'heure
  // choisie vient de l'utilisateur, ce n'est pas une action "maintenant") ;
  // seule l'approbation par le manager mute le pointage, via RPC.
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nouvelleArrivee, setNouvelleArrivee] = useState("");
  const [nouveauDepart, setNouveauDepart] = useState("");
  const [motif, setMotif] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const pauseActive = useMemo(() => pauses.find((p) => !p.fin) ?? null, [pauses]);

  const chargerPointage = useCallback(async () => {
    const { data: p } = await supabase
      .from("pointages")
      .select("*")
      .eq("utilisateur_id", currentUserId)
      .eq("date", dateDuJour)
      .maybeSingle();
    setPointage(p ?? null);
    if (p) {
      const { data: ps } = await supabase.from("pauses").select("*").eq("pointage_id", p.id).order("debut", { ascending: true });
      setPauses(ps ?? []);
    } else {
      setPauses([]);
    }
  }, [supabase, currentUserId, dateDuJour]);

  useEffect(() => {
    const channel = supabase
      .channel(`pointage-${currentUserId}-${dateDuJour}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pointages", filter: `utilisateur_id=eq.${currentUserId}` },
        () => chargerPointage()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, dateDuJour, chargerPointage]);

  const chargerCorrections = useCallback(async () => {
    if (!pointage) {
      setCorrections([]);
      return;
    }
    const { data } = await supabase
      .from("corrections")
      .select("*")
      .eq("table_cible", "pointages")
      .eq("ligne_id", pointage.id)
      .order("created_at", { ascending: false });
    setCorrections(data ?? []);
  }, [supabase, pointage]);

  useEffect(() => {
    chargerCorrections();
  }, [chargerCorrections]);

  useEffect(() => {
    if (!pointage) return;
    const channel = supabase
      .channel(`corrections-pointage-${pointage.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corrections", filter: `ligne_id=eq.${pointage.id}` },
        () => chargerCorrections()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, pointage, chargerCorrections]);

  useEffect(() => {
    if (!pointage || pointage.statut !== "ouvert") return;
    const id = setInterval(() => setHorlogeLocale(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pointage]);

  const secondesPauses = useMemo(() => {
    return pauses.reduce((total, p) => {
      const debut = new Date(p.debut).getTime();
      const fin = p.fin ? new Date(p.fin).getTime() : maintenant;
      return total + Math.max(0, Math.floor((fin - debut) / 1000));
    }, 0);
  }, [pauses, maintenant]);

  const secondesEcoulees = useMemo(() => {
    if (!pointage?.check_in) return 0;
    const fin = pointage.check_out ? new Date(pointage.check_out).getTime() : maintenant;
    return Math.max(0, Math.floor((fin - new Date(pointage.check_in).getTime()) / 1000));
  }, [pointage, maintenant]);

  // Toutes les heures (arrivée, départ, début/fin de pause) sont calculées
  // côté serveur (fonctions RPC, `now()` Postgres) pour ne jamais dépendre de
  // l'horloge du poste client — un écart d'horloge navigateur/serveur peut
  // sinon produire des durées négatives ou incohérentes entre pause et pointage.
  async function pointerArrivee() {
    setErreur(null);
    setEnCours(true);
    const { data, error } = await supabase.rpc("pointer_arrivee", { p_date: dateDuJour });
    setEnCours(false);
    if (error) {
      setErreur("Impossible de pointer l'arrivée : " + error.message);
      return;
    }
    setPointage(data);
  }

  async function pointerDepart() {
    if (!pointage) return;
    if (pauseActive) {
      setErreur("Termine la pause en cours avant de pointer ton départ.");
      return;
    }
    setErreur(null);
    setEnCours(true);
    const { data, error } = await supabase.rpc("pointer_depart", { p_id: pointage.id });
    setEnCours(false);
    if (error) {
      setErreur("Impossible de pointer le départ : " + error.message);
      return;
    }
    setPointage(data);
  }

  async function demarrerPause(type: TypePause) {
    if (!pointage) return;
    setErreur(null);
    setEnCours(true);
    const { data, error } = await supabase.rpc("demarrer_pause", { p_pointage_id: pointage.id, p_type: type });
    setEnCours(false);
    if (error) {
      setErreur("Impossible de démarrer la pause : " + error.message);
      return;
    }
    setPauses((prev) => [...prev, data]);
  }

  async function terminerPause() {
    if (!pauseActive) return;
    setErreur(null);
    setEnCours(true);
    const { data, error } = await supabase.rpc("terminer_pause", { p_pause_id: pauseActive.id });
    setEnCours(false);
    if (error) {
      setErreur("Impossible de terminer la pause : " + error.message);
      return;
    }
    setPauses((prev) => prev.map((p) => (p.id === data.id ? data : p)));
  }

  function ouvrirFormulaireCorrection() {
    if (!pointage) return;
    const heureLocale = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");
    setNouvelleArrivee(heureLocale(pointage.check_in));
    setNouveauDepart(heureLocale(pointage.check_out));
    setMotif("");
    setErreur(null);
    setFormulaireOuvert(true);
  }

  async function demanderCorrection() {
    if (!pointage) return;
    if (!motif.trim()) {
      setErreur("Merci d'indiquer le motif de la correction.");
      return;
    }
    setErreur(null);
    setEnvoiEnCours(true);

    const versISO = (heure: string) => {
      if (!heure) return null;
      const [h, m] = heure.split(":").map(Number);
      const d = new Date(pointage.date + "T00:00:00");
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };

    const { error } = await supabase.from("corrections").insert({
      table_cible: "pointages",
      ligne_id: pointage.id,
      auteur_id: currentUserId,
      ancienne_valeur: { check_in: pointage.check_in, check_out: pointage.check_out },
      nouvelle_valeur: { check_in: versISO(nouvelleArrivee), check_out: versISO(nouveauDepart) },
      motif: motif.trim(),
    });

    setEnvoiEnCours(false);
    if (error) {
      setErreur("Impossible d'envoyer la demande : " + error.message);
      return;
    }
    setFormulaireOuvert(false);
    chargerCorrections();
  }

  const boutonStyle = (couleur: string, actif = true) => ({
    padding: "10px 24px",
    background: couleur,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    cursor: actif ? "pointer" : "default",
    opacity: actif ? 1 : 0.6,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
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

      <section className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 32 }}>
        {!pointage ? (
          <>
            <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Tu n&apos;as pas encore pointé aujourd&apos;hui.</p>
            <button onClick={pointerArrivee} disabled={enCours} style={boutonStyle("var(--navy)", !enCours)}>
              Pointer l&apos;arrivée
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14, color: "var(--ink-2)" }}>
              Arrivée à {formatHeure(pointage.check_in!)}
              {pointage.check_out ? ` · Départ à ${formatHeure(pointage.check_out)}` : ""}
            </span>
            <span style={{ fontSize: 40, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
              {formatDuree(pointage.statut === "ferme" ? pointage.duree_secondes ?? 0 : secondesEcoulees - secondesPauses)}
            </span>
            {secondesPauses > 0 && (
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>dont {formatDuree(secondesPauses)} de pause</span>
            )}

            {pointage.statut === "ouvert" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
                {pauseActive ? (
                  <button onClick={terminerPause} disabled={enCours} style={boutonStyle("var(--important)", !enCours)}>
                    Terminer la pause ({PAUSE_LABEL[pauseActive.type]})
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    {(Object.keys(PAUSE_LABEL) as TypePause[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => demarrerPause(type)}
                        disabled={enCours}
                        style={{
                          padding: "6px 14px",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: enCours ? "default" : "pointer",
                          color: "var(--navy)",
                        }}
                      >
                        {PAUSE_LABEL[type]}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={pointerDepart} disabled={enCours || !!pauseActive} style={boutonStyle("var(--urgent)", !enCours && !pauseActive)}>
                  Pointer le départ
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {pauses.length > 0 && (
        <section>
          <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Pauses du jour</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pauses.map((p) => (
              <div
                key={p.id}
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
                <span>{PAUSE_LABEL[p.type]}</span>
                <span style={{ color: "var(--ink-2)", fontSize: 13 }}>
                  {formatHeure(p.debut)}
                  {p.fin ? ` – ${formatHeure(p.fin)}` : " – en cours"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {pointage && pointage.statut === "ferme" && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ color: "var(--navy)", margin: 0 }}>Corrections</h3>
            {!formulaireOuvert && (
              <button
                onClick={ouvrirFormulaireCorrection}
                style={{
                  padding: "6px 14px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                  color: "var(--navy)",
                }}
              >
                Demander une correction
              </button>
            )}
          </div>

          {formulaireOuvert && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-2)" }}>
                  Heure d&apos;arrivée
                  <input
                    type="time"
                    value={nouvelleArrivee}
                    onChange={(e) => setNouvelleArrivee(e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-2)" }}>
                  Heure de départ
                  <input
                    type="time"
                    value={nouveauDepart}
                    onChange={(e) => setNouveauDepart(e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 }}
                  />
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--ink-2)" }}>
                Motif
                <textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  rows={2}
                  placeholder="Explique la raison de cette correction…"
                  style={{ padding: "8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, resize: "vertical" }}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={demanderCorrection}
                  disabled={envoiEnCours}
                  style={{ ...boutonStyle("var(--navy)", !envoiEnCours), padding: "8px 18px", fontSize: 14 }}
                >
                  Envoyer la demande
                </button>
                <button
                  onClick={() => setFormulaireOuvert(false)}
                  disabled={envoiEnCours}
                  style={{
                    padding: "8px 18px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: envoiEnCours ? "default" : "pointer",
                    color: "var(--ink-2)",
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {corrections.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {corrections.map((c) => (
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
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color:
                        c.statut === "approuvee" ? "var(--normal)" : c.statut === "refusee" ? "var(--urgent)" : "var(--important)",
                    }}
                  >
                    {c.statut === "approuvee" ? "Approuvée" : c.statut === "refusee" ? "Refusée" : "En attente"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
