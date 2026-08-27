"use client";

// Panneau Chrono — démarrer/arrêter une session de travail liée à une tâche.
// Synchronisation temps réel via Supabase Realtime (nécessite `sessions_temps`
// dans la publication `supabase_realtime`, comme pour `taches`).
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SessionTemps, StatutTache } from "@/types/database";

type TacheOption = { id: string; titre: string; statut: StatutTache };

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

export default function ChronoPanel({
  currentUserId,
  taches,
  sessionActiveInitiale,
  sessionsRecentesInitiales,
}: {
  currentUserId: string;
  taches: TacheOption[];
  sessionActiveInitiale: SessionTemps | null;
  sessionsRecentesInitiales: SessionTemps[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [sessionActive, setSessionActive] = useState<SessionTemps | null>(sessionActiveInitiale);
  const [sessionsRecentes, setSessionsRecentes] = useState<SessionTemps[]>(sessionsRecentesInitiales);
  const [elapsed, setElapsed] = useState(0);
  const [tacheSelectionnee, setTacheSelectionnee] = useState<string>(
    sessionActiveInitiale?.tache_id ?? taches.find((t) => t.statut !== "terminee")?.id ?? ""
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const nomTache = useCallback(
    (id: string) => taches.find((t) => t.id === id)?.titre ?? "Tâche",
    [taches]
  );

  const tachesDisponibles = useMemo(() => taches.filter((t) => t.statut !== "terminee"), [taches]);

  const chargerSessions = useCallback(async () => {
    const [{ data: active }, { data: recentes }] = await Promise.all([
      supabase.from("sessions_temps").select("*").eq("utilisateur_id", currentUserId).is("fin", null).maybeSingle(),
      supabase
        .from("sessions_temps")
        .select("*")
        .eq("utilisateur_id", currentUserId)
        .not("fin", "is", null)
        .order("debut", { ascending: false })
        .limit(10),
    ]);
    setSessionActive(active ?? null);
    setSessionsRecentes(recentes ?? []);
  }, [supabase, currentUserId]);

  useEffect(() => {
    const channel = supabase
      .channel(`chrono-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions_temps", filter: `utilisateur_id=eq.${currentUserId}` },
        () => chargerSessions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, chargerSessions]);

  useEffect(() => {
    if (!sessionActive) {
      setElapsed(0);
      return;
    }
    const debutMs = new Date(sessionActive.debut).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - debutMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionActive]);

  async function demarrer() {
    if (!tacheSelectionnee) {
      setErreur("Choisis une tâche avant de démarrer.");
      return;
    }
    setErreur(null);
    setEnCours(true);
    const { data, error } = await supabase
      .from("sessions_temps")
      .insert({ tache_id: tacheSelectionnee, utilisateur_id: currentUserId, source: "chrono" } as never)
      .select("*")
      .single();
    setEnCours(false);
    if (error) {
      setErreur("Impossible de démarrer : " + error.message);
      return;
    }
    setSessionActive(data);
  }

  async function arreter() {
    if (!sessionActive) return;
    setEnCours(true);
    const fin = new Date();
    const duree = Math.max(0, Math.floor((fin.getTime() - new Date(sessionActive.debut).getTime()) / 1000));
    const { data, error } = await supabase
      .from("sessions_temps")
      .update({ fin: fin.toISOString(), duree_secondes: duree } as never)
      .eq("id", sessionActive.id)
      .select("*")
      .single();
    setEnCours(false);
    if (error) {
      setErreur("Impossible d'arrêter : " + error.message);
      return;
    }
    setSessionActive(null);
    if (data) setSessionsRecentes((prev) => [data, ...prev].slice(0, 10));
  }

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

      <section
        className="card"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 32 }}
      >
        {sessionActive ? (
          <>
            <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{nomTache(sessionActive.tache_id)}</span>
            <span style={{ fontSize: 48, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
              {formatDuree(elapsed)}
            </span>
            <button
              onClick={arreter}
              disabled={enCours}
              style={{
                padding: "10px 28px",
                background: "var(--urgent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 15,
                cursor: enCours ? "default" : "pointer",
                opacity: enCours ? 0.7 : 1,
              }}
            >
              Arrêter
            </button>
          </>
        ) : tachesDisponibles.length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: 14 }}>
            Aucune tâche à faire ne t&apos;est assignée. Va sur le Kanban pour en créer une.
          </p>
        ) : (
          <>
            <select
              value={tacheSelectionnee}
              onChange={(e) => setTacheSelectionnee(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, minWidth: 260 }}
            >
              {tachesDisponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titre}
                </option>
              ))}
            </select>
            <button
              onClick={demarrer}
              disabled={enCours}
              style={{
                padding: "10px 28px",
                background: "var(--navy)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 15,
                cursor: enCours ? "default" : "pointer",
                opacity: enCours ? 0.7 : 1,
              }}
            >
              Démarrer
            </button>
          </>
        )}
      </section>

      <section>
        <h3 style={{ color: "var(--navy)", marginBottom: 12 }}>Sessions récentes</h3>
        {sessionsRecentes.length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Aucune session terminée pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessionsRecentes.map((s) => (
              <div
                key={s.id}
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
                <span>{nomTache(s.tache_id)}</span>
                <span style={{ color: "var(--ink-2)", fontSize: 13 }}>
                  {formatHeure(s.debut)}
                  {s.fin ? ` – ${formatHeure(s.fin)}` : ""}
                </span>
                <span style={{ fontWeight: 600, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                  {formatDuree(s.duree_secondes ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
