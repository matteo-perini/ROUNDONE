import {nativePagePaths,type NativePagePath} from './nativePageTrack.ts'
/** Only adjacent real pages are warmed. A previous window can remain during settlement. */
export const athleteScreenOrder=['chat','home','plan','archive','progress','agenda','profile'] as const
export type AthleteScreen=typeof athleteScreenOrder[number]
export const athleteScreenPath=Object.fromEntries(athleteScreenOrder.map((screen,index)=>[screen,nativePagePaths[index]])) as Record<AthleteScreen,NativePagePath>
export const coreAthleteScreen=(screen:AthleteScreen)=>screen==='home'||screen==='plan'||screen==='archive'
export function availableAthleteScreens(chatAllowed:boolean,screen:AthleteScreen):readonly AthleteScreen[]{
 // A direct chat link can display its disabled state, but cannot warm Chat from Home without eligibility.
 return chatAllowed||screen==='chat'?athleteScreenOrder:athleteScreenOrder.filter(s=>s!=='chat')
}
export function athletePageWindow(screen:AthleteScreen,mobile:boolean,chatAllowed=true):AthleteScreen[]{
 const order=availableAthleteScreens(chatAllowed,screen),i=order.indexOf(screen)
 return mobile?order.slice(Math.max(0,i-1),i+2):[screen]
}
export function athletePageUnion(a:readonly AthleteScreen[],b:readonly AthleteScreen[]):AthleteScreen[]{return athleteScreenOrder.filter(s=>a.includes(s)||b.includes(s))}
