# Recipe Game Plan

Import recipes by link or pasted text and get a step-by-step cooking plan: one screen per time block, the ingredients each step needs at the top, checkboxes, and a ready-by time that schedules every step. Several recipes in one meal are timed to finish together.

- Batch sizes from 1/2x to 3x scale every amount, the shopping list, and hands-on time.
- Shopping list for the whole meal, with checkboxes and a copy button.
- Recipe box saves every recipe you add, including your time fixes. Back it up or move it to another device with the backup box.

Files:
- `index.html` is the whole app (static, no build step).
- `functions/api/recipe.js` is a Cloudflare Pages Function that reads the recipe from a link. It tries the site directly, then the Internet Archive copy, then a reader service, and returns only the recipe. Link import only works on the Cloudflare-hosted site; pasting text works anywhere.
