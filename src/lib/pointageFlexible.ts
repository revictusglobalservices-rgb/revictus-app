import type {PointageFlexible} from "@/types/database";
export const ZONE="Indian/Antananarivo";
export function dateLocale(d=new Date()){const p=new Intl.DateTimeFormat("en-CA",{timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const f=(k:string)=>p.find(x=>x.type===k)?.value??"";return f("year")+"-"+f("month")+"-"+f("day")}
export function bornesJour(d=new Date()){const debut=new Date(dateLocale(d)+"T00:00:00+03:00").getTime();return {debut,fin:debut+86400000}}
export function dureeJour(s:PointageFlexible,now:number,debut:number,fin:number){return Math.max(0,Math.floor((Math.min(s.fin?Date.parse(s.fin):now,fin)-Math.max(Date.parse(s.debut),debut))/1000))}
export function formatDuree(s:number){return Math.floor(s/3600)+"h"+String(Math.floor(s%3600/60)).padStart(2,"0")}
