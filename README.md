# Recipe Game Plan

Import recipes by link or pasted text and get a step-by-step cooking plan: one screen per time block, the ingredients each step needs at the top, checkboxes, and a ready-by time that schedules every step. Several recipes in one meal are timed to finish together.

- Batch sizes from 1/2x to 3x scale every amount, the shopping list, and hands-on time.
- Shopping list for the whole meal, with checkboxes and a copy button.
- Recipe builder (`builder.html`) for recipes from your head, or to edit any saved one. Start blank or from a similar recipe found online, type ingredients and steps one per line, and tag times like `12m` or `1h30m wait`.
- Recipe box saves every recipe you add, including your time fixes. Back it up or move it to another device with the backup box.

Files:
- `index.html` is the main app (static, no build step).
- `builder.html` is the recipe builder and editor. It saves straight into the same recipe box.
- `core.js` holds the code both pages share: text parsing and the recipe model.
- `functions/api/recipe.js` is a Cloudflare Pages Function that reads the recipe from a link. It tries the site directly, then the Internet Archive copy, then a reader service, and returns only the recipe. Link import only works on the Cloudflare-hosted site; pasting text works anywhere.
