import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate,compileStyle} from '@vue/compiler-sfc'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app=read('src/App.vue'),dash=read('src/components/CoachDashboardRedesign.vue'),actions=read('src/components/DesktopShellActions.vue'),roster=read('src/views/LiveCoachAthletes.vue')
test('desktop communications use only the verified shell state and existing inbox policy',()=>{
 assert.match(app,/provide\(desktopActionsKey,computed<DesktopActions>/)
 assert.match(app,/visible:!!shownRole.value&&!inboxInHeader.value/)
 assert.match(app,/chatTo:chatPreviewEnabled.value&&shownRole.value\?chatRoute.value:null/)
 assert.match(app,/inboxSession:inboxVisibleOnRoute.value&&coachInboxEnabled\(\)\?stagingSession.value:null/)
 assert.match(app,/const inboxVisibleOnRoute=computed\(\(\)=>shownRole.value!=='coach'\|\|route.path==='\/coach'\)/)
 assert.doesNotMatch(actions,/chatPilotStatus|chatUnread\(|onSnapshot|setInterval/)
 assert.match(actions,/actions\?\.visible && \(actions.chatTo \|\| actions.inboxSession\)/)
})
test('desktop dashboard shares action row; other routes get in-flow group, no floating shortcut',()=>{
 assert.match(app,/<DesktopShellActions v-if="shownRole!=='coach'\|\|route.path!=='\/coach'" class="lf-desktop-page-actions"\/>/)
 assert.match(dash,/<DashboardSearch[^>]+\/>.*<DesktopShellActions\/>/)
 assert.doesNotMatch(app,/lf-chat-coach-top|lf-chat-desktop-shortcut/)
 assert.match(actions,/\.lf-desktop-chat-link\{position:relative/)
 assert.match(actions,/\.lf-desktop-shell-actions\.lf-desktop-page-actions\{width:100%/)
 assert.match(actions,/actions.inboxSession.uid\+': '\+actions.inboxSession.gymId|actions.inboxSession.uid\+':'\+actions.inboxSession.gymId/)
 assert.match(app,/<RouterLink v-if="chatPreviewEnabled && shownRole"[^>]+class="lf-chat-header-link"/)
})
test('two desktop sheet lists are bounded; mobile natural overflow and both menus preserved',()=>{
 assert.equal((roster.match(/class="assignment-scroll" role="region"/g)||[]).length,2)
 assert.match(roster,/max-height:none!important;overflow:visible!important/)
 assert.match(roster,/@media\(min-width:901px\)\{[\s\S]*?max-height:min\(500px,60vh\)!important;overflow-x:hidden!important;overflow-y:auto!important/)
 assert.match(roster,/\.assignment-scroll \.lf-assignment-more-menu\{\s*position:relative;top:auto;right:auto/)
 assert.match(roster,/if\(window.matchMedia\('\(min-width:901px\)'\).matches\)\{[\s\S]*?list.scrollTop\+=delta/)
 assert.equal((roster.match(/@toggle="onAssignmentMoreToggle"/g)||[]).length,2)
 for(const action of ['opened=g.sheet','editPersonal(g.sheet)','copyToArchive(g.sheet)','trashUnusedPersonal(g.sheet)','showDelete={title:g.sheet.title,links:g.links}']) assert.ok(roster.includes(action))
})
test('changed Vue files compile with actual script bindings and scoped CSS',()=>{
 for(const filename of ['src/App.vue','src/components/DesktopShellActions.vue','src/components/CoachDashboardRedesign.vue','src/views/LiveCoachAthletes.vue']){
  const {descriptor,errors}=parse(read(filename),{filename});assert.deepEqual(errors,[])
  const script=compileScript(descriptor,{id:filename});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename,id:filename,compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
  for(const style of descriptor.styles) assert.deepEqual(compileStyle({source:style.content,filename,id:filename,scoped:style.scoped}).errors,[])
 }
})
