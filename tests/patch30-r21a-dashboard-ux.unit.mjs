import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dashboard=read('src/components/CoachDashboardRedesign.vue');
const settings=read('src/views/Settings.vue');
const css=read('src/styles-lionfit-redesign.css');
test('Il collegamento Personalizza apre la sezione esistente',()=>{
 assert.match(dashboard,/class="lf-dashboard-customize"/);
 assert.match(dashboard,/path:'\/impostazioni'/);
 assert.match(dashboard,/dashboard:'1'/);
 assert.match(settings,/dashboardOpen=ref\(route\.query\.dashboard==='1'\)/);
 assert.match(settings,/<DashboardPreferences v-if="dashboardOpen"\/>/);
});
test('La preview Emulator preserva il parametro source',()=>{
 assert.match(dashboard,/source:'emulator',dashboard:'1'/);
});
test('Nessun widget personalizzabile viene rimosso',()=>{
 for(const key of ['metrics','banner','actions','activity','distribution','appointments','summary','recent','shortcuts'])assert.match(dashboard,new RegExp(`visible\\('${key}'\\)`));
});
test('Il grafico a tre serie affianca le barre, senza cambiare la raccolta dati',()=>{
 assert.match(css,/\.lf-chart-column\{[^}]*flex-direction:row/);
 assert.match(css,/\.lf-chart-column\{[^}]*align-items:flex-end/);
 assert.match(css,/\.lf-chart-bar\{[^}]*flex:1 1 0/);
 for(const metric of ['day.booking','day.template','day.week'])assert.ok(dashboard.includes(metric));
 assert.match(dashboard,/v-for="day in days"/);
});
