import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import DashboardManagerView,{type DashboardData,type LignePresence,type EtatPresence} from "@/components/DashboardManagerView";
import {bornesJour,dureeJour,formatDuree} from "@/lib/pointageFlexible";
import DashboardRefresh from "@/components/DashboardRefresh";
import type {StatutTache} from "@/types/database";
export const dynamic="force-dynamic";
const zone="Indian/Antananarivo";
function heure(d:string|null|undefined){return d?new Date(d).toLocaleTimeString("fr-FR",{timeZone:zone,hour:"2-digit",minute:"2-digit"}):"—";}
function minutes(s:string|null){if(!s)return null;const [h,m]=s.split(":").map(Number);return h*60+m;}
export default async function Page(){
 const supabase=createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login");
 const {data:profil}=await supabase.from("utilisateurs").select("id,nom,role,statut,entreprise_id,deleted_at").eq("id",user.id).single();
 if(!profil||profil.statut!=="actif"||profil.deleted_at||profil.role==="collaborateur")redirect("/dashboard");
 const now=new Date(),iso=now.toISOString();
 const local=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const part=(k:string)=>local.find(p=>p.type===k)?.value??"";
 const jour=part("year")+"-"+part("month")+"-"+part("day");
 const nowMinute=minutes(heure(iso))??0;
 let req=supabase.from("utilisateurs").select("id,nom,mode_pointage,objectif_minutes,flexible_depuis").eq("entreprise_id",profil.entreprise_id).eq("statut","actif").is("deleted_at",null).order("nom");
 if(profil.role!=="admin")req=req.eq("manager_id",profil.id);
 const {data:equipe,error:equipeError}=await req;
 if(equipeError)return <main style={{padding:32}}><h1>Tableau de bord</h1><p role="alert">Impossible de charger l’équipe. Actualisez la page.</p></main>;
 const membres=equipe??[],ids=membres.map(m=>m.id);
 const [{data:pointages,error:pointError},{data:absences,error:absenceError},{data:prioritaires,error:tacheError},{count:retards,error:retardError},{count:corrections,error:correctionError},{count:conges,error:congeError}]=await Promise.all([
 ids.length?supabase.from("pointages").select("id,utilisateur_id,check_in,check_out,statut").in("utilisateur_id",ids).eq("date",jour):Promise.resolve({data:[],error:null}),
 ids.length?supabase.from("conges_absences").select("utilisateur_id,nature").in("utilisateur_id",ids).eq("statut","validee").is("deleted_at",null).lte("date_debut",jour).gte("date_fin",jour):Promise.resolve({data:[],error:null}),
 supabase.from("taches").select("id,titre,echeance,priorite").eq("entreprise_id",profil.entreprise_id).is("deleted_at",null).neq("statut","terminee").or("priorite.in.(urgent,important),echeance.lt."+iso).order("echeance",{ascending:true,nullsFirst:false}).limit(8),
 supabase.from("taches").select("id",{count:"exact",head:true}).eq("entreprise_id",profil.entreprise_id).is("deleted_at",null).neq("statut","terminee").lt("echeance",iso),
 ids.length?supabase.from("corrections").select("id",{count:"exact",head:true}).in("auteur_id",ids).eq("statut","en_attente"):Promise.resolve({count:0,error:null}),
 ids.length?supabase.from("conges_absences").select("id",{count:"exact",head:true}).in("utilisateur_id",ids).eq("statut","en_attente").is("deleted_at",null):Promise.resolve({count:0,error:null})
 ]);
 const b=bornesJour(now);
 const flexIds=membres.filter(m=>m.mode_pointage==="flexible"&&m.flexible_depuis&&m.flexible_depuis<=jour).map(m=>m.id);
 const {data:flex,error:flexError}=flexIds.length?await supabase.from("pointages_flexibles").select("*").in("utilisateur_id",flexIds).lt("debut",new Date(b.fin).toISOString()).or("fin.is.null,fin.gt."+new Date(b.debut).toISOString()).order("debut"):{data:[],error:null};
 const pointIds=(pointages??[]).filter(p=>p.statut==="ouvert").map(p=>p.id);
 const {data:pauses,error:pauseError}=pointIds.length?await supabase.from("pauses").select("pointage_id").in("pointage_id",pointIds).is("fin",null):{data:[],error:null};
 const plans=await Promise.all(membres.map(m=>supabase.rpc("obtenir_planning",{p_utilisateur_id:m.id,p_debut:jour,p_fin:jour})));
 const personnes:LignePresence[]=membres.map((m,i)=>{
  const p=(pointages??[]).find(p=>p.utilisateur_id===m.id);
  const a=(absences??[]).find(x=>x.utilisateur_id===m.id);
  if(flexIds.includes(m.id)&&p?.statut!=="ouvert"){
   const ss=(flex??[]).filter(s=>s.utilisateur_id===m.id),active=ss.some(s=>s.fin===null),total=ss.reduce((x,s)=>x+dureeJour(s,now.getTime(),b.debut,b.fin),0);
   return {id:m.id,nom:m.nom,etat:flexError?"inconnu":active?"present":a?.nature==="conge"?"conge":a?.nature==="absence"?"absence":"flexible_offline",horaire:"Flexible",travaille:formatDuree(total),objectif:formatDuree((m.objectif_minutes??360)*60),arrivee:heure(ss[0]?.debut),depart:active?"—":heure(ss[ss.length-1]?.fin)};
  }
  const plan=plans[i],slots=(plan.data??[]).filter(x=>x.type==="horaire_travail"&&x.heure_debut&&x.heure_fin);
  const horaire=slots.map(x=>x.heure_debut!.slice(0,5)+"–"+x.heure_fin!.slice(0,5)).join(" · ")||"—";
  let etat:EtatPresence="inconnu";
  if(!pointError&&!pauseError){
   if(p?.statut==="ouvert"&&p.check_in)etat=(pauses??[]).some(x=>x.pointage_id===p.id)?"pause":"present";
   else if(p?.statut==="ferme")etat="termine";
   else if(!absenceError&&a)etat=a.nature==="conge"?"conge":"absence";
   else if(!plan.error&&!absenceError)etat=!slots.length?"repos":slots.some(x=>nowMinute>=(minutes(x.heure_debut)??1440))?"non_pointe":"a_venir";
  }
  return {id:m.id,nom:m.nom,etat,horaire,arrivee:heure(p?.check_in),depart:heure(p?.check_out)};
 });
 const statuts:StatutTache[]=["a_faire","en_cours","en_attente","terminee"];
 const counts=await Promise.all(statuts.map(statut=>supabase.from("taches").select("id",{count:"exact",head:true}).eq("entreprise_id",profil.entreprise_id).is("deleted_at",null).eq("statut",statut)));
 const kanban={a_faire:0,en_cours:0,en_attente:0,terminee:0};statuts.forEach((s,i)=>kanban[s]=counts[i].count??0);
 const alertes:string[]=[];const nonPointes=personnes.filter(p=>p.etat==="non_pointe").length;
 if(nonPointes)alertes.push(nonPointes+" collaborateur(s) non pointé(s), horaire commencé");
 if(retards)alertes.push(retards+" tâche(s) en retard");
 if(personnes.some(p=>p.etat==="inconnu"))alertes.push("Présence à vérifier");
 const failed=!!(pointError||flexError||absenceError||pauseError||tacheError||retardError||correctionError||congeError||plans.some(p=>p.error)||counts.some(c=>c.error));
 const data:DashboardData={date:now.toLocaleDateString("fr-FR",{timeZone:zone,weekday:"long",day:"numeric",month:"long"}),actualise:heure(iso),personnes,taches:(prioritaires??[]).map(t=>({...t,retard:!!t.echeance&&t.echeance<iso})),retards:retards??0,corrections:corrections??0,conges:conges??0,kanban,alertes,avertissement:failed?"Certaines données sont indisponibles. Les compteurs peuvent être incomplets.":undefined};
 return <><DashboardRefresh/><DashboardManagerView data={data}/></>;
}
