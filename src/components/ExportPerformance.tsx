"use client";
export default function ExportPerformance({rows,filename}:{rows:string[][];filename:string}){
 function download(){const escape=(s:string)=>'"'+(/^[=+\\-@\t\r]/.test(s)? "'"+s:s).replace(/"/g,'""')+'"';const csv="\ufeff"+rows.map(r=>r.map(escape).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <button type="button" onClick={download} style={{padding:"8px 12px",background:"#1e3a5f",color:"white",border:0,borderRadius:7,fontWeight:600,cursor:"pointer"}}>↓ Exporter CSV</button>;
}
