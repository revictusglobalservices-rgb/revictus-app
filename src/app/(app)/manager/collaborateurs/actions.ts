"use server";
import nodemailer from "nodemailer";
import { revalidatePath } from "next/cache";
import { administration } from "@/lib/collaborateursAdmin";

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
  const transport = nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}});
  try {
    await transport.sendMail({
      from: "Revictus <"+process.env.GMAIL_USER+">", to:email, subject:"Invitation à votre espace Revictus",
      text:"Bonjour "+nom+",\n\nVous êtes invité à rejoindre l'équipe Revictus.\nActivez votre compte sur https://revictus-app.vercel.app/auth/invitation avec votre adresse e-mail et ce code à usage unique : "+invitation.properties.email_otp+".\n\nNe partagez pas ce code.\nRevictus"
    });
  } catch {
    revalidatePath("/manager/collaborateurs");
    return {ok:false,message:"Le compte est en attente, mais l'envoi de l'e-mail a échoué. Contactez l'administrateur technique."};
  }
  revalidatePath("/manager/collaborateurs");
  return {ok:true,message:"Invitation envoyée. Le compte est en attente d'activation."};
}
