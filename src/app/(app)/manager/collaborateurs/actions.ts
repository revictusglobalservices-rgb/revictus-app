"use server";
import nodemailer from "nodemailer";
import { revalidatePath } from "next/cache";
import { administration } from "@/lib/collaborateursAdmin";

async function envoyerCode(nom:string,email:string,code:string) {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g,"");
  if(!user || !pass) return false;
  try {
    const transport = nodemailer.createTransport({service:"gmail",auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    await transport.sendMail({from:"Revictus <"+user+">",to:email,subject:"Invitation à votre espace Revictus",text:"Bonjour "+nom+",\n\nVous êtes invité à rejoindre l'équipe Revictus.\nActivez votre compte sur https://revictus-app.vercel.app/auth/invitation avec votre adresse e-mail et ce code à usage unique : "+code+".\n\nNe partagez pas ce code.\nRevictus"});
    return true;
  } catch(error) {
    const e = error as {code?:unknown;responseCode?:unknown};
    console.error("Invitation Revictus : envoi SMTP échoué",{code:typeof e.code==="string"&&/^[A-Z0-9_]{1,30}$/.test(e.code)?e.code:"UNKNOWN",responseCode:typeof e.responseCode==="number"?e.responseCode:undefined});
    return false;
  }
}

export async function inviterCollaborateur(input: { nom: string; email: string; role: string; managerId: string }) {
  const admin = await administration();
  if (!admin) return { ok: false, message: "Action non autorisée." };
  const nom = typeof input.nom === "string" ? input.nom.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input.role;
  const managerId = typeof input.managerId === "string" && input.managerId ? input.managerId : null;
  if (!nom || nom.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["collaborateur","manager"].includes(role))
    return { ok:false, message:"Vérifiez les informations saisies." };
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return {ok:false,message:"Le service d'invitation n'est pas configuré."};
  const { service, profil } = admin;
  if (managerId) {
    const {data:m,error} = await service.from("utilisateurs").select("id").eq("id",managerId).eq("entreprise_id",profil.entreprise_id).in("role",["admin","manager"]).eq("statut","actif").is("deleted_at",null).maybeSingle();
    if (error || !m) return {ok:false,message:"Manager non valide."};
  }
  const {data:existing,error:lookupError} = await service.from("utilisateurs").select("id").eq("email",email).maybeSingle();
  if (lookupError || existing) return {ok:false,message:"Cette adresse est déjà utilisée ou indisponible."};
  const {data:invitation,error:inviteError} = await service.auth.admin.generateLink({type:"invite",email});
  if (inviteError || !invitation?.user || !invitation.properties?.email_otp) return {ok:false,message:"Impossible de préparer l'invitation. L'adresse est peut-être déjà enregistrée."};
  const {error:profileError} = await service.from("utilisateurs").insert({
    id:invitation.user.id, entreprise_id:profil.entreprise_id, nom, email,
    role:role as "collaborateur"|"manager", manager_id:managerId, statut:"invite"
  });
  if (profileError) return {ok:false,message:"L'invitation n'a pas été envoyée. Contactez l'administrateur technique pour vérifier le compte."};
  const delivered = await envoyerCode(nom,email,invitation.properties.email_otp);
  if(!delivered){
    revalidatePath("/manager/collaborateurs");
    return {ok:false,created:true,message:"Le compte a été créé, mais l'e-mail n'a pas été envoyé. Utilisez Renvoyer l'invitation."};
  }
  revalidatePath("/manager/collaborateurs");
  return {ok:true,created:true,message:"Invitation envoyée. Le compte est en attente d’activation."};
}

export async function renvoyerInvitation(id:string) {
  const admin=await administration();
  if(!admin || typeof id!=="string" || !/^[0-9a-f-]{36}$/i.test(id)) return {ok:false,message:"Action non autorisée."};
  if(!process.env.GMAIL_USER?.trim() || !process.env.GMAIL_APP_PASSWORD?.trim()) return {ok:false,message:"Le service d'invitation n'est pas configuré."};
  const {service,profil}=admin;
  const {data:membre,error}=await service.from("utilisateurs").select("id,nom,email,role,statut").eq("id",id).eq("entreprise_id",profil.entreprise_id).eq("statut","invite").in("role",["collaborateur","manager"]).is("deleted_at",null).maybeSingle();
  if(error || !membre) return {ok:false,message:"Ce compte ne peut pas recevoir une nouvelle invitation."};
  const {data:authUser,error:authError}=await service.auth.admin.getUserById(membre.id);
  if(authError || !authUser.user || authUser.user.email?.toLowerCase()!==membre.email.toLowerCase()) return {ok:false,message:"Le compte doit être vérifié avant de renvoyer l'invitation."};
  const {data:invitation,error:inviteError}=await service.auth.admin.generateLink({type:"magiclink",email:membre.email});
  if(inviteError || invitation?.user?.id!==membre.id || !invitation.properties?.email_otp) return {ok:false,message:"Impossible de préparer le nouveau code. Réessayez dans quelques instants."};
  const delivered=await envoyerCode(membre.nom,membre.email,invitation.properties.email_otp);
  if(!delivered) return {ok:false,message:"L'e-mail n'a pas été envoyé. Le compte est conservé."};
  return {ok:true,message:"Invitation renvoyée avec succès."};
}

export async function configurerPointage(id:string,mode:"fixe"|"flexible",minutes:number,date:string){
 const admin=await administration();
 if(!admin||!["fixe","flexible"].includes(mode)||typeof id!=="string"||typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(minutes)||minutes<30||minutes>960)return {ok:false,message:"Paramètres invalides."};
 const {service,profil}=admin;
 const {data:m,error}=await service.from("utilisateurs").select("id,mode_pointage,flexible_depuis").eq("id",id).eq("entreprise_id",profil.entreprise_id).eq("role","collaborateur").eq("statut","actif").is("deleted_at",null).maybeSingle();
 if(error||!m)return {ok:false,message:"Collaborateur non autorisé."};
 const {count,error:sessionError}=await service.from("pointages_flexibles").select("id",{count:"exact",head:true}).eq("utilisateur_id",id).is("fin",null);
 if(sessionError||count)return {ok:false,message:"Une session est ouverte : attendez sa clôture."};
 if(mode==="fixe"&&m.mode_pointage==="flexible")return {ok:false,message:"Le retour au mode fixe doit être planifié avec l’administrateur technique."};
 const {error:e}=await service.from("utilisateurs").update({mode_pointage:mode,objectif_minutes:mode==="flexible"?minutes:null,flexible_depuis:mode==="flexible"?date:null}).eq("id",id).eq("entreprise_id",profil.entreprise_id);
 if(e)return {ok:false,message:"Impossible d'enregistrer."};
 revalidatePath("/manager/collaborateurs");revalidatePath("/manager");return {ok:true,message:"Paramètres enregistrés. Le pointage fixe déjà ouvert devra être clôturé."};
}
