# Maintaining the magnet cover catalogue

Edit the YAML in [src/data/magnet-covers](../src/data/magnet-covers/). Each series groups its editions and books. Standalone works can share `standalones.yaml` using `---` between documents. Reference each WebP by its path below [the cover asset directory](../src/assets/magnet-covers/). Put labelled source URLs on the edition for shared provenance or on individual books for specific artwork.

The workshop uses the edition ID, volume and optional part to identify a saved selection. Keep those values stable for published covers. An existing `idPrefix` preserves an older ID format. A series `reviewId` links its editions to a review. A book’s `rankedReviewId` assigns that book the review’s existing selection ID and position in the rankings. Set `omnibus` or `collection` on the individual book.

Run `npm run inventory:covers` to validate the catalogue and regenerate the [inventory](book-magnet-cover-inventory.md). The production build also runs this command. Pixel dimensions come from the stored WebPs.

## Source research

On 22 November 2026, the workshop had at least one cover from 42 of the 44 launched book campaigns in Wraithmarked’s project ledger. That includes 37 direct campaigns and five Wraithmarked × Podium campaigns. [Wraithmarked Project Pipeline](https://docs.google.com/spreadsheets/d/1dW5BByM2l9nIOaODL6I53eP6JxtrXQzcnaX2RCx-6Pc/edit) · [Campaign gallery](https://wraithmarked.com/pages/campaign-progress).

The existing collection also carries the *Stormweaver* jacket designs and *Mother of Learning: ARC 1*’s original Kickstarter cover. *Stormweaver* paperbacks and edge editions repeat the jacket artwork. [Stormweaver catalogue](../src/data/magnet-covers/warformed-stormweaver.yaml) · [Mother of Learning review cover](../content/reviews/mother_of_learning/cover.jpg).

Several covers use front panels isolated from campaign renders or book photos.

## Covers still missing

- The workshop excludes Cradle’s Kickstarter faux-leather set, the Wraithmarked editions of *Defiance of the Fall*, *Dracula*, *Free the Darkness*, *Labyrinth* and *Frankenstein*, and curated images with either dimension below 300 px.
- The workshop excludes the three *Legends & Lattes* and *Bookshops & Bonedust* images previously mistaken for cover fronts.
- Cradle’s 10th Anniversary paperback listings yielded distinct full fronts for books 1–6. Matching paperback fronts for books 7–12 and *Threshold* remain unverified. [Will Wight’s Cradle editions](https://www.willwight.com/cradle.html).
- The separate 2024 animatic campaign announced an alternate ebook cover for *Threshold*. A distinct front for that edition remains unverified. [Will Wight’s announcement](https://www.youtube.com/watch?v=SbX97l4KHtg).
- Andrew Rowe’s *Arcane Ascension* 7, *Weapons & Wielders* 5, and *The Lost Edge* 3 are still in progress, and finished covers remain unverified. The Aethon: Vault reveal shows book 1 and says covers for books 2–3 are in development. [Author’s updates](https://andrewkrowe.wordpress.com/author/andrewkrowe/) · [Aethon: Vault reveal](https://andrewkrowe.wordpress.com/2026/11/16/arcane-ascension-is-coming-to-bookstores-next-year/).
- Wraithmarked lists *The Inheritance Cycle* and *The Memoirs of Lady Trent Vol. 2* as prelaunch campaigns. [Inheritance Cycle](https://www.kickstarter.com/projects/wraithmarked/eragon) · [Memoirs of Lady Trent Vol. 2](https://www.kickstarter.com/projects/wraithmarked/ladytrent2).
- The Wraithmarked Kickstarter campaigns offered alternate or reversible jackets for some books. Finished, usable fronts remain unverified for the alternate jackets for *Orconomics*, *The Grey Bastards*, *The Sword of Kaigen*, *Where Loyalties Lie*, and the reversible *Mother of Learning: ARC 1* jackets. [Orconomics campaign](https://www.kickstarter.com/projects/wraithmarked/orcoandgb) · [Mother of Learning campaign](https://www.kickstarter.com/projects/wraithmarked/mol1dlx).
- *The Hunchback of Notre-Dame* is represented by its standard deluxe front. The alternate jacket and numbered presentation artwork remain unverified. [Wraithmarked’s edition page](https://hunchback.backerkit.com/hosted_preorders).
- The two exclusive *Odyssey* jackets lack confirmed, isolatable front panels. [The Odyssey campaign](https://www.kickstarter.com/projects/wraithmarked/odyssey-1).
- The exclusive jackets for *The Invisible Life of Addie LaRue* and *The Ultimate Hitchhiker’s Guide to the Galaxy* were announced. Their full front panels remain unverified. [Addie LaRue campaign](https://www.kickstarter.com/projects/wraithmarked/addielarue) · [Hitchhiker’s Guide campaign](https://www.kickstarter.com/projects/wraithmarked/hitchhikers).
- Obscured or incomplete images left separate case fronts unverified for *The Choice of Magic*, *A Gathering of Shadows*, *The Demon Spirit*, *A Deadly Education*, and *The Invisible Life of Addie LaRue*. *Dracula* and *Frankenstein* have verified jackets. A distinct case front remains unverified for each. [Wraithmarked campaign gallery](https://wraithmarked.com/pages/campaign-progress).
- The cases for *The Grey Bastards*, *Orconomics*, and *Blood Over Bright Haven* repeat the jacket art. Each repeated design has one inventory entry. [SPFBO campaign](https://www.kickstarter.com/projects/wraithmarked/orcoandgb) · [Wraithmarked store](https://wraithmarked.com/).
