"use server";
import {createClient} from "@/lib/supabase/server";
import {createServiceClient} from "@/lib/supabase/service";
import {dateLocale} from "@/lib/pointageFlexible";
import {revalidatePath} from "next/cache";
export async function changerSession(action:"start"|"stop"){
 if(process.env.VERCEL_ENV!=="production")return {ok:false,message:"Environnement de test."};
 const client=createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return {ok:false,message:"Connexion requise."};
 const service=createServiceClient();
 const {data:p,error}=await service.from("utilisateurs").select("id,mode_pointage,flexible_depuis,statut,deleted_at").eq("id",user.id).single();
 if(error||!p||p.statut!=="actif"||p.deleted_at||p.mode_pointage!=="flexible"||!p.flexible_depuis||p.flexible_depuis>dateLocale())return {ok:false,message:"Mode flexible indisponible."};
 if(action==="start"){
  const {count,error}=await service.from("pointages").select("id",{count:"exact",head:true}).eq("utilisateur_id",user.id).eq("statut","ouvert");
  if(error||count)return {ok:false,message:"Clôturez d’abord votre pointage fixe."};
  const {error:e}=await service.from("pointages_flexibles").insert({utilisateur_id:user.id});
  if(e)return {ok:false,message:"Impossible de démarrer : une session est peut-être déjà ouverte."};
 }else if(action==="stop"){
  const {data,error}=await service.from("pointages_flexibles").update({fin:new Date().toISOString()}).eq("utilisateur_id",user.id).is("fin",null).select("id");
  if(error||!data?.length)return {ok:false,message:"Aucune session ouverte à arrêter."};
 }else return {ok:false,message:"Action inconnue."};
 revalidatePath("/pointage");revalidatePath("/manager");return {ok:true,message:action==="start"?"Session démarrée.":"Session arrêtée."};
}
