<script setup lang="ts">
import { computed } from 'vue'
const props=withDefaults(defineProps<{name:string;size?:number}>(),{size:22})
const paths:Record<string,string>={
 menu:'M4 6h16M4 12h16M4 18h16',
 home:'M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3V10.5Z',
 calendar:'M7 2v4M17 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
 'calendar-plus':'M7 2v4M17 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM12 12v6m-3-3h6',
 team:'M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a2 2 0 0 1-1.4-.6M8 14h7a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v4l1-1',
 user:'M20 21v-2a7 7 0 0 0-14 0v2M13 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
 archive:'M3 4h18v5H3V4ZM5 9v12h14V9M10 13h4',
 book:'M12 7c-4-3-7-2-9-1v14c3-2 6-2 9 1 3-3 6-3 9-1V6c-3-2-6-2-9 1Zm0 0v14',
 clipboard:'M9 4h6M9 3h6v4H9V3ZM7 5H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 13l3 3 5-5',
 settings:'M10.3 2h3.4l.5 2.6 1.4.6 2.2-1.5 2.4 2.4-1.5 2.2.6 1.4L22 10.3v3.4l-2.6.5-.6 1.4 1.5 2.2-2.4 2.4-2.2-1.5-1.4.6-.5 2.6h-3.4l-.5-2.6-1.4-.6-2.2 1.5-2.4-2.4 1.5-2.2-.6-1.4L2 13.7v-3.4l2.6-.5.6-1.4-1.5-2.2 2.4-2.4 2.2 1.5 1.4-.6L10.3 2Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
 camera:'M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
 plus:'M12 5v14M5 12h14',
 search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 5 5',
 bin:'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7',
 repeat:'M3 12a9 9 0 1 0 3-7M3 4v5h5',
 mail:'M3 5h18v14H3V5Zm0 1 9 7 9-7',
 moon:'M20 16a8 8 0 0 1-12-12 8 8 0 1 0 12 12Z',
 sun:'M12 3v2m0 14v2M3 12h2m14 0h2M5.5 5.5l1.5 1.5m10 10 1.5 1.5m0-13-1.5 1.5m-10 10-1.5 1.5M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
 x:'M5 5l14 14M19 5 5 19',
 chevron:'m9 18 6-6-6-6',
 check:'M4 12l5 5L20 6',
 save:'M4 3h14l3 3v15H3V3h1Zm3 0v6h9V3M7 21v-8h10v8',
 copy:'M8 8h13v13H8V8ZM3 3h13v3M3 3v13h3',
 dumbbell:'M2 9v6M6 7v10M18 7v10M22 9v6M6 12h12',
 clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
 back:'M15 18l-6-6 6-6',
 logout:'M10 17l5-5-5-5M15 12H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7',
 gym:'M2 12h20M5 7v10M8 9v6M16 9v6M19 7v10',
 shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
 filter:'M4 7h16M7 12h10M10 17h4',
 edit:'M4 20l5-1 11-11-4-4L5 15l-1 5Zm10-14 4 4',
 info:'M12 12v5m0-9v1M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'
}
const path=computed(()=>paths[props.name]??paths.info)
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="name==='settings'?1.7:1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="path"/></svg></template>
