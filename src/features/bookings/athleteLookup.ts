export type BookingAthlete = {id:string;name:string;email?:string}

function normalizeName(value:string):string {
 return value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
}
// Token search supports partial names, surnames in any order and accents.
// The selected UID is never derived from text; it must come from an explicit selection.
export function findBookingAthletes(roster:readonly BookingAthlete[],text:string):BookingAthlete[] {
 const tokens=normalizeName(text).split(' ').filter(Boolean)
 return roster.filter(a=>{const words=normalizeName(a.name).split(' ');return tokens.every(t=>words.some(w=>w.includes(t)))})
}
export function duplicateAthleteName(roster:readonly BookingAthlete[],a:BookingAthlete):boolean {
 return roster.some(b=>b.id!==a.id&&normalizeName(b.name)===normalizeName(a.name))
}
