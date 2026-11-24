import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {previewPosition,isMobileSectionSlide} from '../src/features/navigation/continuousMotion.ts'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app=read('src/App.vue'),workspace=read('src/views/AthleteLiveWorkspace.vue'),helper=read('src/features/navigation/continuousMotion.ts')
test('neighbor travels with the outgoing page in both directions; same span even if pages differ in width',()=>{
 for(const offset of [0,7,80,160,260]){assert.equal(previewPosition(offset,390,1)-offset,-390);assert.equal(previewPosition(-offset,390,-1)+offset,390)}
})
test('scope to real mobile sections of the same role, preserve desktop and non-tab routes',()=>{
 for(const pair of [['/home','/piano'],['/piano','/archivio'],['/messaggi','/home'],['/coach','/coach/messaggi']])assert.ok(isMobileSectionSlide(...pair,390))
 for(const pair of [['/home','/coach'],['/home','/home'],['/piano','/impostazioni'],['/home','/allenamento/1']])assert.ok(!isMobileSectionSlide(...pair,390))
 assert.equal(isMobileSectionSlide('/home','/piano',800),false);assert.equal(isMobileSectionSlide('/coach','/coach/atleti',900),true);assert.equal(isMobileSectionSlide('/coach','/coach/atleti',901),false)
})
test('E.5.1 uses a gesture-only cue; only the authorized real route enters',()=>{
 assert.doesNotMatch(helper,/createSectionPreview|cloneNode|innerHTML|localStorage|sessionStorage|firebase|fetch\(/i)
 assert.doesNotMatch(app,/dragPreview|returningPreview|createSectionPreview/)
 assert.match(app,/continuousDragOffset\(dx,width,!!next\)/);assert.match(app,/router\.push\(/)
})
test('outgoing pages retain their measured geometry, are inert while leaving, and release state on cancellation',()=>{
 assert.match(workspace,/:inert="page!==props.screen"/);assert.match(workspace,/cancelTrack/);
 assert.match(helper,/offsetTop,offsetLeft,offsetWidth/);assert.match(helper,/element\.inert=true/);assert.match(helper,/element\.inert=previous\.inert/)
 for(const src of [app]){assert.match(src,/@leave-cancelled="cancelChatLeave"/);assert.match(src,/left:var\(--lf-leave-left,0px\)/);assert.match(src,/width:var\(--lf-leave-width,100%\)/);assert.match(src,/transition:transform 340ms cubic-bezier\(\.22,1,\.36,1\);/)}
})
test('one physical span shared by both real pages and cleanup on route changes; no repeated Vue mounting key',()=>{
 assert.match(app,/setProperty\('--lf-motion-span',`\$\{stage.clientWidth\}px`\)/);assert.match(app,/removeProperty\('--lf-motion-span'\)/);assert.match(app,/enteringPaths.get\(el\)===route.path/);assert.doesNotMatch(app,/:key="route.path"/)
 assert.match(read('src/styles-r14-athlete-home.css'),/:has\(\.lf-r14-home:not\(:where\(\.lf-motion-leaving \*\)\)\)/)
})
