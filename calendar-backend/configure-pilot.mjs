import {readFileSync,writeFileSync} from 'node:fs';
const from=new URL('../notifications-backend/functions/.env.app-palestra-b0b9d',import.meta.url),to=new URL('./functions/.env.app-palestra-b0b9d',import.meta.url);
const text=readFileSync(from,'utf8');const values={};for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*(LF_PUSH_PILOT_(?:GYM|ADMIN_UID|ATHLETE_UID))\s*=\s*([a-zA-Z0-9_-]+)\s*$/);if(m)values[m[1]]=m[2];}
const parts=['GYM','ADMIN_UID','ATHLETE_UID'];if(!parts.every(k=>/^[a-zA-Z0-9_-]{3,128}$/.test(values['LF_PUSH_PILOT_'+k]||'')&&!/^INSERISCI|^demo-/i.test(values['LF_PUSH_PILOT_'+k]))||values.LF_PUSH_PILOT_ADMIN_UID===values.LF_PUSH_PILOT_ATHLETE_UID)throw new Error('Controlla i tre identificativi pilota nel file delle notifiche.');
writeFileSync(to,'LF_CALENDAR_ENABLED=true\n'+parts.map(k=>`LF_CALENDAR_PILOT_${k}=${values['LF_PUSH_PILOT_'+k]}`).join('\n')+'\n',{flag:'wx'});console.log('Configurazione Calendar pilota creata. File notifiche invariato.');
