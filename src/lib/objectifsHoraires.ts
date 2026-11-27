import type {ObjectifHoraire} from "@/types/database";
export function jourSemaine(jour:string){const n=new Date(jour+"T12:00:00Z").getUTCDay();return n===0?7:n}
export function objectifAuJour(historique:ObjectifHoraire[],jour:string){return historique.filter(o=>o.date_effet<=jour).sort((a,b)=>b.date_effet.localeCompare(a.date_effet))[0]??null}
export function minutesObjectif(historique:ObjectifHoraire[],jour:string){const o=objectifAuJour(historique,jour);return o&&o.jours.includes(jourSemaine(jour))?o.objectif_minutes:0}
export function jourPlus(jour:string,n:number){const d=new Date(jour+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
