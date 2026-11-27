// Écran Pointage — section 4 du cadrage : check-in/check-out journalier,
// gestion des pauses (petite pause / pause déjeuner / permission).
// Note : jour calculé en UTC pour le MVP — à affiner sur le fuseau de
// l'entreprise (Indian/Antananarivo) si des écarts sont constatés en test.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PointagePanel from "@/components/PointagePanel";
import PointageFlexiblePanel from "@/components/PointageFlexiblePanel";
import {minutesObjectif} from "@/lib/objectifsHoraires";
import {dateLocale,bornesJour} from "@/lib/pointageFlexible";
import type { Pause } from "@/types/database";

function dateDuJour() {
  return dateLocale();
}

export default async function PointagePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aujourdhui = dateDuJour();

  const [{ data: profil }, { data: pointage }] = await Promise.all([
    supabase.from("utilisateurs").select("id, entreprise_id, nom, role, statut, deleted_at, mode_pointage, objectif_minutes, flexible_depuis").eq("id", user.id).single(),
    supabase.from("pointages").select("*").eq("utilisateur_id", user.id).eq("date", aujourdhui).maybeSingle(),
  ]);

  if (!profil || profil.statut!=="actif" || profil.deleted_at) redirect("/login");
  if(profil.mode_pointage==="flexible" && profil.flexible_depuis && profil.flexible_depuis<=dateLocale()){
    const {data:ouvert,error:openError}=await supabase.from("pointages").select("*").eq("utilisateur_id",user.id).eq("statut","ouvert").order("date",{ascending:false}).limit(1);
    if(openError)return <p>Impossible de vérifier vos pointages.</p>;
    if(!ouvert?.length){const b=bornesJour();const {data:sessions,error}=await supabase.from("pointages_flexibles").select("*").eq("utilisateur_id",user.id).lt("debut",new Date(b.fin).toISOString()).or("fin.is.null,fin.gt."+new Date(b.debut).toISOString()).order("debut");if(error)return <p>Impossible de charger les sessions.</p>;const {data:hist,error:histErr}=await supabase.from("objectifs_horaires").select("*").eq("utilisateur_id",user.id).lte("date_effet",dateLocale());if(histErr||!hist?.length)return <p>Impossible de charger l’objectif quotidien.</p>;return <main style={{padding:32}}><h1 style={{color:"var(--navy)"}}>Pointage</h1><PointageFlexiblePanel sessions={sessions??[]} objectif={minutesObjectif(hist,dateLocale())} serverNow={Date.now()}/></main>;}
    const ancien=ouvert[0];const {data:ps}=await supabase.from("pauses").select("*").eq("pointage_id",ancien.id);return <main style={{padding:32}}><p>Clôturez votre dernier pointage fixe avant de passer au mode flexible.</p><PointagePanel currentUserId={profil.id} dateDuJour={ancien.date} pointageInitial={ancien} pausesInitiales={ps??[]}/></main>;
  }

  let pauses: Pause[] = [];
  if (pointage) {
    const { data } = await supabase
      .from("pauses")
      .select("*")
      .eq("pointage_id", pointage.id)
      .order("debut", { ascending: true });
    pauses = data ?? [];
  }

  return (
    <main style={{ padding: "24px 32px" }}>
      <h1 style={{ color: "var(--navy)", margin: "0 0 24px" }}>Pointage</h1>
      <PointagePanel
        currentUserId={profil.id}
        dateDuJour={aujourdhui}
        pointageInitial={pointage ?? null}
        pausesInitiales={pauses}
      />
    </main>
  );
}
