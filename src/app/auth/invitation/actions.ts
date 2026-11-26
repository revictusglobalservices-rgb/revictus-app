"use server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { moduleActif } from "@/lib/collaborateursAdmin";

export async function activerInvitation(emailInput:string,code:string,password:string){
  if(!moduleActif()) return {ok:false,message:"Activation indisponible."};
  const email=typeof emailInput==="string"?emailInput.trim().toLowerCase():"";
  if(!email||typeof code!=="string"||!/^\d{6,10}$/.test(code)||typeof password!=="string"||password.length<12||password.length>128) return {ok:false,message:"Vérifiez le code et choisissez un mot de passe d'au moins 12 caractères."};
  const supabase=createClient();
  const service=createServiceClient();
  const {data,error}=await supabase.auth.verifyOtp({email,token:code,type:"invite"});
  if(error||!data.user||!data.user.email_confirmed_at||data.user.email?.toLowerCase()!==email) return {ok:false,message:"Code invalide ou expiré."};
  const {data:profil}=await service.from("utilisateurs").select("id,statut,role,email,deleted_at").eq("id",data.user.id).maybeSingle();
  if(!profil||profil.statut!=="invite"||profil.deleted_at||profil.email.toLowerCase()!==email||profil.role==="admin"){
    await supabase.auth.signOut();
    return {ok:false,message:"Invitation non valide."};
  }
  const {error:passwordError}=await supabase.auth.updateUser({password});
  if(passwordError) return {ok:false,message:"Le mot de passe n'a pas pu être enregistré. Contactez Revictus."};
  const {error:profileError}=await service.from("utilisateurs").update({statut:"actif"}).eq("id",data.user.id).eq("statut","invite").is("deleted_at",null);
  if(profileError) return {ok:false,message:"Le compte existe mais son activation doit être vérifiée."};
  return {ok:true,message:"Compte activé."};
}
