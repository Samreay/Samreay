// Import Alpine.js
import "alpinejs";

import { focusHandling } from "cruip-js-toolkit";

// Import aos
import AOS from "aos";

AOS.init({
  once: true,
  disable: "phone",
  duration: 300,
  offset: 40,
  easing: "ease-out-sine",
});

window.AOS = AOS;
// import component from './components/component';

document.addEventListener("DOMContentLoaded", () => {
  focusHandling("outline");
});
