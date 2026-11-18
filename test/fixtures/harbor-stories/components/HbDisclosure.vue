<!-- Harbor disclosure (fictional). It keeps its own state, so only a page that runs its script can open it: a story does,
     a page of markup alone does not. -->
<script setup lang="ts">
import { ref } from 'vue';
const props = withDefaults(defineProps<{ label?: string; open?: boolean }>(), { label: 'Details', open: false });
const expanded = ref(props.open);
</script>
<template>
  <div class="hb-disclosure">
    <button type="button" class="hb-disclosure__summary" :aria-expanded="expanded" aria-controls="hb-disclosure-panel" @click="expanded = !expanded">{{ label }}</button>
    <div id="hb-disclosure-panel" class="hb-disclosure__panel" :hidden="!expanded">The panel.</div>
  </div>
</template>
