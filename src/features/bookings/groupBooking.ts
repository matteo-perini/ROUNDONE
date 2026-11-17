/** PATCH 30 R8B: group size is metadata on ONE appointment, not additional athletes. */
export const MAX_PRIVATE_PARTICIPANTS=6
export function validParticipantCount(value:unknown):value is number{return typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=MAX_PRIVATE_PARTICIPANTS}
export function participantCount(value:unknown):number{return validParticipantCount(value)?value:1}
export function groupLabel(value:unknown):string{const n=participantCount(value);return `${n} ${n===1?'persona':'persone'}`}
/** Existing Rules accept single bookings only. Enable group writes only after Rules emulator validation + deployment. */
export function groupBookingEnabled():boolean{return import.meta.env.VITE_LIONFIT_GROUP_BOOKING_ENABLED==='true'}
