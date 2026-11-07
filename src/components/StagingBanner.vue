<script setup lang="ts">
import {mayWriteLive} from '../integrations/firebase/stagingConfig'
</script>
<template>
 <div class="lab-banner">{{mayWriteLive()?'FIREBASE STAGING · SOLO PALESTRA TEST · SCRITTURE AUTORIZZATE':'FIREBASE STAGING · SOLO PALESTRA TEST · SCRITTURE DISABILITATE'}}</div>
</template>
