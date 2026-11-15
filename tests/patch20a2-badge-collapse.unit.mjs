import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse, compileScript, compileTemplate} from '@vue/compiler-sfc'
const source = readFileSync(new URL('../src/components/WorkAttendanceBadge.vue', import.meta.url), 'utf8')
const {descriptor, errors} = parse(source)
test('badge starts collapsed whenever mounted; header alone toggles body', () => {
  assert.deepEqual(errors, [])
  const script = descriptor.scriptSetup.content
  const template = descriptor.template.content
  assert.match(script, /\bexpanded\s*=\s*ref\(false\)/)
  assert.doesNotMatch(script, /\bexpanded\.value\s*=/)
  assert.match(template, /:aria-expanded="expanded"\s+@click="expanded=!expanded"/)
  assert.match(template, /v-if="expanded" class="lf-work-body"/)
  assert.match(template, /Timbra entrata/)
  assert.match(template, /Timbra uscita/)
  assert.match(template, /Storico e report lavorativi/)
  assert.ok(compileScript(descriptor,{id:'lf-badge-test'}).content)
  assert.deepEqual(compileTemplate({source:template,filename:'WorkAttendanceBadge.vue',id:'lf-badge-test'}).errors,[])
})
