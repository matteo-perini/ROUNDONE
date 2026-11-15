import {validWorkPoint,type WorkPoint,type WorkFix} from './gpsPilot.ts'
export type WorkSite=WorkPoint&{name:string;radius:number;centerAccuracy:number}
export type WorkConfig={enabled:true;site1:WorkSite;site2:WorkSite|null}
export type WorkSiteId='site1'|'site2'
export const DEFAULT_WORK_RADIUS=80
export function validWorkRadius(radius:number){return Number.isInteger(radius)&&radius>=20&&radius<=300}
export function validWorkCenter(fix:WorkFix){return validWorkPoint(fix)&&Number.isFinite(fix.accuracy)&&fix.accuracy>0&&fix.accuracy<=25}
export function validWorkSite(value:unknown):value is WorkSite{
 if(!value||typeof value!=='object')return false
 const x=value as WorkSite
 return typeof x.name==='string'&&x.name.trim()===x.name&&x.name.length>=1&&x.name.length<=60&&validWorkRadius(x.radius)&&validWorkCenter({latitude:x.latitude,longitude:x.longitude,accuracy:x.centerAccuracy})
}
export function validWorkConfig(value:unknown):value is WorkConfig{
 if(!value||typeof value!=='object')return false
 const x=value as WorkConfig
 return x.enabled===true&&validWorkSite(x.site1)&&(x.site2===null||validWorkSite(x.site2))
}
export function workConfigRole(role:string){return role==='titolare'||role==='collaboratore'}
export function workConfigEditable(role:string){return role==='titolare'}
export function workSites(config:WorkConfig):{id:WorkSiteId;site:WorkSite}[]{return [{id:'site1',site:config.site1},...(config.site2?[{id:'site2' as const,site:config.site2}]:[])]}
