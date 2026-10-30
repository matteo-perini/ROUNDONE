/* Lion Fit Beta 0.27.4 — Page Assembly Spring.
 * Solo animazioni UI; non tocca Firebase, schede, login o dati utente.
 * La Web Animations API applica il movimento direttamente: nessuna dipendenza
 * da classi Tailwind o da CSS caricati in un ordine particolare.
 */
(function(){
 'use strict';
 window.LIONFIT_MOTION_VERSION = '0.27.4';
 console.info('[Lion Fit Motion] v0.27.4 caricato correttamente (fix file univoco).');
 const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const active = new Set();
 const seenDynamic = new WeakSet();
 let lastSection=null;
 let pending=0;
 let autoTimer=0;
 let lastCompose=0;

 function allowed(){ return !reduce?.matches && typeof Element.prototype.animate === 'function'; }
 function visible(el){
   if(!(el instanceof HTMLElement) || el.closest('.hidden,[hidden],[aria-hidden="true"]')) return false;
   const s=getComputedStyle(el);
   if(s.display==='none'||s.visibility==='hidden') return false;
   const r=el.getBoundingClientRect();
   return r.width>0 && r.height>0 && r.top<innerHeight+110 && r.bottom>-90;
 }
 function abort(){
   for(const a of active){try{a.cancel();}catch{}}
   active.clear();
 }
 function start(el,role,delay){
   if(!visible(el) || !allowed())return;
   // Il movimento volutamente ampio si percepisce anche sul telefono.
   // Composizione progressiva invariata; assestamento elastico più discreto.
   const title=[
     {offset:0,opacity:0,transform:'translate3d(0,-37px,0) scale(.94)'},
     {offset:.55,opacity:1,transform:'translate3d(0,3px,0) scale(1.006)'},
     {offset:.77,opacity:1,transform:'translate3d(0,-1px,0) scale(.999)'},
     {offset:1,opacity:1,transform:'translate3d(0,0,0) scale(1)'}
   ];
   const block=[
     {offset:0,opacity:0,transform:'translate3d(0,105px,0) scale(.84)'},
     {offset:.27,opacity:.92,transform:'translate3d(0,35px,0) scale(.94)'},
     {offset:.55,opacity:1,transform:'translate3d(0,-8px,0) scale(1.014)'},
     {offset:.77,opacity:1,transform:'translate3d(0,3px,0) scale(.997)'},
     {offset:1,opacity:1,transform:'translate3d(0,0,0) scale(1)'}
   ];
   const animation=el.animate(role==='title'?title:block,{
     duration:role==='title'?970:1250,
     delay, easing:'linear', fill:'both'
   });
   active.add(animation);
   animation.onfinish=()=>{
     active.delete(animation);
     // Al termine torna lo stile originale del componente.
     try{animation.cancel();}catch{}
   };
   animation.oncancel=()=>active.delete(animation);
 }
 function addNodesForSection(section){
   const results=[],used=new Set();
   function add(el,kind){if(el&&!used.has(el)&&visible(el)){
     used.add(el);results.push({el,kind});}}
   function children(el,max=7){return [...el.children].filter(c=>c instanceof HTMLElement&&visible(c)).slice(0,max);}
   function titleLike(el){return el.matches('h1,h2,h3,.lf14-welcome,.lf14-section-heading,.lf14-welcome-top,.lf26-version');}
   function tileGroup(el){return el.matches('.lf14-navgrid,.lf14-stats,.grid,.lf-quick-actions,#weeks-badges-bar,.lf-quick-panel');}
   for(const item of children(section,12)){
     if(tileGroup(item)){
       const cards=children(item,7);
       if(cards.length>1)cards.forEach(c=>add(c,'card'));
       else add(item,'panel');
     }else if(section.id==='section-community'&&item.children.length>1){
       const content=children(item,7);
       if(content.length>1)content.forEach((c,i)=>add(c,i===0?'title':'card'));
       else add(item,'panel');
     }else{
       add(item,titleLike(item)?'title':'panel');
     }
   }
   // Preferiamo i riquadri realmente presenti, senza animare l'intero layout sopra di essi.
   if(results.length<4){
     const known=section.querySelector('#library-grid-container,#admin-library-grid,#athletes-list,#saved-templates-list');
     if(known&&visible(known))children(known,5).forEach(c=>add(c,'card'));
   }
   return results.slice(0,14);
 }
 function compose(section){
   if(!visible(section) || !allowed()) return;
   abort();
   const items=addNodesForSection(section);
   // Intenzionale: la pagina si costruisce per circa due secondi.
   // Partenza subito, poi ingressi sfalsati di 145ms.
   items.forEach(({el,kind},i)=>start(el,kind,Math.min(145*i,1450)));
   lastSection=section.id;
   lastCompose=performance.now();
 }
 function visibleSection(){return [...document.querySelectorAll('main > section[id^="section-"]')].find(visible)||null;}
 function requestCompose(id,reason){
   if(!allowed())return;
   cancelAnimationFrame(pending);
   pending=requestAnimationFrame(()=>{
     pending=0;
     const selected=id&&document.getElementById('section-'+id);
     const section=selected&&visible(selected)?selected:visibleSection();
     if(section)compose(section);
     else if(reason==='initial')composeLogin();
   });
 }
 window.lfMotionEnter=function(id){requestCompose(String(id||''),'navigation');};
 function composeLogin(){
   if(!allowed())return;
   const m=document.querySelector('main'); if(!m||visibleSection())return;
   const elems=[...m.children].filter(visible).slice(0,5);
   if(!elems.length)return;
   abort();elems.forEach((el,i)=>start(el,i===0?'title':'panel',i*180));
   lastSection='login';
 }
 function observeChanges(){
   const main=document.querySelector('main'); if(!main||!window.MutationObserver)return;
   const mo=new MutationObserver(mutations=>{
     let newlyVisible=false;
     let newCards=[];
     for(const m of mutations){
       if(m.type==='attributes' && m.target.matches?.('main > section[id^="section-"]') && visible(m.target)){
         if(lastSection!==m.target.id) newlyVisible=true;
       }
       if(m.type==='childList' && m.addedNodes.length){
         const scope=m.target.closest?.('main > section[id^="section-"]');
         if(scope&&!visible(scope))continue;
         const list=m.target.closest?.('#athletes-list,#plan-assigned-list,#plan-weeks-container,#plan-independent-list,#community-roster-list,#saved-templates-list,#library-grid-container,#admin-library-grid');
         if(!list)continue;
         for(const n of m.addedNodes){
           if(n instanceof HTMLElement && !seenDynamic.has(n) && visible(n) && newCards.length<5){seenDynamic.add(n);newCards.push(n);}
         }
       }
     }
     if(newlyVisible){clearTimeout(autoTimer);autoTimer=setTimeout(()=>{
       const s=visibleSection(); if(s&&s.id!==lastSection)requestCompose(s.id,'observer');
     },28);return;}
     if(newCards.length && allowed() && performance.now()-lastCompose>550){
       newCards.forEach((n,i)=>start(n,'card',i*115));
     }
   });
   mo.observe(main,{subtree:true,attributes:true,attributeFilter:['class','hidden'],childList:true});
 }
 window.lfMotionNotice=function(title,message){
   const modal=document.getElementById('custom-alert-modal');if(!modal)return;
   const t=String(title||'').toLocaleLowerCase('it'),m=String(message||'').toLocaleLowerCase('it');
   const negative=/errore|fallit|non riuscit|incomplet|attenzione|impossibile|non salvata|non copiata|controlla/i.test(t+' '+m);
   const success=!negative && (/successo|completat|aggiornat|ripristinat|attivat|pronto|inviat|salvat/i.test(t)||/(?:salvat[ao]|creat[aoie]|assegnat[aoie]|ripristinat[aoie]|inviat[aoie]) (?:con successo|correttamente)/i.test(m));
   if(success&&!modal.querySelector('.lf27-checkmark')){
     const badge=document.createElement('span');badge.className='lf27-checkmark';badge.setAttribute('aria-hidden','true');
     badge.innerHTML='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 16.5l5.5 5.5L24 10" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
     const h=modal.querySelector('#custom-alert-title');h?.parentNode?.insertBefore(badge,h);
   }
   modal.classList.remove('lf27-success');
   if(success){void modal.offsetWidth;modal.classList.add('lf27-success');}
 };
 function init(){
   observeChanges();
   requestAnimationFrame(()=>{
     const section=visibleSection();
     if(section)compose(section);else composeLogin();
   });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
