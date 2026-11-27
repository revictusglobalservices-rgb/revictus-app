import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const today = () => new Date().toLocaleDateString("sv-SE",{timeZone:"Indian/Antananarivo"});
const uuid = (s:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const date = (s:string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
const field=(f:FormData,k:string)=>String(f.get(k)??"").trim();
async function actor() {
  const {data:{user}}=await createClient().auth.getUser();
  if(!user || !user.email_confirmed_at) redirect("/login");
  const {data:p}=await createClient().from("utilisateurs").select("id,entreprise_id,role,statut,deleted_at").eq("id",user.id).single();
  if(!p || p.statut!=="actif" || p.deleted_at || !["admin","manager"].includes(p.role)) redirect("/kanban");
  return p;
}
async function mutation(f:FormData) {
  "use server";
  const p=await actor();
  if(process.env.VERCEL_ENV!=="production") redirect("/manager/clients?message=preview");
  const s=createServiceClient();
  const type=field(f,"type");
  let ok=false;
  if(type==="creer" && p.role==="admin"){
    const nom=field(f,"nom");
    if(nom.length && nom.length<=120){
      const {error}=await s.from("clients").insert({nom,entreprise_id:p.entreprise_id} as never);
      ok=!error;
    }
  } else if(type==="attribuer"){
    const cid=field(f,"client"), uid=field(f,"membre"), debut=field(f,"debut"), fin=field(f,"fin");
    if(uuid(cid)&&uuid(uid)&&date(debut)&&debut>=today()&&(!fin||(date(fin)&&fin>=debut))&&(p.role==="admin"||!!fin)){
      const [{data:c},{data:u}]=await Promise.all([
        s.from("clients").select("*").eq("id",cid).eq("entreprise_id",p.entreprise_id).eq("actif",true).maybeSingle(),
        s.from("utilisateurs").select("id,role,manager_id,statut,deleted_at").eq("id",uid).eq("entreprise_id",p.entreprise_id).maybeSingle()
      ]);
      if(c&&u&&u.role!=="admin"&&u.statut==="actif"&&!u.deleted_at){
        let allowed=p.role==="admin";
        if(p.role==="manager"&&u.role==="collaborateur"&&u.manager_id===p.id){
          const {data:a}=await s.from("acces_clients").select("*").eq("client_id",cid).eq("utilisateur_id",p.id).eq("origine","admin").is("revoque_le",null).lte("date_debut",today());
          allowed=!!a?.some(x=>!x.date_fin||x.date_fin>=fin);
        }
        if(allowed){
          const {error}=await s.from("acces_clients").insert({client_id:cid,utilisateur_id:uid,accorde_par:p.id,origine:p.role,date_debut:debut,date_fin:fin||null} as never);
          ok=!error;
        }
      }
    }
  } else if(type==="retirer"){
    const id=field(f,"id");
    if(uuid(id)){
      const {data:a}=await s.from("acces_clients").select("*").eq("id",id).is("revoque_le",null).maybeSingle();
      if(a){
        const [{data:c},{data:u}]=await Promise.all([
          s.from("clients").select("id").eq("id",a.client_id).eq("entreprise_id",p.entreprise_id).maybeSingle(),
          s.from("utilisateurs").select("manager_id").eq("id",a.utilisateur_id).eq("entreprise_id",p.entreprise_id).maybeSingle()
        ]);
        if(c&&u&&(p.role==="admin"||(a.origine==="manager"&&a.accorde_par===p.id&&u.manager_id===p.id))){
          const {error}=await s.from("acces_clients").update({revoque_le:new Date().toISOString()} as never).eq("id",id).is("revoque_le",null);
          ok=!error;
        }
      }
    }
  }
  revalidatePath("/manager/clients");
  revalidatePath("/kanban");
  redirect("/manager/clients?message="+(ok?"ok":"refus"));
}
export default async function ClientsPage({searchParams}:{searchParams:{message?:string}}){
  const p=await actor();
  const s=createClient();
  const [{data:clients,error},{data:acces},{data:membres}]=await Promise.all([
    s.from("clients").select("*").order("nom"),
    s.from("acces_clients").select("*").order("created_at",{ascending:false}),
    s.from("utilisateurs").select("id,nom,role,manager_id,statut,deleted_at")
  ]);
  const eligibles=(membres??[]).filter(u=>u.statut==="actif"&&!u.deleted_at&&u.role!=="admin"&&(p.role==="admin"||(u.role==="collaborateur"&&u.manager_id===p.id)));
  const nom=(id:string)=>(membres??[]).find(m=>m.id===id)?.nom??"Membre";
  const style={display:"flex",gap:12,flexWrap:"wrap" as const,alignItems:"end" as const};
  return <main style={{padding:32,maxWidth:1150,margin:"auto"}}>
    <a href="/kanban">← Retour au Kanban</a><h1>Clients et accès</h1>
    <p>Le manager peut accorder un accès temporaire à un membre de son équipe pour un client déjà dans son périmètre.</p>
    {searchParams.message&&<p role="status">{searchParams.message==="ok"?"Modification enregistrée.":searchParams.message==="preview"?"Modifications désactivées en prévisualisation.":"Modification refusée. Vérifiez les droits et les dates."}</p>}
    {error?<p>Le module n’est pas encore disponible.</p>:<>
    {p.role==="admin"&&<section className="card"><h2>Nouveau client</h2><form action={mutation} style={style}><input type="hidden" name="type" value="creer"/><label>Nom du client <input name="nom" required maxLength={120}/></label><button type="submit">Créer le client</button></form></section>}
    <section className="card" style={{marginTop:16}}><h2>Attribuer un accès</h2>
      <form action={mutation} style={style}>
      <input type="hidden" name="type" value="attribuer"/>
      <label>Client <select name="client" required>{(clients??[]).filter(c=>c.actif).map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
      <label>Collaborateur <select name="membre" required>{eligibles.map(m=><option key={m.id} value={m.id}>{m.nom}</option>)}</select></label>
      <label>Début <input type="date" name="debut" required defaultValue={today()} min={today()}/></label>
      <label>Fin {p.role==="admin"?"(facultative)":""} <input type="date" name="fin" min={today()} required={p.role==="manager"}/></label>
      <button type="submit" disabled={!clients?.length||!eligibles.length}>Accorder l’accès</button>
      </form>
    </section>
    <section className="card" style={{marginTop:16}}><h2>Accès attribués</h2>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",textAlign:"left"}}><thead><tr><th>Client</th><th>Membre</th><th>Début</th><th>Fin</th><th>Statut</th><th>Action</th></tr></thead>
      <tbody>{(acces??[]).map(a=><tr key={a.id}><td>{clients?.find(c=>c.id===a.client_id)?.nom}</td><td>{nom(a.utilisateur_id)}</td><td>{a.date_debut}</td><td>{a.date_fin??"Permanent"}</td><td>{a.revoque_le?"Retiré":a.date_fin&&a.date_fin<today()?"Expiré":a.date_debut>today()?"Planifié":"En cours"}</td><td>{!a.revoque_le&&(p.role==="admin"||(a.origine==="manager"&&a.accorde_par===p.id&&eligibles.some(u=>u.id===a.utilisateur_id)))&&<form action={mutation}><input type="hidden" name="type" value="retirer"/><input type="hidden" name="id" value={a.id}/><button type="submit">Retirer</button></form>}</td></tr>)}</tbody></table></div>
    </section></>}
  </main>;
}
