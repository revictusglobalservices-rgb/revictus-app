"use client";
import { useState, type FormEvent } from "react";
type Statut = "Actif" | "Invité" | "Suspendu";
type Membre = { id: string; nom: string; email: string; role: string; manager: string; statut: Statut };
const exemples: Membre[] = [
  {id:"1",nom:"Manager exemple",email:"manager@example.com",role:"Manager",manager:"",statut:"Actif"},
  {id:"2",nom:"Collaborateur exemple",email:"collaborateur@example.com",role:"Collaborateur",manager:"1",statut:"Actif"}
];
const champ={padding:"10px 12px",border:"1px solid var(--border)",borderRadius:8,width:"100%",fontSize:14,background:"white"};
const btn={padding:"10px 14px",border:0,borderRadius:8,background:"var(--navy)",color:"white",cursor:"pointer",fontWeight:600};
export default function CollaborateursDemo(){
 const [membres,setMembres]=useState<Membre[]>(exemples);
 const [ouvert,setOuvert]=useState(false);
 const [nom,setNom]=useState("");
 const [email,setEmail]=useState("");
 const [role,setRole]=useState("Collaborateur");
 const [manager,setManager]=useState("");
 const [recherche,setRecherche]=useState("");
 const [filtre,setFiltre]=useState("Tous");
 const [message,setMessage]=useState("");
 function ajouter(e:FormEvent<HTMLFormElement>){
   e.preventDefault();
   const adresse=email.trim().toLowerCase();
   if(!nom.trim()||!adresse||membres.some(m=>m.email===adresse)){setMessage("Vérifiez le nom et l’adresse : aucun doublon autorisé.");return;}
   setMembres(a=>[...a,{id:crypto.randomUUID(),nom:nom.trim(),email:adresse,role,manager,statut:"Invité"}]);
   setNom("");setEmail("");setRole("Collaborateur");setManager("");setOuvert(false);setMessage("Invitation simulée : aucun e-mail envoyé.");
 }
 const visibles=membres.filter(m=>(filtre==="Tous"||m.statut===filtre)&&(m.nom+" "+m.email).toLowerCase().includes(recherche.toLowerCase()));
 return <main style={{maxWidth:1200,margin:"auto",padding:32}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><p style={{color:"var(--ink-2)",fontSize:13}}>Administration · Équipe</p><h1 style={{color:"var(--navy)",margin:"0 0 6px"}}>Collaborateurs</h1><p style={{color:"var(--ink-2)"}}>Gérer les membres et leurs accès.</p></div><button style={btn} onClick={()=>setOuvert(!ouvert)}>+ Ajouter un collaborateur</button></div>
   <p role="note" style={{background:"#fdf1de",padding:12,borderRadius:8,color:"#754b0d"}}>Démonstration : données fictives, aucune invitation réelle. Les modifications disparaissent au rechargement.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(135px,1fr))",gap:12,margin:"24px 0"}}>{["Tous","Actif","Invité","Suspendu"].map(s=><section key={s} className="card-2"><span style={{color:"var(--ink-2)"}}>{s==="Tous"?"Total":s}</span><div style={{fontSize:32,fontWeight:700,color:"var(--navy)",marginTop:8}}>{s==="Tous"?membres.length:membres.filter(m=>m.statut===s).length}</div></section>)}</div>
   {ouvert&&<section className="card-2" style={{marginBottom:20}}><h2 style={{marginTop:0,color:"var(--navy)"}}>Nouveau collaborateur</h2><form onSubmit={ajouter}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:16}}>
    <label>Nom complet<input style={champ} value={nom} onChange={e=>setNom(e.target.value)} placeholder="Prénom et nom" required maxLength={120}/></label>
    <label>E-mail<input style={champ} value={email} type="email" onChange={e=>setEmail(e.target.value)} placeholder="nom@example.com" required/></label>
    <label>Rôle<select style={champ} value={role} onChange={e=>setRole(e.target.value)}><option>Collaborateur</option><option>Manager</option></select></label>
    <label>Manager direct<select style={champ} value={manager} onChange={e=>setManager(e.target.value)}><option value="">Aucun manager</option>{membres.filter(m=>m.role==="Manager"&&m.statut==="Actif").map(m=><option key={m.id} value={m.id}>{m.nom}</option>)}</select></label></div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:12,marginTop:16}}><button type="button" onClick={()=>setOuvert(false)}>Annuler</button><button style={btn} type="submit">Simuler l’invitation</button></div>
   </form></section>}
   {message&&<p role="status" style={{background:"var(--accent-2-bg)",padding:12,borderRadius:8}}>{message}</p>}
   <section className="card-2"><div style={{display:"flex",gap:12,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}><h2 style={{color:"var(--navy)"}}>Membres de l’équipe</h2><div style={{display:"flex",gap:8}}><input aria-label="Recherche" placeholder="Rechercher..." style={{...champ,width:180}} value={recherche} onChange={e=>setRecherche(e.target.value)}/><select aria-label="Filtrer" style={{...champ,width:130}} value={filtre} onChange={e=>setFiltre(e.target.value)}>{["Tous","Actif","Invité","Suspendu"].map(s=><option key={s}>{s}</option>)}</select></div></div>
   <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:620,borderCollapse:"collapse",textAlign:"left"}}><thead><tr>{["Nom et e-mail","Rôle","Manager","Statut","Actions"].map(h=><th key={h} style={{padding:12,borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead><tbody>{visibles.map(m=><tr key={m.id} style={{borderBottom:"1px solid var(--border)"}}><td style={{padding:12}}><strong>{m.nom}</strong><div style={{fontSize:12,color:"var(--ink-2)"}}>{m.email}</div></td><td>{m.role}</td><td>{membres.find(x=>x.id===m.manager)?.nom??"—"}</td><td><span className={"badge "+(m.statut==="Actif"?"badge-normal":m.statut==="Invité"?"badge-accent":"badge-urgent")}>{m.statut}</span></td><td><button style={btn} onClick={()=>{setMembres(a=>a.map(x=>x.id===m.id?{...x,statut:x.statut==="Suspendu"?"Actif":"Suspendu"}:x));setMessage("Statut modifié dans la démonstration uniquement.");}}>{m.statut==="Suspendu"?"Réactiver":"Suspendre"}</button></td></tr>)}</tbody></table>{visibles.length===0&&<p>Aucun résultat.</p>}</div></section>
 </main>
}
