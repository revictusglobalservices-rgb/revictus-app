import DashboardManagerView,{type DashboardData} from "@/components/DashboardManagerView";
const data:DashboardData={date:"Vendredi 27 novembre",actualise:"10:24",personnes:[
{id:"1",nom:"Marc T.",etat:"present",horaire:"08:00–16:00",arrivee:"08:04",depart:"—",note:"+4 min"},
{id:"2",nom:"Sophie B.",etat:"present",horaire:"08:00–16:00",arrivee:"08:00",depart:"—"},
{id:"3",nom:"Alexis D.",etat:"pause",horaire:"08:00–16:00",arrivee:"07:58",depart:"—"},
{id:"4",nom:"Nina C.",etat:"present",horaire:"09:00–17:00",arrivee:"09:00",depart:"—"},
{id:"5",nom:"Yassine L.",etat:"non_pointe",horaire:"09:00–17:00",arrivee:"—",depart:"—"},
{id:"6",nom:"Élodie M.",etat:"conge",horaire:"—",arrivee:"—",depart:"—"},
{id:"7",nom:"Paul L.",etat:"a_venir",horaire:"16:00–00:00",arrivee:"—",depart:"—"}
],taches:[{id:"a",titre:"Traiter les litiges en attente",echeance:"2026-11-26T12:00:00Z",priorite:"urgent",retard:true},{id:"b",titre:"Contrôler le planning de la semaine",echeance:"2026-11-27T12:00:00Z",priorite:"urgent",retard:false},{id:"c",titre:"Préparer le récapitulatif client",echeance:"2026-11-28T12:00:00Z",priorite:"important",retard:false}],retards:1,corrections:3,conges:2,kanban:{a_faire:5,en_cours:7,en_attente:3,terminee:42},alertes:["1 collaborateur non pointé","1 tâche en retard","1 arrivée après l’heure prévue"]};
export default function Page(){return <div style={{display:"flex",minHeight:"100vh",background:"var(--app-bg)"}}><aside style={{background:"var(--sidebar-bg)",color:"white",width:190,flexShrink:0,padding:20}}><strong style={{fontSize:20}}>Revictus</strong><div style={{display:"grid",gap:20,marginTop:35,color:"var(--sidebar-text)"}}>{["Tableau de bord","Collaborateurs","Pointage","Mon planning","Planning équipe","Congés & absences","Congés équipe","Chrono","Kanban","Corrections","Boîte à idées"].map((n,i)=><span key={n} style={i===0?{color:"white",fontWeight:700,background:"var(--sidebar-bg-hover)",padding:9,borderRadius:6}:{fontSize:13}}>{n}</span>)}</div></aside><div style={{flex:1,minWidth:0}}><DashboardManagerView data={data} demo/></div></div>}
