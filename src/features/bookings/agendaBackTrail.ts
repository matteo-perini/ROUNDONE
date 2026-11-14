/** Local navigation: the app router only sees /prenotazioni, not these screens. */
export type AthleteAgendaScreen='agenda'|'prenota'|'mie'|'competizioni'|'risultati'|'calendario'
export type AgendaPosition={windowTop:number;mainTop:number}
export type AgendaStep={screen:AthleteAgendaScreen;position:AgendaPosition}
const top=():AgendaPosition=>({windowTop:0,mainTop:0})
export class AgendaBackTrail {
 private steps:AgendaStep[]=[{screen:'agenda',position:top()}]
 visit(next:AthleteAgendaScreen,position:AgendaPosition){
  const current=this.steps[this.steps.length-1]
  if(current.screen===next)return
  current.position={...position}
  if(next==='agenda'){this.steps=[{screen:'agenda',position:top()}];return}
  this.steps.push({screen:next,position:top()})
  if(this.steps.length>32)this.steps.splice(1,1)
 }
 replace(next:AthleteAgendaScreen){
  if(next==='agenda'){this.steps=[{screen:next,position:top()}];return}
  if(this.steps.length>1)this.steps.pop()
  if(this.steps[this.steps.length-1].screen!==next)this.steps.push({screen:next,position:top()})
 }
 back():AgendaStep|null{
  if(this.steps.length<2)return null
  this.steps.pop()
  const previous=this.steps[this.steps.length-1]
  return {screen:previous.screen,position:{...previous.position}}
 }
}
