<script lang="ts">
  import { getContext } from 'svelte';

  const enterQuiz = getContext<() => void>('enterQuiz');
</script>

<div class="quiz-start-node">
  <button
    type="button"
    class="quiz-start-btn"
    onclick={() => enterQuiz?.()}
    aria-label="Start guided quiz mode"
  >
    🎯 Quiz me!
  </button>
</div>
