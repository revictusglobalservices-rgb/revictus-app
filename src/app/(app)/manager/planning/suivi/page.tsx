import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {dateLocale,ZONE,bornesJour,dureeJour} from "@/lib/pointageFlexible";
import {jourPlus,jourSemaine,objectifAuJour,minutesObjectif} from "@/lib/objectifsHoraires";
export const dynamic="force-dynamic";
type Jour={date:string;prevu:number;realise:number;clos:boolean;incomplet:boolean;label:string;mode:"fixe"|"flexible"|"conge"|"repos";retard:number};
const fmt=(m:number)=>{const v=Math.round(Math.abs(m));return Math.floor(v/60)+"h"+String(v%60).padStart(2,"0")};
const delta=(m:number)=>(m>0?"+":m<0?"−":"")+fmt(m);
const couleur=(n:number)=>n<0?"var(--urgent)":n>0?"var(--normal)":"var(--ink-2)";
const min=(h:string)=>{const [a,b]=h.split(":").map(Number);return a*60+b};
const duree=(a:string,b:string)=>{const n=min(b)-min(a);return n<0?n+1440:n};
const valide=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"))&&new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
const dateFmt=(s:string)=>new Date(s+"T12:00:00Z").toLocaleDateString("fr-FR",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"});
const btn={padding:"8px 12px",border:"1px solid var(--border)",borderRadius:7,color:"var(--navy)",fontWeight:600,textDecoration:"none",background:"white"} as const;
function resume(j:Jour[]){return {prevu:j.reduce((s,x)=>s+x.prevu,0),realise:j.reduce((s,x)=>s+x.realise,0),attendu:j.filter(x=>x.clos&&!x.incomplet).reduce((s,x)=>s+x.prevu,0),ecart:j.filter(x=>x.clos&&!x.incomplet).reduce((s,x)=>s+x.realise-x.prevu,0),incomplets:j.filter(x=>x.incomplet).length}}
export default async function Page({searchParams}:{searchParams:{vue?:string;date?:string;membre?:string}}){
 const client=createClient(),{data:{user}}=await client.auth.getUser();if(!user)redirect("/login");
 const {data:p}=await client.from("utilisateurs").select("id,role,entreprise_id,statut,deleted_at").eq("id",user.id).single();
 if(!p||p.statut!=="actif"||p.deleted_at||p.role==="collaborateur")redirect("/planning");
 const today=dateLocale(),anchor=searchParams.date&&valide(searchParams.date)?searchParams.date:today,mois=searchParams.vue==="mois";
 const start=mois?anchor.slice(0,7)+"-01":jourPlus(anchor,1-jourSemaine(anchor));
 const nextMonth=new Date(start+"T12:00:00Z");nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1,1);
 const end=mois?jourPlus(nextMonth.toISOString().slice(0,10),-1):jourPlus(start,6);
 const days:string[]=[];for(let d=start;d<=end;d=jourPlus(d,1))days.push(d);
 const prev=mois?jourPlus(start,-1):jourPlus(start,-7),next=jourPlus(end,1);
 let req=client.from("utilisateurs").select("id,nom,mode_pointage,flexible_depuis").eq("entreprise_id",p.entreprise_id).eq("statut","actif").is("deleted_at",null).order("nom");
 if(p.role!=="admin")req=req.eq("manager_id",p.id);
 const {data:membres,error}=await req;if(error)return <p role="alert">Impossible de charger l’équipe.</p>;
 const all=membres??[],filtre=all.some(m=>m.id===searchParams.membre)?searchParams.membre!:"tous",selected=all.filter(m=>filtre==="tous"||m.id===filtre),ids=selected.map(m=>m.id);
 const url=(v:string,d:string)=>"/manager/planning/suivi?vue="+v+"&date="+d+"&membre="+encodeURIComponent(filtre);
 const now=Date.now(),b1=bornesJour(new Date(start+"T12:00:00+03:00")),b2=bornesJour(new Date(end+"T12:00:00+03:00"));
 const [pt,fl,ob,cg,...plans]=await Promise.all([
  ids.length?client.from("pointages").select("id,utilisateur_id,date,check_in,check_out,statut,duree_secondes").in("utilisateur_id",ids).gte("date",start).lte("date",end):Promise.resolve({data:[],error:null}),
  ids.length?client.from("pointages_flexibles").select("*").in("utilisateur_id",ids).lt("debut",new Date(b2.fin).toISOString()).or("fin.is.null,fin.gt."+new Date(b1.debut).toISOString()):Promise.resolve({data:[],error:null}),
  ids.length?client.from("objectifs_horaires").select("*").in("utilisateur_id",ids).lte("date_effet",end):Promise.resolve({data:[],error:null}),
  ids.length?client.from("conges_absences").select("utilisateur_id,nature,date_debut,date_fin").in("utilisateur_id",ids).is("deleted_at",null).eq("statut","validee").lte("date_debut",end).gte("date_fin",start):Promise.resolve({data:[],error:null}),
  ...selected.map(m=>client.rpc("obtenir_planning",{p_utilisateur_id:m.id,p_debut:start,p_fin:end}))
 ] as const);
 if([pt,fl,ob,cg,...plans].some(r=>r.error))return <main style={{padding:32}}><h1>Suivi des heures</h1><p role="alert">Certaines données n’ont pas pu être chargées. Aucun écart n’a été calculé.</p><a href="/manager/planning">Retour au planning</a></main>;
 const ouverts=(pt.data??[]).filter(x=>x.statut==="ouvert"&&x.date===today&&x.check_in).map(x=>x.id);
 const pa=ouverts.length?await client.from("pauses").select("pointage_id,debut,fin").in("pointage_id",ouverts):{data:[],error:null};
 const rows=selected.map((m,i)=>{
  const hist=(ob.data??[]).filter(o=>o.utilisateur_id===m.id),fixed=(pt.data??[]).filter(x=>x.utilisateur_id===m.id),flex=(fl.data??[]).filter(x=>x.utilisateur_id===m.id);
  const js:Jour[]=days.map(d=>{
   const c=(cg.data??[]).find(x=>x.utilisateur_id===m.id&&x.date_debut<=d&&x.date_fin>=d);
   const slots=(plans[i].data??[]).filter(x=>x.jour===d&&x.type==="horaire_travail"&&x.heure_debut&&x.heure_fin);
   const o=objectifAuJour(hist,d),isFlex=!!o,prevu=c?0:isFlex?minutesObjectif(hist,d):slots.reduce((s,x)=>s+duree(x.heure_debut!,x.heure_fin!),0);
   const p=fixed.find(x=>x.date===d);
   const b=bornesJour(new Date(d+"T12:00:00+03:00"));
   const ss=flex.filter(x=>Date.parse(x.debut)<b.fin&&(x.fin===null||Date.parse(x.fin)>b.debut));
   let realise=ss.reduce((s,x)=>s+dureeJour(x,now,b.debut,b.fin)/60,0),incomplet=!!p&&p.statut==="ouvert"&&d<today||ss.some(x=>!x.fin)&&d<today;
   if(p?.statut==="ferme")realise+=(p.duree_secondes??0)/60;
   else if(p?.statut==="ouvert"&&d===today&&p.check_in&&!pa.error){const debut=Date.parse(p.check_in),paused=(pa.data??[]).filter(x=>x.pointage_id===p.id).reduce((s,x)=>s+Math.max(0,(x.fin?Date.parse(x.fin):now)-Date.parse(x.debut)),0);realise+=Math.max(0,now-debut-paused)/60000;}
   else if(p?.statut==="ouvert"&&pa.error)incomplet=true;
   const expected=slots.map(x=>min(x.heure_debut!)).sort((a,b)=>a-b)[0];
   const arrivee=p?.check_in?new Date(p.check_in).toLocaleTimeString("fr-FR",{timeZone:ZONE,hour:"2-digit",minute:"2-digit"}):null;
   const retard=!isFlex&&!c&&arrivee&&expected!==undefined?Math.max(0,min(arrivee)-expected):0;
   return {date:d,prevu,realise:d>today?0:realise,clos:d<today,incomplet,label:c?c.nature==="conge"?"Congé":"Absence":isFlex?prevu?fmt(prevu)+" libres":"Repos":slots.length?slots.map(x=>x.heure_debut!.slice(0,5)+"–"+x.heure_fin!.slice(0,5)).join(" · "):"Repos",mode:c?"conge":isFlex&&prevu?"flexible":slots.length?"fixe":"repos",retard};
  });return {...m,jours:js};
 });
 const total=resume(rows.flatMap(r=>r.jours));
 const groups: string[][]=mois?days.reduce<string[][]>((a,d)=>{if(!a.length||jourSemaine(d)===1)a.push([d]);else a[a.length-1].push(d);return a},[]):days.map(d=>[d]);
 return <main style={{padding:"24px 28px",maxWidth:1600,margin:"auto"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><h1 style={{color:"var(--navy)",margin:0}}>Planning & suivi des heures</h1><p style={{color:"var(--ink-2)"}}>{dateFmt(start)} – {dateFmt(end)} · Madagascar</p></div><a style={btn} href="/manager/planning">Modifier les plannings →</a></div><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:18}}><a style={btn} href={url(mois?"mois":"semaine",prev)}>←</a><a style={btn} href={url(mois?"mois":"semaine",today)}>Aujourd’hui</a><a style={btn} href={url(mois?"mois":"semaine",next)}>→</a><a style={btn} href={url("semaine",anchor)}>Semaine</a><a style={btn} href={url("mois",anchor)}>Mois</a><form method="get" style={{display:"flex",gap:6}}><input type="hidden" name="vue" value={mois?"mois":"semaine"}/><input type="hidden" name="date" value={anchor}/><select name="membre" defaultValue={filtre} style={btn}><option value="tous">Toute l’équipe</option>{all.map(m=><option key={m.id} value={m.id}>{m.nom}</option>)}</select><button style={btn}>Filtrer</button></form></div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:18}}>{[{l:"Prévues sur la période",v:fmt(total.prevu),c:"var(--navy)"},{l:"Réalisées à ce jour",v:fmt(total.realise),c:"var(--normal)"},{l:"Prévues jours vérifiés",v:fmt(total.attendu),c:"var(--navy)"},{l:"Écart jours vérifiés",v:delta(total.ecart),c:couleur(total.ecart)}].map(x=><section className="card-2" key={x.l}><div style={{fontSize:12,color:"var(--ink-2)"}}>{x.l}</div><strong style={{fontSize:28,color:x.c}}>{x.v}</strong></section>)}</div>
 {total.incomplets>0&&<p style={{background:"var(--important-bg)",padding:12,borderRadius:7}}>Attention : {total.incomplets} journée(s) comportent un pointage non clôturé. Elles sont exclues du calcul des écarts.</p>}
 <section className="card-2" style={{padding:0,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:mois?800:1080,fontSize:13,textAlign:"center"}}><thead><tr style={{background:"var(--app-bg)"}}><th style={{padding:12,textAlign:"left"}}>Collaborateur</th>{groups.map(g=><th key={g[0]} style={{padding:10}}>{mois?dateFmt(g[0])+" – "+dateFmt(g[g.length-1]):dateFmt(g[0])}</th>)}<th>Prévues</th><th>Réalisées</th><th>Écart</th></tr></thead><tbody>{rows.map(r=>{const s=resume(r.jours);return <tr key={r.id} style={{borderBottom:"1px solid var(--border)"}}><td style={{padding:12,textAlign:"left"}}><a href={"/manager/equipe/"+r.id} style={{fontWeight:600,color:"var(--navy)"}}>{r.nom}</a></td>{groups.map(g=>{const jj=r.jours.filter(x=>g.includes(x.date)),a=resume(jj),j=jj[0];return <td key={g[0]} style={{padding:6,minWidth:100}}><details style={{background:mois?"var(--app-bg)":j.mode==="flexible"?"#eee8fc":j.mode==="fixe"?"#e8f0fe":j.mode==="conge"?"#e7f4ea":"#f0f1f3",padding:8,borderRadius:7}}><summary style={{cursor:"pointer",fontSize:11}}><strong>{mois?"Semaine":j.label}</strong><div>{g[0]>today?"À venir":fmt(a.realise)+" / "+fmt(a.prevu)}</div>{a.incomplets>0&&<span>À vérifier</span>}</summary>{jj.map(x=><p key={x.date} style={{fontSize:11}}>{dateFmt(x.date)} · {x.label} · {fmt(x.realise)} / {fmt(x.prevu)}{x.retard?" · Retard "+x.retard+" min":""}</p>)}</details></td>})}<td>{fmt(s.prevu)}</td><td>{fmt(s.realise)}</td><td style={{fontWeight:700,color:couleur(s.ecart)}}>{delta(s.ecart)}</td></tr>})}</tbody></table></section>
 <section className="card-2" style={{marginTop:16}}><h2 style={{color:"var(--navy)",fontSize:18}}>Alertes de suivi</h2>{rows.flatMap(r=>r.jours.filter(j=>j.clos&&!j.incomplet&&j.prevu>0&&(j.realise+1<j.prevu||j.retard>0)).map(j=><p key={r.id+j.date} style={{fontSize:13,color:"var(--urgent)"}}>{r.nom} · {dateFmt(j.date)}{j.realise+1<j.prevu?" · "+fmt(j.prevu-j.realise)+" non réalisée(s)":""}{j.retard?" · retard "+j.retard+" min":""}</p>))}<p style={{fontSize:12,color:"var(--ink-2)"}}>Les journées en cours ou à vérifier ne génèrent pas d’alerte d’objectif manqué. Les heures nettes pointées sont comparées aux créneaux prévus. Les horaires fixes reflètent le planning enregistré actuellement ; les objectifs flexibles sont historisés.</p></section></main>;
}
