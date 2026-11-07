/** STEP 3P: bounds in UTC for the local Rome month displayed by the athlete.
 * A one-day margin on each side includes both CET and CEST midnight offsets.
 * Coach reservation queries deliberately retain their independent week margin.
 */
export function athleteSlotMonthWindow(month:string):{from:number;to:number}{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('MESE_PRENOTAZIONI_NON_VALIDO')
 const [year,m]=month.split('-').map(Number)
 if(year<2000||year>2100)throw new Error('MESE_PRENOTAZIONI_NON_VALIDO')
 const day=86_400_000
 return {from:Date.UTC(year,m-1,1)-day,to:Date.UTC(year,m,1)+day}
}
