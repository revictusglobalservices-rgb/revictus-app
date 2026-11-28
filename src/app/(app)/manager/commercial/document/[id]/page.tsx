import {createClient} from "@/lib/supabase/server";
import {redirect,notFound} from "next/navigation";
import PrintCommercial from "@/components/PrintCommercial";
export const dynamic="force-dynamic";
const titles={devis:"Devis",facture:"Facture",avoir:"Avoir"};
const fmt=(v:number,c:string)=>new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+" "+c;
export default async function Page({params}:{params:{id:string}}){
 const s=createClient(),{data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const {data:p}=await s.from("utilisateurs").select("id,role,entreprise_id,statut,deleted_at").eq("id",user.id).single();if(!p||p.role!=="admin"||p.statut!=="actif"||p.deleted_at)redirect("/dashboard");
 const {data:d}=await s.from("commercial_documents").select("*").eq("id",params.id).eq("entreprise_id",p.entreprise_id).maybeSingle();if(!d)notFound();
 const [{data:cfg},{data:client},{data:source}]=await Promise.all([s.from("commercial_parametres").select("*").eq("entreprise_id",p.entreprise_id).maybeSingle(),s.from("commercial_clients").select("*").eq("id",d.client_id).maybeSingle(),d.source_id?s.from("commercial_documents").select("numero").eq("id",d.source_id).maybeSingle():Promise.resolve({data:null})]);
 const e=d.statut==="emis"?d.emetteur:cfg,c=d.statut==="emis"?d.destinataire:client,sign=d.type==="avoir"?-1:1;
 const h={fontSize:11,color:"#667c90",letterSpacing:".06em",margin:"0 0 5px"};
 const td={padding:"10px 8px",borderBottom:"1px solid #e7edf2",textAlign:"right" as const,verticalAlign:"top" as const};
 return <main style={{padding:24}}><PrintCommercial/><article id="commercial-print" style={{background:"white",maxWidth:794,minHeight:1050,margin:"auto",padding:"45px 48px",color:"#253951",fontFamily:"Arial, sans-serif",fontSize:13,lineHeight:1.55,display:"flex",flexDirection:"column"}}>
 <header style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:20,marginBottom:36}}>
 {e?.logo?<img src={e.logo} alt="Revictus Global Services" style={{width:108,maxHeight:78,objectFit:"contain",objectPosition:"left top"}}/>:<span style={{fontSize:14,letterSpacing:".12em",fontWeight:700}}>REVICTUS</span>}
 <div style={{textAlign:"right"}}><h1 style={{fontFamily:"Georgia, serif",fontSize:32,fontWeight:400,margin:0,color:"#142746"}}>{titles[d.type]}</h1><div style={{...h,margin:"4px 0 16px"}}>{d.statut==="brouillon"?"BROUILLON · NON ÉMIS":d.numero}</div><div>Date : {d.jour}</div>{d.echeance&&<div>{d.type==="devis"?"Validité":"Échéance"} : {d.echeance}</div>}{d.source_id&&<div>Document d’origine : {source?.numero??"Brouillon"}</div>}</div>
 </header>
 <section style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:30,marginBottom:36}}>
 <div><p style={h}>ÉMETTEUR</p><strong>{e?.nom??"Revictus Global Services"}</strong><div style={{whiteSpace:"pre-wrap"}}>{e?.adresse??"Coordonnées à configurer"}</div><div>{e?.email}</div></div>
 <div><p style={h}>CLIENT</p><strong>{c?.nom??"Client"}</strong><div style={{whiteSpace:"pre-wrap"}}>{c?.adresse}</div><div>{c?.pays}</div><div>{c?.email}</div>{c?.identifiant_fiscal&&<div>NIF / identifiant fiscal : {c.identifiant_fiscal}</div>}{c?.rcs&&<div>RCS : {c.rcs}</div>}{c?.stat&&<div>STAT : {c.stat}</div>}</div>
 </section>
 <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}><colgroup><col style={{width:"44%"}}/><col style={{width:"12%"}}/><col style={{width:"22%"}}/><col style={{width:"22%"}}/></colgroup><thead style={{background:"#eaf0f4"}}><tr>{["Désignation","Qté","Prix unitaire","Montant"].map((v,i)=><th key={v} style={{...td,textAlign:i===0?"left":"right",fontWeight:600}}>{v}</th>)}</tr></thead><tbody>{d.lignes.map((l,i)=><tr key={i}><td style={{...td,textAlign:"left",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{l.designation}</td><td style={td}>{l.quantite}</td><td style={td}>{fmt(sign*Number(l.prix),d.devise)}</td><td style={td}>{fmt(sign*Math.round(Number(l.quantite)*Number(l.prix)*100)/100,d.devise)}</td></tr>)}</tbody></table>
 <section style={{margin:"22px 0 32px auto",width:"min(100%,290px)"}}><div style={{display:"flex",justifyContent:"space-between",padding:8}}>Total HT <span>{fmt(sign*Number(d.total_ht),d.devise)}</span></div><div style={{display:"flex",justifyContent:"space-between",padding:8}}>TVA <span>{fmt(sign*Number(d.total_taxe),d.devise)}</span></div><div style={{display:"flex",justifyContent:"space-between",background:"#eaf0f4",padding:12,borderRadius:7,fontWeight:700,fontSize:16}}>{d.type==="avoir"?"Total crédité":"Total TTC"} <span>{fmt(sign*Number(d.total_ttc),d.devise)}</span></div><p style={{fontSize:11,margin:"8px 0",color:"#667c90"}}>{e?.mention_fiscale??"TVA non facturée"}</p></section>
 {d.notes&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{d.notes}</p>}
 {d.type==="devis"?<section style={{marginTop:20}}><p style={h}>BON POUR ACCORD</p><p>Nom / fonction : __________________________________</p><p>Date : __________________ Signature : __________________</p></section>:d.type==="facture"?<section style={{marginTop:20}}><p style={h}>MODALITÉS DE PAIEMENT</p><p>Virement bancaire<br/>IBAN : {e?.iban??"À renseigner"}<br/>SWIFT/BIC : {e?.swift??"À renseigner"}</p><p>Signature émetteur : __________________ Signature client : __________________</p></section>:<section style={{marginTop:20}}><p style={h}>FACTURE D’ORIGINE</p><p>{source?.numero??"Document source à confirmer"}</p></section>}
 <footer style={{marginTop:"auto",paddingTop:34,fontSize:10,color:"#667c90"}}><div style={{borderTop:"1px solid #dce4eb",paddingTop:12,textAlign:"center"}}>RCS : {e?.rcs??"—"} · NIF : {e?.nif??"—"} · STAT : {e?.stat??"—"}</div></footer>
 </article></main>;
}
