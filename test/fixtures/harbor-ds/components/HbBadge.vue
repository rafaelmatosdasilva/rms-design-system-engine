<!-- Harbor badge (fictional). The code writes its tones in lowercase: the same meaning, not the same name. -->
<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'danger'; label?: string }>(), { tone: 'neutral', label: 'Draft' });
</script>
<template><span :class="['hb-badge', `hb-badge--${tone}`]">{{ label }}</span></template>
