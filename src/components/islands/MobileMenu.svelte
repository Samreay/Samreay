
<script lang="ts">
  /**
   * Replaces Hugo's AlpineJS `x-data="{ expanded: false }"` hamburger
   * drawer. Mounted with `client:idle` from `Navbar.astro`. The SSR pass
   * leaves the drawer collapsed so the page is usable before hydration.
   */
  type NavItem = { link: string; label: string };
  type Props = { items: NavItem[] };
  let { items }: Props = $props();

  let expanded = $state(false);
  let drawer: HTMLElement | undefined = $state();
  let toggleBtn: HTMLButtonElement | undefined = $state();

  function close() {
    expanded = false;
  }

  function toggle(event: MouseEvent) {
    event.stopPropagation();
    expanded = !expanded;
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    function handleAway(event: MouseEvent) {
      if (!expanded) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (drawer && drawer.contains(target)) return;
      if (toggleBtn && toggleBtn.contains(target)) return;
      close();
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('click', handleAway);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleAway);
      document.removeEventListener('keydown', handleEscape);
    };
  });

  const drawerStyle = $derived(
    expanded && drawer
      ? `max-height: ${drawer.scrollHeight}px; opacity: 1`
      : 'max-height: 0; opacity: 0.8',
  );
</script>

<button
  type="button"
  bind:this={toggleBtn}
  class={['hamburger', expanded && 'active']}
  aria-label="Toggle menu"
  aria-controls="mobile-nav"
  aria-expanded={expanded}
  data-mobile-menu-toggle
  onclick={toggle}
>
  <span class="sr-only">Menu</span>
  <svg
    class="w-6 h-6 fill-current text-gray-300 hover:text-gray-200 transition duration-150 ease-in-out"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect y="4" width="24" height="2" rx="1" />
    <rect y="11" width="24" height="2" rx="1" />
    <rect y="18" width="24" height="2" rx="1" />
  </svg>
</button>

<nav
  id="mobile-nav"
  data-mobile-menu
  bind:this={drawer}
  class="absolute top-full z-20 left-0 w-full px-4 sm:px-6 overflow-hidden transition-all duration-300 ease-in-out"
  style={drawerStyle}
>
  <ul class="bg-gray-800 px-4 py-2">
    {#each items as item (item.link)}
      <li>
        <a
          href={item.link}
          class="flex text-gray-300 hover:text-gray-200 py-2"
          onclick={close}
        >{item.label}</a>
      </li>
    {/each}
  </ul>
</nav>
