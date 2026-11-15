export type WorkPoint={latitude:number;longitude:number}
export type WorkFix=WorkPoint&{accuracy:number}
export function validWorkPoint(p:WorkPoint):boolean{return Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180}
// A verified session supplies its own gym; no build-time tenant allowlist.
export function pilotAvailable(s:{gymId:string;role:string}|null):boolean{return !!s&&typeof s.gymId==='string'&&s.gymId.length>=3&&s.gymId.length<=120&&!s.gymId.includes('/')&&!s.gymId.includes('..')&&['titolare','collaboratore'].includes(s.role)}
// Presentation/device check, not a security boundary or proof of a genuine GPS fix.
export function pilotMobileDevice(userAgent:string,maxTouchPoints:number,nativeMobile=false):boolean{return nativeMobile||/Android|iPhone|iPad|iPod/i.test(userAgent)||(/Macintosh/i.test(userAgent)&&maxTouchPoints>1)}
export function distanceMetres(a:WorkPoint,b:WorkPoint):number{if(!validWorkPoint(a)||!validWorkPoint(b))throw new Error('Coordinate non valide');const r=Math.PI/180,dx=(b.latitude-a.latitude)*r,dy=(b.longitude-a.longitude)*r;const h=Math.sin(dx/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dy/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))))}
export function checkWorkArea(center:WorkPoint,fix:WorkFix,radius:number){if(!Number.isFinite(radius)||radius<20||radius>300||!Number.isFinite(fix.accuracy)||fix.accuracy<=0)throw new Error('Raggio o precisione non validi');const distance=distanceMetres(center,fix);const status=fix.accuracy>50?'uncertain':distance+fix.accuracy<=radius?'inside':distance-fix.accuracy>radius?'outside':'uncertain';return {distance:Math.round(distance),accuracy:Math.round(fix.accuracy),status} as const}
