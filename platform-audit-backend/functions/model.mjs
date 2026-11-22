// R21G — Pure validators for platform-owned commercial audit. No client claims trusted.
export const CONTROL_UID = 'bngmYLSrq5fTXlvxm62aAzGSoWJ3'
export const CONTROL_EMAIL = 'lionfit.control@gmail.com'
export const EVENT_KIND = 'commercial.exemption.changed'
export const PAGE_SIZE = 30
export function assertPlatformActor(auth) {
 const claims=auth?.token
 if(auth?.uid!==CONTROL_UID || claims?.email!==CONTROL_EMAIL || claims?.email_verified!==true || claims?.lionfitSuperAdmin!==true)
  throw new Error('FORBIDDEN')
 return auth.uid
}
export function readExemption(value){return typeof value?.exempt==='boolean'?value.exempt:null}
export function validatePreference(raw){
 if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('INVALID_ARGUMENT')
 if(Object.keys(raw).sort().join('|')!=='exempt|gymId')throw new Error('INVALID_ARGUMENT')
 const {gymId,exempt}=raw
 if(typeof gymId!=='string'|| !/^gym_[A-Za-z0-9_-]{3,116}$/.test(gymId)||typeof exempt!=='boolean')throw new Error('INVALID_ARGUMENT')
 return {gymId,exempt}
}
export function validateCursor(raw){
 if(raw==null)return null
 if(typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>k!=='cursor'))throw new Error('INVALID_ARGUMENT')
 const {cursor}=raw
 if(cursor===undefined||cursor===null||cursor==='')return null
 if(typeof cursor!=='string'||!/^([A-Za-z0-9_-]{16,80})$/.test(cursor))throw new Error('INVALID_ARGUMENT')
 return cursor
}
export function auditPayload(gymId,before,after,actorUid){
 return {kind:EVENT_KIND,targetType:'gym',gymId,beforeExempt:before,afterExempt:after,actorUid,schemaVersion:1}
}
export function serializeAudit(doc){
 const row=doc.data()||{}
 if(row.kind!==EVENT_KIND || typeof row.gymId!=='string' || typeof row.afterExempt!=='boolean')return null
 return {id:doc.id,kind:EVENT_KIND,gymId:row.gymId,beforeExempt:readBefore(row.beforeExempt),afterExempt:row.afterExempt,actorUid:String(row.actorUid||''),atMillis:typeof row.createdAt?.toMillis==='function'?row.createdAt.toMillis():null}
}
function readBefore(v){return typeof v==='boolean'?v:null}
