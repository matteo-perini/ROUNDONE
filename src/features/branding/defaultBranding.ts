export const LIONFIT_DEFAULT_LOGO='/lionfit-defaults/lionfit-logo-official.png'
export const LIONFIT_DEFAULT_COVER='/lionfit-defaults/lionfit-gym-premium.jpg'
export const LIONFIT_DEFAULT_SENDER='LionFit Team'
const plain=(v:unknown,max=180)=>String(v||'').trim().replace(/\s+/g,' ').slice(0,max)
export function resolveBrandLogo(value:unknown){return plain(value,240000)||LIONFIT_DEFAULT_LOGO}
export function resolveBrandCover(value:unknown){return plain(value,420000)||LIONFIT_DEFAULT_COVER}
export function resolveSenderName(sender:unknown,gymName:unknown){return plain(sender,70)||plain(gymName,70)||LIONFIT_DEFAULT_SENDER}
