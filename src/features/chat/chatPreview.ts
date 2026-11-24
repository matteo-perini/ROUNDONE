/** R22B.3: show Chat on the reviewed LIVE pilot build only.
 * This is a UI/route toggle, never an authorization boundary: App.vue also
 * requires lfChatPilotStatus=true and every callable checks the server ACL.
 * Normal LIVE builds without the explicit opt-in remain disabled.
 */
export const CHAT_PREVIEW_ENABLED =
  import.meta.env.DEV ||
  (import.meta.env.MODE === 'staging' && import.meta.env.VITE_LIONFIT_CHAT_PREVIEW === 'ON') ||
  (import.meta.env.MODE === 'production' && import.meta.env.VITE_LIONFIT_CHAT_BETA === 'LIVE_PILOT_REVIEWED')
