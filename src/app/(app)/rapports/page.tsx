import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {dateLocale} from "@/lib/pointageFlexible";
import {jourPlus,jourSemaine} from "@/lib/objectifsHoraires";
import ExportPerformance from "@/components/ExportPerformance";
import type {RapportActivite} from "@/types/database";
export const dynamic="force-dynamic";
const labels={a_valider:"À valider",a_corriger:"À corriger",valide:"Validé"};
const qualites={conforme:"Conforme",a_ameliorer:"À améliorer",non_conforme:"Non conforme"};
const tone={a_valider:"#fff0d4",a_corriger:"#fce5e5",valide:"#e3f4e8"};
const btn={padding:"8px 12px",border:"1px solid var(--border)",borderRadius:7,color:"var(--navy)",fontWeight:600,textDecoration:"none",background:"white",cursor:"pointer"} as const;
const primary={...btn,background:"var(--navy)",color:"white",border:0};
const input={width:"100%",padding:8,border:"1px solid var(--border)",borderRadius:7,font:"inherit"} as const;
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const field=(f:FormData,k:string)=>String(f.get(k)??"").trim();
async function actor(){
 const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const {data:p}=await s.from("utilisateurs").select("id,role,entreprise_id,statut,deleted_at").eq("id",user.id).single();
 if(!p||p.statut!=="actif"||p.deleted_at)redirect("/login");
 return {s,p};
}
async function mutate(f:FormData){
 "use server";
 const {s,p}=await actor();if(process.env.VERCEL_ENV!=="production")redirect("/rapports?message=preview");
 const action=field(f,"action"),id=field(f,"id"),version=Number(field(f,"version"));
 const activites=field(f,"activites"),difficultes=field(f,"difficultes"),restantes=field(f,"restantes");
 const contentOk=activites.length>0&&[activites,difficultes,restantes].every(v=>v.length<=12000);
 let ok=false;
 if(action==="nouveau"&&contentOk){
  const jour=field(f,"jour"),cid=field(f,"client");
  if(validDate(jour)&&jour<=dateLocale()&&(!cid||uuid(cid))){
   const {error}=await s.from("rapports_activite").insert({auteur_id:p.id,entreprise_id:p.entreprise_id,client_id:cid||null,jour,activites,difficultes,restantes} as never);ok=!error;
  }
 }else if(uuid(id)&&Number.isInteger(version)&&version>0){
  if(action==="corriger"&&contentOk){
   const {data,error}=await s.from("rapports_activite").update({activites,difficultes,restantes,statut:"a_valider"} as never).eq("id",id).eq("version",version).eq("auteur_id",p.id).eq("statut","a_corriger").select("id");ok=!error&&!!data?.length;
  }else if((action==="valider"||action==="demander")&&p.role!=="collaborateur"){
   const qualite=field(f,"qualite"),observations=field(f,"observations");
   if(Object.prototype.hasOwnProperty.call(qualites,qualite)&&observations.length<=12000&&(action!=="demander"||observations.length>0)){
    const {data,error}=await s.from("rapports_activite").update({statut:action==="valider"?"valide":"a_corriger",qualite,observations} as never).eq("id",id).eq("version",version).eq("statut","a_valider").select("id");ok=!error&&!!data?.length;
   }
  }
 }
 revalidatePath("/rapports");redirect("/rapports?message="+(ok?"ok":"refus")+(uuid(id)?"&rapport="+id:""));
}
function FormContenu({r}:{r?:RapportActivite}){
 return <>{[["activites","Activités réalisées",r?.activites],["difficultes","Difficultés rencontrées",r?.difficultes],["restantes","Tâches restantes",r?.restantes]].map(([k,l,v])=><label key={k} style={{display:"block",marginBottom:12}}>{l}<textarea name={k} style={{...input,display:"block",marginTop:4}} rows={3} maxLength={12000} required={k==="activites"} defaultValue={v??""}/></label>)}</>;
}
export default async function Page({searchParams}:{searchParams:{vue?:string;date?:string;periode?:string;client?:string;membre?:string;statut?:string;rapport?:string;nouveau?:string;message?:string}}){
 const {s,p}=await actor();const manager=p.role!=="collaborateur",today=dateLocale();
 const anchor=searchParams.date&&validDate(searchParams.date)?searchParams.date:today,period=searchParams.periode==="mois"?"mois":searchParams.periode==="jour"?"jour":"semaine";
 const start=period==="mois"?anchor.slice(0,7)+"-01":period==="jour"?anchor:jourPlus(anchor,1-jourSemaine(anchor));
 const n=new Date(start+"T12:00:00Z");n.setUTCMonth(n.getUTCMonth()+1,1);const end=period==="mois"?jourPlus(n.toISOString().slice(0,10),-1):period==="jour"?start:jourPlus(start,6);
 const [{data:clients,error:ce},{data:membres,error:me},{data:rapports,error:re}]=await Promise.all([
 s.from("clients").select("id,nom").eq("actif",true).order("nom"),
 s.from("utilisateurs").select("id,nom").eq("entreprise_id",p.entreprise_id).order("nom"),
 s.from("rapports_activite").select("*").eq("entreprise_id",p.entreprise_id).gte("jour",start).lte("jour",end).order("jour",{ascending:false}).order("updated_at",{ascending:false}).limit(1000)
 ]);
 if(ce||me||re||rapports?.length===1000)return <main style={{padding:32}}><h1>Rapports & qualité</h1><p role="alert">Le module n’est pas disponible ou la période contient trop de rapports. Réessayez avec une période plus courte.</p></main>;
 const vue=manager&&(searchParams.vue==="qualite"||searchParams.vue==="clients")?searchParams.vue:"journaliers";
 const nom=(id:string)=>membres?.find(m=>m.id===id)?.nom??"Collaborateur";
 const clientNom=(id:string|null)=>id?clients?.find(c=>c.id===id)?.nom??"Client":"Interne";
 const cf=searchParams.client==="interne"||clients?.some(c=>c.id===searchParams.client)?searchParams.client!:"tous";
 const all=rapports??[],membresVisibles=(membres??[]).filter(m=>all.some(r=>r.auteur_id===m.id)||m.id===p.id);
 const mf=membresVisibles.some(m=>m.id===searchParams.membre)?searchParams.membre!:"tous",sf=Object.prototype.hasOwnProperty.call(labels,searchParams.statut??"")?searchParams.statut!:"tous";
 const scope=all.filter(r=>(cf==="tous"||(r.client_id??"interne")===cf)&&(mf==="tous"||r.auteur_id===mf));
 const rows=scope.filter(r=>(sf==="tous"||r.statut===sf)&&(vue!=="qualite"||r.statut!=="valide"));
 const selected=rows.find(r=>r.id===searchParams.rapport)??rows[0];
 const h=selected?await s.from("rapports_activite_historique").select("*").eq("rapport_id",selected.id).order("version",{ascending:false}):{data:[],error:null};
 const url=(params:Record<string,string>)=>"/rapports?"+new URLSearchParams({vue,periode:period,date:anchor,client:cf,membre:mf,statut:sf,...params}).toString();
 const valid=scope.filter(r=>r.statut==="valide"&&r.client_id!==null);
 const exportRows=[["Date","Client","Collaborateur","Activités réalisées","Difficultés","Tâches restantes"],...valid.map(r=>[r.jour,clientNom(r.client_id),nom(r.auteur_id),r.activites,r.difficultes,r.restantes])];
 const td={padding:"10px 8px",borderBottom:"1px solid var(--border)",textAlign:"left" as const};
 return <main style={{padding:"24px 28px",maxWidth:1600,margin:"auto"}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h1 style={{color:"var(--navy)",margin:0}}>Rapports d’activité & qualité</h1><p style={{color:"var(--ink-2)"}}>Suivre le travail réalisé et améliorer la qualité du service</p></div><a href={url({nouveau:"1"})} style={primary}>+ Nouveau rapport</a></div>
 {searchParams.message&&<p role="status" style={{padding:12,background:"#e8f0fe",borderRadius:8}}>{searchParams.message==="ok"?"Rapport enregistré.":searchParams.message==="preview"?"Écriture désactivée dans la version de test.":"Enregistrement refusé. Vérifiez les champs, les droits d’accès et l’absence de doublon."}</p>}
 <nav style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>{(manager?[["journaliers","Rapports journaliers"],["qualite","Contrôle qualité"],["clients","Rapports clients"]]:[["journaliers","Mes rapports"]]).map(([v,l])=><a key={v} href={url({vue:v,statut:"tous"})} style={vue===v?primary:btn}>{l}</a>)}</nav>
 <form method="get" className="card-2" style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}><input type="hidden" name="vue" value={vue}/><select name="periode" aria-label="Période" defaultValue={period} style={btn}><option value="jour">Jour</option><option value="semaine">Semaine</option><option value="mois">Mois</option></select><input aria-label="Date" type="date" name="date" defaultValue={anchor} style={btn}/><select name="client" aria-label="Client" defaultValue={cf} style={btn}><option value="tous">Tous les clients</option><option value="interne">Interne</option>{clients?.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select>{manager&&<select name="membre" aria-label="Collaborateur" defaultValue={mf} style={btn}><option value="tous">Tous les collaborateurs</option>{membresVisibles.map(m=><option key={m.id} value={m.id}>{m.nom}</option>)}</select>}<select name="statut" aria-label="Statut" defaultValue={sf} style={btn}><option value="tous">Tous les statuts</option>{Object.entries(labels).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select><button style={btn}>Filtrer</button></form>
 <p style={{fontSize:13,color:"var(--ink-2)"}}>{start} – {end} · Madagascar</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:16}}>{[["Rapports reçus",scope.length],["À valider",scope.filter(r=>r.statut==="a_valider").length],["Corrections demandées",scope.filter(r=>r.statut==="a_corriger").length],["Validés",scope.filter(r=>r.statut==="valide").length]].map(([l,v])=><section className="card-2" key={l}><div style={{fontSize:13,color:"var(--ink-2)"}}>{l}</div><strong style={{fontSize:28,color:"var(--navy)"}}>{v}</strong></section>)}</div>
 {searchParams.nouveau==="1"&&<section className="card-2" style={{marginBottom:16}}><h2>Nouveau rapport</h2><form action={mutate}><input type="hidden" name="action" value="nouveau"/><div style={{display:"flex",gap:14,marginBottom:12}}><label>Jour <input name="jour" type="date" defaultValue={today} max={today} required style={btn}/></label><label>Client <select name="client" style={btn}><option value="">Interne</option>{clients?.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></label></div><FormContenu/><button style={primary}>Soumettre le rapport</button> <a href={url({})} style={btn}>Annuler</a></form></section>}
 {vue==="clients"?<section className="card-2"><h2>Rapports clients validés</h2><p>Choisissez un client et une période. L’export ne contient pas les observations internes de contrôle qualité.</p>{cf!=="tous"&&cf!=="interne"&&valid.length>0?<><ExportPerformance rows={exportRows} filename={"rapport-client-"+start+"-"+end+".csv"}/><div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{exportRows[0].map(x=><th key={x} style={td}>{x}</th>)}</tr></thead><tbody>{exportRows.slice(1).map((r,i)=><tr key={i}>{r.map((x,j)=><td key={j} style={{...td,whiteSpace:"pre-wrap"}}>{x}</td>)}</tr>)}</tbody></table></div></>:<p>{cf==="tous"||cf==="interne"?"Sélectionnez un client pour préparer son rapport.":"Aucun rapport validé sur cette période."}</p>}</section>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(340px,1fr))",gap:16,alignItems:"start"}}>
 <section className="card-2" style={{overflowX:"auto"}}><h2 style={{fontSize:18,color:"var(--navy)"}}>Rapports journaliers</h2>{rows.length?<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Date","Collaborateur","Client","Statut","Qualité","Action"].map(x=><th key={x} style={td}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} style={{background:selected?.id===r.id?"#edf3fb":undefined}}><td style={td}>{r.jour}</td><td style={td}>{nom(r.auteur_id)}</td><td style={td}>{clientNom(r.client_id)}</td><td style={td}><span style={{background:tone[r.statut],borderRadius:12,padding:"3px 8px",whiteSpace:"nowrap"}}>{labels[r.statut]}</span></td><td style={td}>{r.qualite?qualites[r.qualite]:"—"}</td><td style={td}><a href={url({rapport:r.id})}>Voir</a></td></tr>)}</tbody></table>:<p>Aucun rapport sur cette période.</p>}</section>
 <section className="card-2">{selected?<><h2 style={{fontSize:18,color:"var(--navy)"}}>Rapport du {selected.jour}</h2><p>{nom(selected.auteur_id)} · {clientNom(selected.client_id)} · {labels[selected.statut]}</p>{[["Activités réalisées",selected.activites],["Difficultés rencontrées",selected.difficultes],["Tâches restantes",selected.restantes]].map(([l,v])=><div key={l}><strong>{l}</strong><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{v||"—"}</p></div>)}
 {selected.qualite&&<p><strong>Qualité :</strong> {qualites[selected.qualite]} · {selected.observations||"Aucune observation"}</p>}
 {selected.statut==="a_corriger"&&selected.auteur_id===p.id&&<form action={mutate}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="version" value={selected.version}/><input type="hidden" name="action" value="corriger"/><h3>Modifier et renvoyer</h3><FormContenu r={selected}/><button style={primary}>Renvoyer le rapport</button></form>}
 {manager&&selected.statut==="a_valider"&&selected.auteur_id!==p.id&&<form action={mutate}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="version" value={selected.version}/><h3>Évaluation qualité</h3><div style={{display:"flex",flexWrap:"wrap",gap:12}}>{Object.entries(qualites).map(([k,v])=><label key={k}><input type="radio" name="qualite" value={k} defaultChecked={k==="conforme"}/> {v}</label>)}</div><label style={{display:"block",margin:"12px 0"}}>Observations<textarea style={{...input,display:"block"}} name="observations" rows={3} maxLength={12000}/></label><button style={primary} name="action" value="valider">Valider</button> <button style={btn} name="action" value="demander">Demander une correction</button><p style={{fontSize:12}}>Une demande de correction exige une observation.</p></form>}
 <details style={{marginTop:20}}><summary>Historique des versions ({h.data?.length??0})</summary>{h.error?<p>Historique indisponible.</p>:h.data?.map(v=><details key={v.id} style={{marginTop:10}}><summary>Version {v.version} · {labels[v.instantane.statut]} · {new Date(v.instant).toLocaleString("fr-FR",{timeZone:"Indian/Antananarivo"})}</summary><p style={{whiteSpace:"pre-wrap"}}>{v.instantane.activites}</p><p>Difficultés : {v.instantane.difficultes||"—"}</p><p>Restant : {v.instantane.restantes||"—"}</p><p>Observations : {v.instantane.observations||"—"}</p></details>)}</details>
 </>:<p>Sélectionnez un rapport pour afficher son contenu.</p>}</section></div>}
 </main>;
}
