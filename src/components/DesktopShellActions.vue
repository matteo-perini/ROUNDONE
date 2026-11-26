<script setup lang="ts">
import {inject} from 'vue'
import {RouterLink} from 'vue-router'
import LionIcon from './LionIcon.vue'
import InboxBell from './InboxBell.vue'
import {desktopActionsKey} from '../features/navigation/desktopActions'
const actions=inject(desktopActionsKey)
</script>
<template>
 <div v-if="actions?.visible && (actions.chatTo || actions.inboxSession)" class="lf-desktop-shell-actions" role="group" aria-label="Comunicazioni">
  <RouterLink v-if="actions.chatTo" :to="actions.chatTo" class="lf-desktop-chat-link" aria-label="Apri Messaggi Coach–Atleta" title="Messaggi">
   <LionIcon name="messages" :size="21"/><span>Messaggi</span>
   <span v-if="actions.unread>0" class="lf-desktop-chat-unread">{{actions.unread>99?'99+':actions.unread}}</span>
  </RouterLink>
  <InboxBell v-if="actions.inboxSession" :key="actions.inboxSession.uid+':'+actions.inboxSession.gymId" :session="actions.inboxSession"/>
 </div>
</template>
<style scoped>
.lf-desktop-shell-actions{display:flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px;min-width:0;max-width:100%;overflow:visible}
.lf-desktop-shell-actions.lf-desktop-page-actions{width:100%;margin:0 0 12px;flex:none}
.lf-desktop-chat-link{position:relative;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;min-height:44px;padding:0 13px;border:1px solid var(--outline,var(--border));border-radius:8px;background:var(--card2);color:var(--text);font-size:13px;font-weight:750;text-decoration:none;white-space:nowrap;flex:none}
.lf-desktop-chat-link svg{color:var(--mint);flex:none}
.lf-desktop-chat-link:hover,.lf-desktop-chat-link.router-link-active{border-color:var(--mint);color:var(--mint);background:var(--green-bg,var(--card2))}
.lf-desktop-chat-link:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
.lf-desktop-chat-unread{pointer-events:none;position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#c53546;color:#fff;display:grid;place-items:center;font-size:10px;font-weight:800;line-height:1;border:1px solid var(--card)}
.lf-desktop-shell-actions :deep(.lf17-bell-wrap){position:relative;flex:none;width:44px;height:44px;margin:0}
.lf-desktop-shell-actions :deep(.lf17-bell){width:44px;height:44px;min-height:44px;min-width:44px;box-sizing:border-box}
</style>
