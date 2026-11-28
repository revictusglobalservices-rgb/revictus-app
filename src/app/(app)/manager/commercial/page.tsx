import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {dateLocale} from "@/lib/pointageFlexible";
import CommercialForm from "@/components/CommercialForm";
import ExportPerformance from "@/components/ExportPerformance";
import type {DeviseCommerciale,DocumentCommercial,LigneCommerciale} from "@/types/database";
export const dynamic="force-dynamic";
const currencies:DeviseCommerciale[]=["USD","EUR","MGA","CHF","CAD"];
const labels={devis:"Devis",facture:"Facture",avoir:"Avoir"};
const field=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const validCurrency=(s:string)=>currencies.includes(s as DeviseCommerciale);
const btn={padding:"9px 13px",border:"1px solid var(--border)",borderRadius:7,color:"var(--navy)",fontWeight:600,textDecoration:"none",background:"white",cursor:"pointer"} as const;
const primary={...btn,background:"var(--navy)",color:"white",border:0};
const input={padding:"8px",border:"1px solid var(--border)",borderRadius:7,font:"inherit",width:"100%"} as const;
const fmt=(n:number,d:string)=>new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+" "+d;
async function admin(){const s=createClient(),{data:{user}}=await s.auth.getUser();if(!user)redirect("/login");const {data:p}=await s.from("utilisateurs").select("id,role,entreprise_id,statut,deleted_at").eq("id",user.id).single();if(!p||p.statut!=="actif"||p.deleted_at||p.role!=="admin")redirect("/dashboard");return {s,p};}
async function mutation(f:FormData){
 "use server";
 const {s,p}=await admin();if(process.env.VERCEL_ENV!=="production")redirect("/manager/commercial?message=preview");
 const action=field(f,"action"),id=field(f,"id"),devise=field(f,"devise");let ok=false;
 if(validCurrency(devise)){
 if(action==="creer_client"||action==="modifier_client"){
   const nom=field(f,"nom"),email=field(f,"email"),adresse=field(f,"adresse"),pays=field(f,"pays"),identifiant_fiscal=field(f,"identifiant_fiscal"),op=field(f,"operationnel");
   if(nom.length>0&&nom.length<=200&&email.length<=320&&adresse.length<=1000&&pays.length<=100&&identifiant_fiscal.length<=150&&(!op||uuid(op))){
    const details={nom,email,adresse,pays,identifiant_fiscal,devise};
    if(action==="creer_client"){const {error}=await s.from("commercial_clients").insert({...details,entreprise_id:p.entreprise_id,client_operationnel_id:op||null} as never);ok=!error;}
    else if(uuid(id)){const {data,error}=await s.from("commercial_clients").update(details as never).eq("id",id).eq("entreprise_id",p.entreprise_id).select("id");ok=!error&&!!data?.length;}
   }
 }else if(action==="creer_document"||action==="modifier_document"){
  const type=field(f,"type"),cid=field(f,"client"),source=field(f,"source"),jour=field(f,"jour"),echeance=field(f,"echeance"),notes=field(f,"notes"),version=Number(field(f,"version"));let lignes:LigneCommerciale[]=[];
  try{const raw=JSON.parse(field(f,"lignes"));if(Array.isArray(raw)&&raw.length<=50)lignes=raw.map(l=>({designation:String(l.designation??"").trim(),quantite:String(l.quantite??""),prix:String(l.prix??""),taxe:String(l.taxe??"")}));}catch{}
  const valid=lignes.length>0&&lignes.every(l=>l.designation.length>0&&l.designation.length<=500&&/^[0-9]{1,7}([.][0-9]{1,4})?$/.test(l.quantite)&&Number(l.quantite)>0&&/^[0-9]{1,12}([.][0-9]{1,2})?$/.test(l.prix)&&/^[0-9]{1,3}([.][0-9]{1,2})?$/.test(l.taxe)&&Number(l.taxe)<=100);
  if(valid&&uuid(cid)&&(!source||uuid(source))&&validDate(jour)&&(!echeance||(validDate(echeance)&&echeance>=jour))&&notes.length<=4000&&Object.prototype.hasOwnProperty.call(labels,type)){
   const details={jour,echeance:echeance||null,devise,lignes,notes};
   if(action==="creer_document"){const {error}=await s.from("commercial_documents").insert({...details,entreprise_id:p.entreprise_id,client_id:cid,auteur_id:p.id,type,source_id:source||null} as never);ok=!error;}
   else if(uuid(id)&&Number.isInteger(version)&&version>0){const {data,error}=await s.from("commercial_documents").update(details as never).eq("id",id).eq("entreprise_id",p.entreprise_id).eq("version",version).select("id");ok=!error&&!!data?.length;}
  }
 }
 }
 revalidatePath("/manager/commercial");redirect("/manager/commercial?message="+(ok?"ok":"refus")+(action.includes("client")?"&vue=clients":""));
}
export default async function Page({searchParams}:{searchParams:{vue?:string;nouveau?:string;document?:string;client?:string;devise?:string;mois?:string;q?:string;message?:string}}){
 const {s,p}=await admin();const today=dateLocale();
 const [{data:clients,error:ce},{data:docs,error:de},{data:ops,error:oe}]=await Promise.all([s.from("commercial_clients").select("*").eq("entreprise_id",p.entreprise_id).order("nom").limit(1000),s.from("commercial_documents").select("*").eq("entreprise_id",p.entreprise_id).order("created_at",{ascending:false}).limit(1000),s.from("clients").select("id,nom").eq("entreprise_id",p.entreprise_id).eq("actif",true).order("nom")]);
 if(ce||de||oe||clients?.length===1000||docs?.length===1000)return <main style={{padding:32}}><h1>Gestion commerciale</h1><p>Le module n’est pas disponible ou les données sont incomplètes.</p></main>;
 const all=docs??[],cs=clients??[],vue=["clients","devis","factures","avoirs","reglements","recurrente"].includes(searchParams.vue??"")?searchParams.vue!:"ensemble";
 const cur=validCurrency(searchParams.devise??"")?searchParams.devise!:"toutes",mois=/^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.mois??"")?searchParams.mois!:today.slice(0,7),q=(searchParams.q??"").slice(0,100).toLocaleLowerCase("fr");
 const nom=(id:string)=>cs.find(c=>c.id===id)?.nom??"Client";
 const filtre=all.filter(d=>(cur==="toutes"||d.devise===cur)&&d.jour.startsWith(mois)&&(!q||(nom(d.client_id)+" "+labels[d.type]+" "+d.id).toLocaleLowerCase("fr").includes(q)));
 const rows=filtre.filter(d=>vue==="ensemble"||(vue==="devis"&&d.type==="devis")||(vue==="factures"&&d.type==="facture")||(vue==="avoirs"&&d.type==="avoir"));
 const selected=all.find(d=>d.id===searchParams.document),c=cs.find(x=>x.id===searchParams.client);
 const url=(params:Record<string,string>)=>"/manager/commercial?"+new URLSearchParams({vue,mois,devise:cur,q,...params}).toString();
 const tabs=[["ensemble","Vue d’ensemble"],["clients","Clients"],["devis","Devis"],["factures","Factures"],["avoirs","Avoirs"],["reglements","Règlements"],["recurrente","Facturation récurrente"]];
 const td={padding:"12px 8px",borderBottom:"1px solid var(--border)",textAlign:"left" as const};
 return <main style={{padding:"28px 32px",maxWidth:1600,margin:"auto"}}>
 <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h1 style={{color:"var(--navy)",margin:0}}>Gestion commerciale</h1><p style={{color:"var(--ink-2)"}}>Gérer les clients et les documents commerciaux</p></div><div style={{display:"flex",gap:8}}><a href={url({nouveau:"document"})} style={primary}>+ Nouveau document</a><ExportPerformance filename={"brouillons-"+mois+".csv"} rows={[["Type","Client","Date","Devise","HT","Taxes","TTC","Statut"],...rows.map(d=>[labels[d.type],nom(d.client_id),d.jour,d.devise,String(d.total_ht),String(d.total_taxe),String(d.total_ttc),"Brouillon"])]}/></div></div>
 <p style={{padding:12,borderRadius:8,background:"#eef3fb",fontSize:13}}>Phase 1 · Documents brouillons seulement. L’émission officielle, la numérotation définitive, les paiements et la comptabilité seront activés après paramétrage et validation.</p>
 {searchParams.message&&<p role="status" style={{padding:12,borderRadius:8,background:"#e7f0fc"}}>{searchParams.message==="ok"?"Enregistrement réussi.":searchParams.message==="preview"?"Écriture désactivée en test.":"Enregistrement refusé. Vérifiez les champs ou la version du brouillon."}</p>}
 <nav style={{display:"flex",gap:8,flexWrap:"wrap",margin:"20px 0"}}>{tabs.map(([v,l])=><a key={v} style={v===vue?primary:btn} href={url({vue:v})}>{l}</a>)}</nav>
 <form method="get" style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:24}}><input type="hidden" name="vue" value={vue}/><input aria-label="Mois" type="month" name="mois" defaultValue={mois} style={btn}/><select aria-label="Devise" name="devise" defaultValue={cur} style={btn}><option value="toutes">Toutes les devises</option>{currencies.map(d=><option key={d}>{d}</option>)}</select><input aria-label="Recherche" name="q" placeholder="Rechercher un document, un client…" defaultValue={q} style={{...btn,flex:1,minWidth:160}}/><button style={btn}>Filtrer</button></form>
 {vue==="ensemble"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:16,marginBottom:24}}>{[["Devis brouillons",filtre.filter(d=>d.type==="devis").length],["Factures brouillons",filtre.filter(d=>d.type==="facture").length],["Avoirs brouillons",filtre.filter(d=>d.type==="avoir").length],["Clients",cs.length]].map(([l,v])=><section className="card-2" key={l}><span style={{color:"var(--ink-2)"}}>{l}</span><div style={{fontWeight:700,fontSize:28,color:"var(--navy)",marginTop:8}}>{v}</div></section>)}</div>}
 {(searchParams.nouveau==="client"||c)&&<section className="card-2" style={{marginBottom:24}}><h2>{c?"Modifier le client":"Nouveau client"}</h2><form action={mutation}><input type="hidden" name="action" value={c?"modifier_client":"creer_client"}/><input type="hidden" name="id" value={c?.id??""}/><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}><label>Nom / raison sociale<input style={input} name="nom" required maxLength={200} defaultValue={c?.nom??""}/></label><label>E-mail de facturation<input style={input} type="email" name="email" maxLength={320} defaultValue={c?.email??""}/></label><label>Pays<input style={input} name="pays" maxLength={100} defaultValue={c?.pays??""}/></label><label>Identifiant fiscal<input style={input} name="identifiant_fiscal" maxLength={150} defaultValue={c?.identifiant_fiscal??""}/></label><label>Devise<select style={input} name="devise" defaultValue={c?.devise??"MGA"}>{currencies.map(d=><option key={d}>{d}</option>)}</select></label>{!c&&<label>Client opérationnel (facultatif)<select style={input} name="operationnel"><option value="">— Aucun —</option>{ops?.filter(o=>!cs.some(x=>x.client_operationnel_id===o.id)).map(o=><option value={o.id} key={o.id}>{o.nom}</option>)}</select></label>}</div><label style={{display:"block",margin:"16px 0"}}>Adresse de facturation<textarea style={input} name="adresse" rows={3} maxLength={1000} defaultValue={c?.adresse??""}/></label><button style={primary}>Enregistrer</button> <a href={url({vue:"clients"})} style={btn}>Annuler</a></form></section>}
 {(searchParams.nouveau==="document"||selected)&&<section className="card-2" style={{marginBottom:24}}><h2>{selected?"Modifier le brouillon":"Nouveau document"}</h2>{cs.length?<CommercialForm key={selected?.id??"nouveau"} clients={cs} documents={all} doc={selected} today={today} action={mutation}/>:<p>Crée d’abord une fiche client. <a href={url({vue:"clients",nouveau:"client"})}>Ajouter un client →</a></p>} <a href={url({})}>Fermer</a></section>}
 {vue==="clients"?<section className="card-2"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Clients</h2><a href={url({nouveau:"client"})} style={primary}>+ Nouveau client</a></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Nom","Pays","E-mail","Devise","Action"].map(x=><th style={td} key={x}>{x}</th>)}</tr></thead><tbody>{cs.filter(c=>!q||c.nom.toLocaleLowerCase("fr").includes(q)).map(c=><tr key={c.id}><td style={td}>{c.nom}</td><td style={td}>{c.pays||"—"}</td><td style={td}>{c.email||"—"}</td><td style={td}>{c.devise}</td><td style={td}><a href={url({client:c.id})}>Modifier</a></td></tr>)}</tbody></table></div>{!cs.length&&<p>Aucun client commercial enregistré.</p>}</section>:
 vue==="reglements"||vue==="recurrente"?<section className="card-2"><h2>{vue==="reglements"?"Règlements":"Facturation récurrente"}</h2><p>Disponible lors de la prochaine phase, après activation de l’émission des documents.</p></section>:
 <div style={{display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(240px,1fr)",gap:20,alignItems:"start"}}><section className="card-2" style={{overflowX:"auto"}}><h2>{vue==="ensemble"?"Documents récents":tabs.find(t=>t[0]===vue)?.[1]}</h2><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Type","Client","Date","Montant TTC","Statut","Action"].map(x=><th key={x} style={td}>{x}</th>)}</tr></thead><tbody>{rows.slice(0,vue==="ensemble"?8:rows.length).map(d=><tr key={d.id}><td style={td}>{labels[d.type]}</td><td style={td}>{nom(d.client_id)}</td><td style={td}>{d.jour}</td><td style={td}>{fmt(d.total_ttc,d.devise)}</td><td style={td}><span style={{background:"#e9eef3",padding:"4px 8px",borderRadius:10}}>Brouillon</span></td><td style={td}><a href={url({document:d.id})}>Modifier</a></td></tr>)}</tbody></table>{!rows.length&&<p>Aucun document sur cette période.</p>}</section><section className="card-2"><h2>À suivre</h2><p>Créer les fiches clients et préparer les brouillons.</p><p style={{fontSize:13,color:"var(--ink-2)"}}>Aucun montant encaissé ou à encaisser n’est calculé à partir de brouillons. Les montants restent dans leur devise d’origine.</p><a href={url({vue:"clients",nouveau:"client"})}>Ajouter un client →</a></section></div>}
 </main>;
}
