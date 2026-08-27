"use client";

// Panneau Pointage — check-in/check-out journalier + pauses.
// Le temps travaillé (duree_secondes) exclut le temps cumulé des pauses.
// Synchronisation temps réel via Supabase Realtime (nécessite `pointages` et
// `pauses` dans la publication `supabase_realtime`, comme pour `taches`).
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Pause, Pointage, TypePause } from "@/types/database";

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
  const [pointage, setPointage] = useState<Pointage | null>(pointageInitial);
  const [pauses, setPauses] = useState<Pause[]>(pausesInitiales);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

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

  useEffect(() => {
    if (!pointage || pointage.statut !== "ouvert") return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
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
    </div>
  );
}
