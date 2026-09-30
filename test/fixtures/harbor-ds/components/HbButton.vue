<!-- Harbor button (fictional). Figma and the code name every value the same way. -->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'Primary' | 'Secondary'; size?: 'Small' | 'Large'; label?: string }>(), { variant: 'Primary', size: 'Small', label: 'Continue' });
</script>
<template><button :class="['hb-button', { 'hb-button--secondary': variant === 'Secondary' }]" type="button">{{ label }}</button></template>
