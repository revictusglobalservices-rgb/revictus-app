import {createClient} from "@/lib/supabase/server";
import ExportPerformance from "@/components/ExportPerformance";
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
export default async function Page({searchParams}:{searchParams:{vue?:string;date?:string;membre?:string;client?:string}}){
 const client=createClient(),{data:{user}}=await client.auth.getUser();if(!user)redirect("/login");
 const {data:p}=await client.from("utilisateurs").select("id,role,entreprise_id,statut,deleted_at").eq("id",user.id).single();
 if(!p||p.statut!=="actif"||p.deleted_at||p.role==="collaborateur")redirect("/planning");
 const today=dateLocale(),anchor=searchParams.date&&valide(searchParams.date)?searchParams.date:today,mois=searchParams.vue==="mois",jour=searchParams.vue==="jour";
 const start=jour?anchor:mois?anchor.slice(0,7)+"-01":jourPlus(anchor,1-jourSemaine(anchor));
 const nextMonth=new Date(start+"T12:00:00Z");nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1,1);
 const end=jour?anchor:mois?jourPlus(nextMonth.toISOString().slice(0,10),-1):jourPlus(start,6);
 const days:string[]=[];for(let d=start;d<=end;d=jourPlus(d,1))days.push(d);
 const prev=jour?jourPlus(start,-1):mois?jourPlus(start,-1):jourPlus(start,-7),next=jourPlus(end,1);
 let req=client.from("utilisateurs").select("id,nom,mode_pointage,flexible_depuis").eq("entreprise_id",p.entreprise_id).eq("statut","actif").is("deleted_at",null).order("nom");
 if(p.role!=="admin")req=req.eq("manager_id",p.id);
 const {data:membres,error}=await req;if(error)return <p role="alert">Impossible de charger l’équipe.</p>;
 const all=membres??[],filtre=all.some(m=>m.id===searchParams.membre)?searchParams.membre!:"tous",selected=all.filter(m=>filtre==="tous"||m.id===filtre),ids=selected.map(m=>m.id);
 const url=(v:string,d:string)=>"/manager/performances?vue="+v+"&date="+d+"&membre="+encodeURIComponent(filtre);
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
 if(pa.error)return <main style={{padding:32}}><h1>Performances</h1><p role="alert">Impossible de charger les pauses.</p></main>;
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
 
 const [{data:clients,error:ce},{data:taches,error:te},{data:sessions,error:se}]=await Promise.all([
  client.from("clients").select("id,nom").eq("actif",true).order("nom"),
  ids.length?client.from("taches").select("id,client_id,statut,assigne_id,created_at,echeance").in("assigne_id",ids).is("deleted_at",null).lt("created_at",new Date(b2.fin).toISOString()).limit(1001):Promise.resolve({data:[],error:null}),
  ids.length?client.from("sessions_temps").select("id,tache_id,utilisateur_id,debut,fin,duree_secondes").in("utilisateur_id",ids).lt("debut",new Date(b2.fin).toISOString()).or("fin.is.null,fin.gt."+new Date(b1.debut).toISOString()).limit(1001):Promise.resolve({data:[],error:null})
 ]);
 if(ce||te||se||!taches||!sessions||taches.length>=1000||sessions.length>=1000)return <main style={{padding:32}}><h1>Performances</h1><p role="alert">Les données de tâches ou de chrono sont incomplètes. Réduisez la période ou filtrez un collaborateur.</p><a href="/manager/performances">Réinitialiser</a></main>;
 const taskIds=Array.from(new Set(sessions.map(x=>x.tache_id)));
 const chronoTasks=taskIds.length?await client.from("taches").select("id,client_id").in("id",taskIds):{data:[],error:null};
 if(chronoTasks.error)return <main style={{padding:32}}><h1>Performances</h1><p role="alert">Impossible de charger la répartition client.</p></main>;
 const clientFilter=searchParams.client==="interne"||clients?.some(c=>c.id===searchParams.client)?searchParams.client!:"tous";
 const matches=(cid:string|null)=>clientFilter==="tous"||(cid??"interne")===clientFilter;
 const cohort=taches.filter(t=>Date.parse(t.created_at)>=b1.debut&&matches(t.client_id));
 const overdue=taches.filter(t=>t.statut!=="terminee"&&t.echeance&&Date.parse(t.echeance)<now&&Date.parse(t.echeance)>=b1.debut&&Date.parse(t.echeance)<b2.fin&&matches(t.client_id));
 const byClient=new Map<string,number>();
 const chronoMap=new Map((chronoTasks.data??[]).map(t=>[t.id,t.client_id]));
 const chronoPerUser=new Map<string,number>();
 for(const x of sessions){if(!chronoMap.has(x.tache_id))continue;const cid=chronoMap.get(x.tache_id)??null;if(!matches(cid))continue;
  const minutes=Math.max(0,Math.min(x.fin?Date.parse(x.fin):now,b2.fin,now)-Math.max(Date.parse(x.debut),b1.debut))/60000;
  const key=cid??"interne";byClient.set(key,(byClient.get(key)??0)+minutes);chronoPerUser.set(x.utilisateur_id,(chronoPerUser.get(x.utilisateur_id)??0)+minutes);
 }
 const metrics=rows.map(r=>{const h=resume(r.jours),t=cohort.filter(x=>x.assigne_id===r.id),done=t.filter(x=>x.statut==="terminee").length;
  return {id:r.id,nom:r.nom,realise:h.realise,prevu:h.prevu,ecart:h.ecart,chrono:chronoPerUser.get(r.id)??0,done,retard:overdue.filter(x=>x.assigne_id===r.id).length,nb:t.length};
 });
 const sum={realise:total.realise,prevu:total.prevu,ecart:total.ecart,chrono:metrics.reduce((s,r)=>s+r.chrono,0),done:metrics.reduce((s,r)=>s+r.done,0),retard:overdue.length,nb:cohort.length};
 const pct=(a:number,b:number)=>b>0?Math.round(a/b*100)+" %":"—";
 const max=Math.max(1,...metrics.flatMap(x=>[x.realise,x.prevu]));
 const maxClient=Math.max(1,...Array.from(byClient.values()));
 const bar=(w:number,max:number,color:string)=><div style={{height:13,background:"#edf1f5",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:Math.max(0,Math.min(100,w/max*100))+"%",background:color,borderRadius:4}}/></div>;
 const exportRows=[["Collaborateur","Heures pointées (global)","Objectif global","Écart vérifié","Chrono (filtre client)","Tâches créées sur la période et terminées","Retards échéance période","Taux achèvement"],...metrics.map(r=>[r.nom,fmt(r.realise),fmt(r.prevu),delta(r.ecart),fmt(r.chrono),String(r.done),String(r.retard),pct(r.done,r.nb)]),["Total",fmt(sum.realise),fmt(sum.prevu),delta(sum.ecart),fmt(sum.chrono),String(sum.done),String(sum.retard),pct(sum.done,sum.nb)]];
 const view=jour?"jour":mois?"mois":"semaine";
 const link=(d:string)=>url(view,d)+"&client="+encodeURIComponent(clientFilter);
 const heading={fontSize:17,color:"var(--navy)",margin:"0 0 16px"};
 const cell={padding:"12px 10px",borderBottom:"1px solid var(--border)",textAlign:"left" as const,whiteSpace:"nowrap" as const};
 return <main style={{padding:"28px 32px",maxWidth:1600,margin:"auto"}}>
 <h1 style={{color:"var(--navy)",margin:0}}>Suivi des performances</h1><p style={{color:"var(--ink-2)",marginTop:6}}>Vue d’ensemble de l’activité de l’équipe · Madagascar</p>
 <section className="card-2" style={{marginBottom:16,display:"flex",flexWrap:"wrap",gap:12,alignItems:"center"}}>
 <a style={btn} href={link(prev)}>←</a><a style={btn} href={link(today)}>Aujourd’hui</a><a style={btn} href={link(next)}>→</a><form method="get" style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",flex:1}}>
 <select aria-label="Période" name="vue" defaultValue={view} style={btn}><option value="jour">Jour</option><option value="semaine">Semaine</option><option value="mois">Mois</option></select><input aria-label="Date" type="date" name="date" defaultValue={anchor} style={btn}/>
 <select aria-label="Client" name="client" defaultValue={clientFilter} style={btn}><option value="tous">Tous les clients</option><option value="interne">Interne</option>{clients?.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select>
 <select aria-label="Collaborateur" name="membre" defaultValue={filtre} style={btn}><option value="tous">Toute l’équipe</option>{all.map(m=><option key={m.id} value={m.id}>{m.nom}</option>)}</select><button style={btn}>Filtrer</button></form>
 <ExportPerformance rows={exportRows} filename={"performances-"+start+"-"+end+".csv"}/></section>
 <p style={{fontSize:13,color:"var(--ink-2)"}}>{dateFmt(start)} – {dateFmt(end)}{clientFilter!=="tous"?" · Le filtre client s’applique au chrono et aux tâches ; le pointage et les objectifs restent globaux.":""}</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12,marginBottom:16}}>
 {([{label:"Heures pointées / objectif",value:fmt(sum.realise)+" / "+fmt(sum.prevu),color:"var(--navy)"},{label:"Objectif horaire (période)",value:pct(sum.realise,sum.prevu),color:"var(--navy)"},{label:"Tâches terminées",value:String(sum.done),color:"#18794e"},{label:"Tâches en retard",value:String(sum.retard),color:"#b91c1c"}]).map(x=><section className="card-2" key={x.label}><p style={{margin:"0 0 10px",color:"var(--ink-2)",fontSize:13}}>{x.label}</p><strong style={{color:x.color,fontSize:26}}>{x.value}</strong></section>)}
 </div>
 {total.incomplets>0&&<p role="status" style={{padding:12,background:"#fff1d6",borderRadius:8}}>{total.incomplets} journée(s) de pointage à vérifier : exclues des écarts vérifiés.</p>}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14,marginBottom:16}}>
 <section className="card-2"><h2 style={heading}>Heures réalisées vs objectifs</h2>{metrics.map(r=><div key={r.id} style={{marginBottom:15}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}><span>{r.nom}</span><strong>{fmt(r.realise)} / {fmt(r.prevu)}</strong></div>{bar(r.realise,max,"#1e3a5f")}<div style={{height:4}}/>{bar(r.prevu,max,"#91b9eb")}</div>)}<p style={{fontSize:12,color:"var(--ink-2)"}}>■ Réalisées · <span style={{color:"#477cb6"}}>■ Objectifs</span></p></section>
 <section className="card-2"><h2 style={heading}>Temps chronométré par client</h2>{Array.from(byClient.entries()).sort((a,b)=>b[1]-a[1]).map(([id,v])=><div key={id} style={{marginBottom:15}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}><span>{id==="interne"?"Interne":clients?.find(c=>c.id===id)?.nom??"Client accessible"}</span><strong>{fmt(v)}</strong></div>{bar(v,maxClient,"#386ea7")}</div>)}{byClient.size===0&&<p>Aucune session chrono sur cette période.</p>}<p style={{fontSize:12,color:"var(--ink-2)"}}>Total chrono : {fmt(sum.chrono)}. Ne pas additionner aux heures pointées.</p></section>
 </div>
 <section className="card-2" style={{overflowX:"auto"}}><h2 style={heading}>Performance par collaborateur</h2><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{background:"#eef2f6"}}>{exportRows[0].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{exportRows.slice(1).map((r,i)=><tr key={i} style={i===metrics.length?{background:"#e9eff6",fontWeight:700}:undefined}>{r.map((v,j)=><td key={j} style={cell}>{v}</td>)}</tr>)}</tbody></table></section>
 <p style={{fontSize:12,color:"var(--ink-2)",lineHeight:1.6}}>Les tâches terminées correspondent aux tâches créées pendant la période et actuellement terminées ; la date de clôture n’est pas historisée. Les retards concernent les échéances de la période encore ouvertes aujourd’hui. Les objectifs incluent les jours à venir dans la période. L’écart vérifié exclut les jours en cours ou incomplets. <a href="/manager/planning/suivi">Voir le détail du suivi horaire →</a></p>
 </main>;
}
