import {nativePagePaths,type NativePagePath} from './nativePageTrack.ts'
/** Only adjacent real pages are warmed. A previous window can remain during settlement. */
export const athleteScreenOrder=['home','plan','archive','progress','agenda','profile'] as const
export type AthleteScreen=typeof athleteScreenOrder[number]
export const athleteScreenPath=Object.fromEntries(athleteScreenOrder.map((screen,index)=>[screen,nativePagePaths[index]])) as Record<AthleteScreen,NativePagePath>
export const coreAthleteScreen=(screen:AthleteScreen)=>screen==='home'||screen==='plan'||screen==='archive'
export function athletePageWindow(screen:AthleteScreen,mobile:boolean):AthleteScreen[]{
 const i=athleteScreenOrder.indexOf(screen)
 return mobile?athleteScreenOrder.slice(Math.max(0,i-1),i+2):[screen]
}
export function athletePageUnion(a:readonly AthleteScreen[],b:readonly AthleteScreen[]):AthleteScreen[]{return athleteScreenOrder.filter(s=>a.includes(s)||b.includes(s))}
