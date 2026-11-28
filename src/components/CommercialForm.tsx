"use client";
import {useState} from "react";
import type {LigneCommerciale,DocumentCommercial,ClientCommercial,DeviseCommerciale} from "@/types/database";
const devises:DeviseCommerciale[]=["USD","EUR","MGA","CHF","CAD"];
const empty=()=>({designation:"",quantite:"1",prix:"0",taxe:"0"});
const input={padding:8,border:"1px solid var(--border)",borderRadius:7,font:"inherit",width:"100%"} as const;
const button={padding:"8px 12px",border:"1px solid var(--border)",borderRadius:7,background:"white",cursor:"pointer"} as const;
export default function CommercialForm({clients,documents,doc,today,action}:{clients:ClientCommercial[];documents:DocumentCommercial[];doc?:DocumentCommercial;today:string;action:(f:FormData)=>Promise<void>}){
 const [type,setType]=useState<DocumentCommercial["type"]>(doc?.type??"devis");
 const [cid,setCid]=useState(doc?.client_id??clients[0]?.id??"");
 const [devise,setDevise]=useState<DeviseCommerciale>(doc?.devise??clients[0]?.devise??"MGA");
 const [source,setSource]=useState(doc?.source_id??"");
 const [lignes,setLignes]=useState<LigneCommerciale[]>(doc?.lignes??[empty()]);
 const sources=documents.filter(d=>d.client_id===cid&&d.devise===devise&&((type==="facture"&&d.type==="devis")||(type==="avoir"&&d.type==="facture")));
 const fmt=(n:number)=>new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+" "+devise;
 const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
 const amounts=lignes.map(l=>{const ht=round(Number(l.quantite)*Number(l.prix));return {ht,taxe:round(ht*Number(l.taxe)/100)}});
 const ht=amounts.reduce((a,l)=>a+l.ht,0),taxe=amounts.reduce((a,l)=>a+l.taxe,0);
 function edit(i:number,k:keyof LigneCommerciale,v:string){setLignes(old=>old.map((l,j)=>j===i?{...l,[k]:v}:l))}
 return <form action={action}><input type="hidden" name="action" value={doc?"modifier_document":"creer_document"}/><input type="hidden" name="id" value={doc?.id??""}/><input type="hidden" name="version" value={doc?.version??""}/><input type="hidden" name="lignes" value={JSON.stringify(lignes)}/><input type="hidden" name="type" value={type}/><input type="hidden" name="client" value={cid}/><input type="hidden" name="source" value={source}/><input type="hidden" name="devise" value={devise}/>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:12,marginBottom:18}}>
 <label>Type<select style={input} value={type} disabled={!!doc} onChange={e=>{setType(e.target.value as DocumentCommercial["type"]);setSource("")}}><option value="devis">Devis</option><option value="facture">Facture</option><option value="avoir">Avoir</option></select></label>
 <label>Client<select style={input} required value={cid} disabled={!!doc} onChange={e=>{setCid(e.target.value);setSource("");setDevise(clients.find(c=>c.id===e.target.value)?.devise??"MGA")}}>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
 <label>Devise<select style={input} value={devise} disabled={!!doc?.source_id} onChange={e=>{setDevise(e.target.value as DeviseCommerciale);setSource("")}}>{devises.map(d=><option key={d}>{d}</option>)}</select></label>
 <label>Date<input style={input} type="date" name="jour" defaultValue={doc?.jour??today} required/></label>
 <label>Échéance<input style={input} name="echeance" type="date" defaultValue={doc?.echeance??""}/></label></div>
 {type!=="devis"&&<label style={{display:"block",marginBottom:16}}>Document source {type==="avoir"?"(obligatoire)":"(facultatif)"}<select style={input} required={type==="avoir"} value={source} disabled={!!doc} onChange={e=>{setSource(e.target.value);const d=sources.find(x=>x.id===e.target.value);if(d)setLignes(d.lignes.map(l=>({...l})))}}><option value="">— Sélectionner —</option>{sources.map(d=><option key={d.id} value={d.id}>{d.type} · {d.jour} · {d.total_ttc} {d.devise}</option>)}</select><small>Document source brouillon uniquement à cette étape.</small></label>}
 <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:650,borderCollapse:"collapse"}}><thead><tr>{["Désignation","Quantité","Prix unitaire HT","Taxe (%)","Total HT",""].map((l,i)=><th key={i} style={{padding:6,textAlign:"left"}}>{l}</th>)}</tr></thead><tbody>{lignes.map((l,i)=><tr key={i}><td style={{width:"45%",padding:4}}><input aria-label="Désignation" value={l.designation} onChange={e=>edit(i,"designation",e.target.value)} style={input} required maxLength={500}/></td>{(["quantite","prix","taxe"] as const).map(k=><td key={k} style={{padding:4}}><input aria-label={k} type="number" step={k==="quantite"?"0.0001":"0.01"} min={k==="quantite"?"0.0001":"0"} max={k==="taxe"?"100":k==="quantite"?"9999999":"999999999999"} required value={l[k]} onChange={e=>edit(i,k,e.target.value)} style={{...input,minWidth:90}}/></td>)}<td style={{whiteSpace:"nowrap",padding:4}}>{fmt(amounts[i].ht)}</td><td><button type="button" disabled={lignes.length===1} onClick={()=>setLignes(lignes.filter((_,j)=>j!==i))} style={button}>×</button></td></tr>)}</tbody></table></div>
 <button type="button" onClick={()=>setLignes([...lignes,empty()])} disabled={lignes.length>=50} style={{...button,marginTop:10}}>+ Ajouter une ligne</button>
 <div style={{textAlign:"right",lineHeight:1.9,margin:"18px 0"}}>Total HT : {fmt(ht)}<br/>Taxes : {fmt(taxe)}<br/><strong>Total TTC estimé : {fmt(ht+taxe)}</strong></div><label>Notes<textarea name="notes" style={{...input,display:"block"}} rows={3} defaultValue={doc?.notes??""} maxLength={4000}/></label><button disabled={!cid} style={{...button,marginTop:16,background:"var(--navy)",color:"white"}}>Enregistrer le brouillon</button></form>;
}
