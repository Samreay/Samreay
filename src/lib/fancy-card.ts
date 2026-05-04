/**
 * 3D hover effect for `.fancy_card`. Ported verbatim from the Hugo theme's
 * `themes/sams-theme/assets/js/main.js`, with two changes:
 *
 *   1. Listeners are delegated to `document` instead of attached per-card.
 *      The Hugo build's `setup_fancy_card()` ran on `DOMContentLoaded`, but
 *      our cards are rendered by Svelte islands that hydrate after that
 *      event, so any per-card binding misses everything inside
 *      `<ReviewsExplorer>` / `<ArtistsExplorer>`. Delegation also gives us
 *      free coverage for cards that toggle visibility (filters, layout
 *      switches) without any re-binding.
 *   2. Mobile is detected via `(hover: none)` instead of the giant
 *      Detect-Mobile-Browsers UA regex; the effect needs hover anyway.
 */

interface CardCSSStyle extends CSSStyleDeclaration {
  setProperty(name: string, value: string): void;
}

function updateCardVars(card: HTMLElement, x: number, y: number): void {
  const rect = card.getBoundingClientRect();
  const absX = x - rect.left;
  const absY = y - rect.top;
  const pctX = Math.round((100 / rect.width) * absX);
  const pctY = Math.round((100 / rect.height) * absY);

  const bgX = Math.round(50 + pctX / 4 - 12.5);
  const bgY = Math.round(50 + pctY / 3 - 16.67);

  const nx = (pctX - 50) / 50;
  const ny = (pctY - 50) / 50;
  let hyp = Math.sqrt(nx * nx + ny * ny);
  if (hyp > 1.3) hyp = hyp * Math.exp(-3 * (hyp - 1.3));
  hyp = Math.min(hyp, 1.2);

  // Bell-curve falloff so over-the-edge tracking doesn't keep tilting harder.
  const calcAngle = (v: number) =>
    v * Math.exp(-10 * Math.max(0, Math.abs(v) - 1));
  const rotX = calcAngle(nx);
  const rotY = calcAngle(ny);

  const s = card.style as CardCSSStyle;
  s.setProperty('--posx', `${bgX}%`);
  s.setProperty('--posy', `${bgY}%`);
  s.setProperty('--mx', `${pctX}%`);
  s.setProperty('--my', `${pctY}%`);
  s.setProperty('--rx', `${-10 * rotX}deg`);
  s.setProperty('--ry', `${10 * rotY}deg`);
  s.setProperty('--o', '1');
  s.setProperty('--hyp', String(hyp));
}

function removeCardVars(card: HTMLElement): void {
  const s = card.style;
  for (const prop of ['--posx', '--posy', '--mx', '--my', '--rx', '--ry', '--o', '--hyp']) {
    s.removeProperty(prop);
  }
}

function getCard(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('.fancy_card');
}

export function setupFancyCards(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.fancyCardBound === '1') return;
  document.documentElement.dataset.fancyCardBound = '1';

  // Touch-only / no-hover devices skip the effect entirely. Saves a listener
  // and matches the Hugo build's `mobileCheck()` short-circuit.
  if (window.matchMedia?.('(hover: none)').matches) return;

  document.addEventListener('mousemove', (e) => {
    const card = getCard(e.target);
    if (!card) return;
    updateCardVars(card, e.clientX, e.clientY);
  });

  // `mouseout` (vs `mouseleave`) bubbles, which is what we need for delegation.
  // Guard against bubbling through child elements: only reset when the pointer
  // actually leaves the card subtree.
  document.addEventListener('mouseout', (e) => {
    const card = getCard(e.target);
    if (!card) return;
    const related = e.relatedTarget;
    if (related instanceof Node && card.contains(related)) return;
    removeCardVars(card);
  });
}
