
<script lang="ts">
  /**
   * Tutorial code visibility toggle. Mirrors
   * `themes/sams-theme/layouts/partials/show-code.html`. The class is
   * applied to `#post-container`, which the SCSS bundle styles to hide
   * `.input_area` when present.
   */
  let showCode = $state(true);

  $effect(() => {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('post-container');
    if (!container) return;
    container.classList.toggle('hide-code', !showCode);
  });
</script>

<div>
  <ul
    class="grid gap-6 w-full md:grid-cols-2"
    style="list-style: none; padding-left: 0"
  >
    <li>
      <input
        type="radio"
        id="show-code"
        name="code-toggle"
        value="show-code"
        class="hidden peer"
        checked={showCode}
        onchange={() => (showCode = true)}
      />
      <label
        for="show-code"
        class="inline-flex justify-between items-center p-5 w-full text-gray-500 bg-gray-800 rounded-lg border border-gray-200 cursor-pointer peer-checked:border-2 peer-checked:border-main-300 peer-checked:text-white peer-checked:bg-gray-700 hover:text-gray-200 hover:bg-gray-700"
      >
        <div class="block w-full">
          <div class="w-full text-center text-lg font-semibold">Show me everything!</div>
          <div class="w-full text-center text-sm">Oh yeah, coding time.</div>
        </div>
      </label>
    </li>
    <li>
      <input
        type="radio"
        id="hide-code"
        name="code-toggle"
        value="hide-code"
        class="hidden peer"
        checked={!showCode}
        onchange={() => (showCode = false)}
      />
      <label
        for="hide-code"
        class="inline-flex justify-between items-center p-5 w-full text-gray-500 bg-gray-800 rounded-lg border border-gray-200 cursor-pointer peer-checked:border-2 peer-checked:border-main-300 peer-checked:text-white peer-checked:bg-gray-700 hover:text-gray-200 hover:bg-gray-700"
      >
        <div class="block w-full">
          <div class="w-full text-center text-lg font-semibold">Just the plots</div>
          <div class="w-full text-center text-sm">Code is nasty.</div>
        </div>
      </label>
    </li>
  </ul>
</div>
