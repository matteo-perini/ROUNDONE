/** Local, pure, conservative V1-style video lookup. Never changes stored IDs. */
import {searchKey} from './catalog.ts'
export type ExerciseVideo={name:string;url:string}
const distinct=['incline','decline','flat','seated','standing','single','left','right','reverse','wide','close','smith','dumbbell','barbell','cable','machine','assisted','band','bilanciere','manubri','manubrio','cavi','elastico','inclinato','inclinata','declinato','declinata','seduto','seduta','inverso','assistito','assistita']
export function videoNameSimilarity(a:string,b:string):number{
 const left=searchKey(a),right=searchKey(b)
 if(!left||!right)return 0
 if(left===right)return 1
 const aa=new Set(left.split(' ')),bb=new Set(right.split(' '))
 if(distinct.some(t=>aa.has(t)!==bb.has(t)))return 0
 const row=Array.from({length:right.length+1},(_,i)=>i)
 for(let i=1;i<=left.length;i++){
  let diagonal=row[0];row[0]=i
  for(let j=1;j<=right.length;j++){
   const old=row[j]
   row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(left[i-1]===right[j-1]?0:1))
   diagonal=old
  }
 }
 const edit=1-row[right.length]/Math.max(left.length,right.length)
 const common=[...aa].filter(t=>bb.has(t)).length
 const token=2*common/(aa.size+bb.size)
 return Math.max(edit,edit*.65+token*.35)
}
/** A tie or close alternate is deliberately not auto-selected. */
export function findVideoByName<T extends ExerciseVideo>(videos:readonly T[],name:string):T|null{
 const key=searchKey(name)
 if(!key)return null
 const exact=videos.filter(v=>searchKey(v.name)===key)
 if(exact.length===1)return exact[0]
 if(exact.length>1)return null
 const ranked=videos.map(v=>({video:v,score:videoNameSimilarity(name,v.name)}))
  .filter(x=>x.score>0.75).sort((a,b)=>b.score-a.score)
 if(ranked.length===0)return null
 if(ranked.length>1 && ranked[0].score-ranked[1].score<0.04)return null
 return ranked[0].video
}
