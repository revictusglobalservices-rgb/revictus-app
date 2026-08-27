"use client";

// Mini-chrono affiché sur le tableau de bord — même logique de synchronisation
// d'horloge que /chrono (voir useDecalageHorloge), mais lecture seule : les
// actions démarrer/arrêter restent sur l'écran Chrono complet.
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDecalageHorloge } from "@/lib/useDecalageHorloge";
import type { SessionTemps } from "@/types/database";

function formatDuree(totalSecondes: number) {
  const s = Math.max(0, Math.floor(totalSecondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export default function ChronoWidget({
  sessionActive,
  tacheTitre,
}: {
  sessionActive: SessionTemps | null;
  tacheTitre: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const decalageMs = useDecalageHorloge(supabase);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!sessionActive) return;
    const debutMs = new Date(sessionActive.debut).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() + decalageMs - debutMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionActive, decalageMs]);

  if (!sessionActive) {
    return (
      <>
        <p style={{ color: "var(--ink-2)" }}>Aucune session en cours.</p>
        <a href="/chrono" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>
          Démarrer &rarr;
        </a>
      </>
    );
  }

  return (
    <>
      <p style={{ color: "var(--ink-2)", marginBottom: 4, fontSize: 14 }}>{tacheTitre ?? "Tâche"}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums", margin: "0 0 6px" }}>
        {formatDuree(elapsed)}
      </p>
      <a href="/chrono" style={{ fontSize: 13, color: "var(--navy)", fontWeight: 600 }}>
        Voir &rarr;
      </a>
    </>
  );
}
