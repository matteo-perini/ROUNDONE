import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const profile=read('src/components/ProfileOverview.vue'),settings=read('src/views/Settings.vue'),translations=JSON.parse(read('src/features/i18n/en.json'))
test('profile and settings compile with actual bindings',()=>{
 for(const [filename,source] of [['ProfileOverview.vue',profile],['Settings.vue',settings]]){
  const {descriptor,errors}=parse(source,{filename});assert.deepEqual(errors,[])
  const script=compileScript(descriptor,{id:filename});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename,id:filename,compilerOptions:{bindingMetadata:script.bindings}}).errors,[])
 }
})
test('athlete mobile profile hides duplicate settings links, preserves settings row, photo, edit and workouts',()=>{
 assert.match(profile,/@media\(max-width:767px\)/)
 assert.match(profile,/\.app\.as-athlete \.lfp-athlete \.lfp-heading :is\(\.eyebrow,p,\.lfp-gear\),\s*\.app\.as-athlete \.lfp-athlete \.lfp-hero-actions>\.lfp-outline\{display:none\}/)
 assert.match(profile,/class="lfp-section-button lfp-settings-link" :to="settingsTo"/)
 assert.match(profile,/@click="emit\('edit'\)"/);assert.match(profile,/@click="emit\('photo'\)"/)
 assert.match(profile,/v-if="athlete && workoutsEnabled"[^>]*to="\/progressi"/)
})
test('settings retain real actions, role gates and accessible language selection',()=>{
 assert.doesNotMatch(settings,/Unità di misura|Interface language · impostazione locale/)
 assert.match(settings,/lfsettings lfsettings-compact lfsettings-v23/)
 assert.match(settings,/\.app\.as-athlete \.lfsettings-v23/)
 assert.match(settings,/v-if="linkedAllowed&&linkedOpen"/)
 assert.match(settings,/v-if="canResetPassword"/)
 for(const value of ['pushOpen','calendarOpen','privacyHref','termsHref','infoOpen','to="/assistenza"','@click="exit"','setInterfaceLanguage'])assert.ok(settings.includes(value),value)
 assert.equal(translations['Lingua dell’interfaccia'],'Interface language')
})
