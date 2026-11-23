<!-- @component The one main action of a view. -->
<script>
  let { size = 'm', disabled = false, children, onclick } = $props();
</script>

<button class="acme-button acme-button--{size}" type="button" {disabled} {onclick}>{@render children?.()}</button>

<style>
  .acme-button { padding: 6px 12px; border: 0; border-radius: 6px; background: var(--acme-action); color: var(--acme-on-action); font: inherit; }
  .acme-button--l { padding: 10px 18px; }
  .acme-button:disabled { opacity: 0.5; }
</style>
