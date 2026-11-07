/** ROUNDONE public EmailJS configuration, preserved for the real-invite migration.
 * This module deliberately does NOT send emails or create invites. Enable the
 * send pipeline only after Auth, Firestore invite rules, rate limiting and URL
 * verification have passed on the final backend. These are PUBLIC client IDs,
 * never use EmailJS private keys in a mobile/web bundle.
 */
export const LEGACY_EMAILJS_PUBLIC = Object.freeze({
  serviceId: 'service_tyektbn',
  publicKey: 'LKUKhoszWLaNNRTK7',
  templateId: 'template_a27mk9g',
})
const TOKEN = /^[a-f0-9]{48}$/i
export function validateLegacyAthleteInviteLink(value: string, gymId: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === 'https://www.lionfit.it'
      && url.pathname === '/www/index.html'
      && url.searchParams.get('gym') === gymId
      && TOKEN.test(url.searchParams.get('athleteInvite') || '')
  } catch { return false }
}
export function legacyEmailJsPayload(email: string, link: string, gymId: string,
  apkLink: string, iosGuideLink: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indirizzo email non valido')
  if (!validateLegacyAthleteInviteLink(link,gymId)) throw new Error('Link invito non valido')
  return {
    service_id: LEGACY_EMAILJS_PUBLIC.serviceId,
    template_id: LEGACY_EMAILJS_PUBLIC.templateId,
    user_id: LEGACY_EMAILJS_PUBLIC.publicKey,
    template_params: {
      to_email: email.trim().toLowerCase(),
      invite_link: link,
      apk_link: apkLink,
      ios_guide_link: iosGuideLink,
    },
  }
}
