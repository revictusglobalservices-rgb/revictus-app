import { redirect } from "next/navigation";
import { administration, moduleActif } from "@/lib/collaborateursAdmin";
import CollaborateursPanel from "@/components/CollaborateursPanel";

export const dynamic = "force-dynamic";
export default async function Page(){
  if(!moduleActif()) return <main style={{padding:32}}><h1>Collaborateurs</h1><p>Module en préparation. Les invitations sont désactivées dans cet environnement.</p></main>;
  const admin=await administration();
  if(!admin) redirect("/");
  const {data,error}=await admin.service.from("utilisateurs").select("id,nom,email,role,manager_id,statut,mode_pointage,objectif_minutes,flexible_depuis").eq("entreprise_id",admin.profil.entreprise_id).is("deleted_at",null).order("nom");
  if(error) return <main style={{padding:32}}><h1>Collaborateurs</h1><p>Impossible de charger les membres de l’équipe.</p></main>;
  return <CollaborateursPanel membres={data??[]} statutsActifs={process.env.REVICTUS_STATUTS_ENABLED==="true"}/>;
}
