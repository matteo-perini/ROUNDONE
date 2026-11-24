import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate,compileStyle} from '@vue/compiler-sfc'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const chat=read('src/views/AthleteChatPreview.vue'),high=read('src/components/AthleteHomeHighlights.vue'),gym=read('src/components/GymIdentity.vue'),css=read('src/styles-r14c-dashboard-rebuild.css')
for(const file of ['src/views/AthleteChatPreview.vue','src/components/AthleteHomeHighlights.vue','src/components/GymIdentity.vue','src/components/LionIcon.vue'])test(`${file}: SFC, template and scoped CSS compile`,()=>{
 const {descriptor,errors}=parse(read(file),{filename:file});assert.deepEqual(errors,[])
 const script=compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({id:file,filename:file,source:descriptor.template.content,compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
 for(const style of descriptor.styles)assert.deepEqual(compileStyle({source:style.content,filename:file,id:'data-v-e4',scoped:style.scoped}).errors,[])
})
test('chat loading uses the same workspace as real conversations, inert skeleton and readable status',()=>{
 assert.match(chat,/v-else class="lf-chat-workspace"/);assert.match(chat,/v-if="loading" class="lf-chat-initial" role="status"/)
 assert.match(chat,/class="lf-chat-skeleton-row" aria-hidden="true"/);assert.doesNotMatch(chat,/v-else-if="loading" class="lf-chat-placeholder"/)
 assert.match(chat,/v-else-if="!verified&&!hintVisible"/)
})
test('chat revalidation never enables contacts before verification, even on warm hint',()=>{
 assert.equal((chat.match(/:disabled="!verified\|\|busy\|\|sending"/g)||[]).length,3)
 assert.match(chat,/:disabled="!verified\|\|!draft.trim\(\)\|\|busy\|\|sending"/)
 assert.match(chat,/hintVisible\?'Conversazione':\(t.lastText/)
 assert.match(chat,/await Promise.all\(\[chatContacts\(uid.value\),chatList\(uid.value\)\]\)/)
})
test('mobile composer has theme-aware controls, accessible send name and protected scroll gestures',()=>{
 assert.match(chat,/name="send" :size="21"/);assert.match(chat,/:aria-label="sending\?'Invio in corso':'Invia messaggio'"/)
 assert.match(chat,/\.lf-chat-composer textarea\{background:var\(--field\);border-color:var\(--border\);font-size:16px/)
 assert.match(chat,/\.lf-chat-workspace,\.lf-chat-sidebar,\.lf-chat-messages\{touch-action:pan-y pinch-zoom\}/)
 assert.match(chat,/\.lf-chat-composer button\{background:#126b45;color:#fff;min-height:46px/)
})
test('agenda distinguishes pending, errors, disabled and empty; skeleton does not announce fictitious data',()=>{
 for(const [flag,error] of [['bookingsReady','bookingsError'],['eventsReady','eventsError']]){assert.match(high,new RegExp(`v-if="!${flag}" class="lf15-event-loading" role="status"`));assert.match(high,new RegExp(`v-else-if="${error}"`))}
 assert.match(high,/v-else-if="!competitionsEnabled"/);assert.match(high,/Nessuna lezione prenotata/);assert.match(high,/Nessun evento futuro/)
 assert.match(css,/\.lf15-event-content\{display:flex;flex-direction:column/);assert.match(css,/\.lf15-event-open\{font-size:11px;margin-top:auto/)
})
test('identity suppresses temporary fallback only during live read; editor and resolved fallback remain',()=>{
 assert.match(gym,/!p.edit&&isStagingMode\(\)&&!!stagingSession.value&&read.value.gym.state==='loading'/)
 assert.match(gym,/v-if="!displayAppearancePending\|\|identity.cover"/);assert.match(gym,/v-if="displayAppearancePending&&!identity.logo"/)
 assert.match(gym,/v-if="displayNamePending" class="lf-e4-name-placeholder" role="status"/)
 assert.match(gym,/v-else>\{\{identity.name\|\|'LionFit'\}\}/);assert.match(gym,/v-if="nameReady" class="lf14-gym-identity"/)
 assert.match(gym,/stop=p.edit\?watchGymIdentity\(s,accept\):liveIdentityStream.acquire/)
})
