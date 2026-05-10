# Open Graph Image: Portrait vs Landscape Research Findings

*Research conducted May 2026*

## Executive Summary

The Open Graph protocol supports multiple `og:image` tags, but **no platform intelligently selects between them based on aspect ratio**. All major platforms simply use the first `og:image` tag. The universal recommendation is **1200×630 pixels (1.91:1 landscape)**, which works across every major platform except Pinterest.

---

## Can You Provide Both Portrait and Landscape og:image?

**The spec supports it — but platforms won't pick between them.**

The Open Graph protocol explicitly supports multiple `og:image` tags as arrays. You declare multiple `<meta property="og:image">` tags, each with their own width/height structured properties. The spec's own example shows three images with different dimensions on a single page.

However, platforms do not select the best-fitting image from the array based on aspect ratio:

- **Facebook** uses the first tag in the set — contrary to popular belief that the largest valid image is chosen. It even uses the first image if it's broken or invalid. Additional images are only available for manual selection by the user when sharing on Facebook desktop.
- **All other platforms** (LinkedIn, Discord, Slack, WhatsApp, etc.) also just grab the first `og:image`.
- The Yoast SEO team, after extensive cross-platform testing, concluded: *"It's impossible to specify different images for different networks, other than for Facebook and Twitter. The Facebook social image is used, by default, for all other networks."*

**Bottom line:** No platform will auto-select your portrait image when it would be more appropriate.

## The One Override Available: twitter:image

The only platform-specific escape hatch is the **`twitter:image`** meta tag. Twitter/X's card processor first checks for the Twitter-specific property, and if not present, falls back to the Open Graph property. This allows you to serve a different image to X/Twitter than to everyone else.

No other major platform offers an equivalent override mechanism.

---

## Preferred Aspect Ratios by Platform

### Landscape / ~1.91:1 (1200×630px) — The Universal Standard

| Platform | Recommended Size | Aspect Ratio | Notes |
|----------|-----------------|--------------|-------|
| **Facebook** | 1200×630 | 1.91:1 | Images under 600px wide display in smaller column format |
| **LinkedIn** | 1200×627 | ~1.91:1 | May crop taller images; clips a few pixels off edges |
| **Discord** | 1200×630 | ~1.91:1 | Renders rich embeds inline in channels |
| **Slack** | 1200×630 | ~1.91:1 | Unfurls links in channels and DMs |
| **WhatsApp** | 1200×630 | ~1.91:1 | Shows small square crop AND larger rectangular version |
| **iMessage** | 1200×630 | ~1.91:1 | Shows full-width preview |
| **Reddit** | 1200×630 | ~1.91:1 | Consistent with the standard |

### X/Twitter — 2:1 (1200×600 or 1200×628)

Twitter uses an exact 2:1 rectangle. A 1200×630 image loses approximately 2 pixels on each edge — completely invisible. The `summary_large_image` card type (1200×628) is recommended for maximum visual impact. Without `twitter:card` set to `summary_large_image`, Twitter may default to a small summary card with a tiny square thumbnail.

### Threads — 2:1 (1200×600)

Images that preview with shared links use a 2:1 aspect ratio.

### Pinterest — 2:3 Portrait (1000×1500) ⚠️ The Outlier

Pinterest is the **sole major platform** that strongly prefers portrait/vertical orientation. It favors vertical images in a 2:3 ratio (1000×1500px). Pinterest reads `og:image` tags, but a horizontal image won't be optimal there. Images outside the 2:3 ratio may be truncated. The standard practice is to create dedicated portrait pins through Pinterest's own tools rather than relying on og:image.

---

## Safe Zone Guidance

Even among platforms that agree on ~1.91:1, cropping varies slightly. Keep all critical content (text, logos, CTAs) within a **safe zone of roughly 1080×565 pixels, centered in the canvas**. This gives ~60px of breathing room on each side and accounts for:

- X/Twitter's 2:1 crop (shaves top/bottom)
- WhatsApp's rounded preview corners
- LinkedIn occasionally clipping a few pixels off the edges

---

## Recommended Implementation

### Minimal Setup (covers 95% of platforms)

```html
<!-- Primary image for all platforms -->
<meta property="og:image" content="https://yoursite.com/og-landscape.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Description of your image" />

<!-- Essential for X/Twitter large card display -->
<meta name="twitter:card" content="summary_large_image" />
```

### Complete Setup (with X/Twitter override if needed)

```html
<!-- Primary image for all platforms -->
<meta property="og:image" content="https://yoursite.com/og-landscape.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Description of your image" />

<!-- X/Twitter-specific override -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://yoursite.com/twitter-image.jpg" />
```

### Optional: Secondary Image for Pinterest

```html
<!-- Primary OG image (1200×630) -->
<meta property="og:image" content="https://yoursite.com/og-landscape.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<!-- Secondary image for Pinterest (1000×1500) -->
<meta property="og:image" content="https://yoursite.com/og-portrait.jpg" />
<meta property="og:image:width" content="1000" />
<meta property="og:image:height" content="1500" />
```

> **Note:** In practice, Pinterest will still likely use the first image. The secondary image approach is not reliably picked up. For Pinterest optimization, create dedicated pins through Pinterest's own content workflow.

---

## Key Takeaways

1. **Switch from portrait to 1200×630 landscape** — this is the single most impactful change for cross-platform compatibility.
2. **Always include `og:image:width` and `og:image:height`** — Facebook uses these to reserve space for the large preview even before the image is fetched.
3. **Always include `twitter:card` set to `summary_large_image`** — without it, X/Twitter may show a tiny thumbnail instead of a large preview.
4. **Keep critical content in the center 80%** of the image to survive all platform crops.
5. **For Pinterest**, create dedicated vertical pins separately rather than trying to serve portrait images via og:image.
6. **Image file constraints**: keep under 1MB (Twitter's limit), use JPEG/PNG/WebP, and avoid GIFs (displayed as static on most platforms).

---

## Sources

- [Open Graph Protocol Specification](https://ogp.me/)
- [Yoast: How social image sharing works](https://yoast.com/advanced-technical-seo-social-image-ogimage-tags/)
- [Twitter Developer Docs: Cards Getting Started](https://developer.twitter.com/en/docs/twitter-for-websites/cards/guides/getting-started)
- [Buffer: Social Media Image Sizes 2026](https://buffer.com/resources/social-media-image-sizes/)
- [OGMagic: Social Media Preview Image Sizes 2026](https://ogmagic.dev/blog/social-media-preview-image-sizes)
- [Pixola: OG Image Size Guide 2026](https://www.pixola.ai/blog/og-image-size-guide)
- [Rediate: OG Image Size Guide 2026](https://www.getrediate.com/blog/og-image-size-guide)
- [Zelolab: Open Graph Image Sizes](https://www.zelolab.com/blog/open-graph-image-sizes-optimize-social-media-share-previews/)
