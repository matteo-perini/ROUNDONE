/** Relative real dock item bounds; no layout reads or side effects in geometry. */
export type DockRect={left:number;top:number;width:number;height:number}
export function dockIndicatorGeometry(dock:DockRect,link:DockRect,borderLeft=0,borderTop=0){
 const x=link.left-dock.left-borderLeft,y=link.top-dock.top-borderTop
 if(![x,y,dock.width,dock.height,link.width,link.height,borderLeft,borderTop].every(Number.isFinite)||dock.width<=0||dock.height<=0||link.width<=0||link.height<=0||x< -1||y< -1||x+link.width>dock.width+1||y+link.height>dock.height+1)return null
 return {x,y,width:link.width,height:link.height}
}
