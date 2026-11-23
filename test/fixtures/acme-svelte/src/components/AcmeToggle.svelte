<!-- @component Turns one setting on or off. -->
<script>
  let { pressed = false, label = 'Bold' } = $props();
  let on = $state(pressed);
</script>

<button class="acme-toggle" type="button" aria-pressed={on} onclick={() => (on = !on)}>{label}</button>

<style>
  .acme-toggle { padding: 6px 10px; border: 1px solid var(--acme-ink); border-radius: 6px; background: #fff; color: var(--acme-ink); }
  .acme-toggle[aria-pressed='true'] { background: var(--acme-ink); color: #fff; }
</style>
