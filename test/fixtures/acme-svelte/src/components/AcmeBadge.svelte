<!-- @component A short status beside what it is about. -->
<script>
  export let tone = 'neutral'; // neutral | danger
  export let label = 'New';
</script>

<span class="acme-badge acme-badge--{tone}">{label}</span>

<style>
  .acme-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--acme-surface); color: var(--acme-ink); }
  .acme-badge--danger { background: var(--acme-danger); color: #fff; }
</style>
