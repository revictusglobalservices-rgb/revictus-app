"use client";

// Calcule le décalage entre l'horloge du navigateur et celle du serveur Supabase,
// pour que les chronos affichés en direct (Chrono, Pointage) restent justes même
// si l'horloge du poste client dérive de celle du serveur. Les horodatages stockés
// en base sont déjà calculés côté serveur (voir migrations 0004/0005) ; ce hook ne
// sert qu'à corriger l'AFFICHAGE en direct côté client.
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function useDecalageHorloge(supabase: SupabaseClient<Database>) {
  const [decalageMs, setDecalageMs] = useState(0);

  useEffect(() => {
    let annule = false;
    supabase.rpc("heure_serveur").then(({ data, error }) => {
      if (annule || error || !data) return;
      setDecalageMs(new Date(data).getTime() - Date.now());
    });
    return () => {
      annule = true;
    };
  }, [supabase]);

  return decalageMs;
}
