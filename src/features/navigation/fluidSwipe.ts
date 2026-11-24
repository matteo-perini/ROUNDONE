/** LionFit R22B.6B — optional finger-follow preview for existing mobile tabs.
 * Pure helpers: never perform routing and never read Firestore or modify permissions.
 */
export function swipeNeighbor(path:string,dx:number,order:readonly string[]):string|null{
 if(!Number.isFinite(dx)||dx===0)return null
 const index=order.indexOf(path)
 if(index<0)return null
 return order[index+(dx>0?-1:1)]??null
}
export function swipePreviewOffset(dx:number,dy:number,width:number,hasNeighbor:boolean):number{
 if(![dx,dy,width].every(Number.isFinite)||width<=0)return 0
 if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.4)return 0
 const magnitude=Math.abs(dx)
 // Ease the content toward the finger; provide a restrained rubber band at either edge.
 const limit=hasNeighbor?Math.min(width*.68,580):24
 const scaled=hasNeighbor?magnitude*.86:Math.sqrt(magnitude)*1.7
 return Math.sign(dx)*Math.min(limit,scaled)
}
export function shouldNavigateOnRelease(dx:number,dy:number,elapsedMs:number,width:number,hasNeighbor:boolean):boolean{
 if(!hasNeighbor||![dx,dy,elapsedMs,width].every(Number.isFinite))return false
 if(elapsedMs<50||elapsedMs>1100||width<=0)return false
 if(Math.abs(dx)<Math.abs(dy)*1.65)return false
 const distance=Math.abs(dx)
 const velocity=distance/Math.max(elapsedMs,1)
 const threshold=Math.min(125,Math.max(74,width*.22))
 return distance>=threshold||(distance>=42&&velocity>=.55)
}
export function snapBackDuration(offset:number,width:number):number{
 if(!Number.isFinite(offset)||!Number.isFinite(width)||width<=0)return 180
 return Math.round(Math.min(240,Math.max(135,140+Math.abs(offset)/width*180)))
}

/** R22B.6D: continue from the last painted offset, not from a fresh full-width slide. */
export function swipeCommitMotion(offset:number,width:number,direction:number):{offset:number;duration:number}|null{
 if(![offset,width,direction].every(Number.isFinite)||width<=0||direction===0||Math.sign(offset)!==Math.sign(direction)||Math.abs(offset)<3)return null
 const bounded=Math.sign(offset)*Math.min(Math.abs(offset),width*.68,580)
 return {offset:bounded,duration:Math.round(Math.max(180,340-160*Math.abs(bounded)/width))}
}
