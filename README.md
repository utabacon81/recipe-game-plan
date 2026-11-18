# Recipe Game Plan

Import recipes by link or pasted text and get a step-by-step cooking plan: one screen per time block, the ingredients each step needs at the top, checkboxes, and a ready-by time that schedules every step. Several recipes in one meal are timed to finish together.

- Batch sizes from 1/2x to 3x scale every amount, the shopping list, and hands-on time.
- Shopping list for the whole meal, with checkboxes and a copy button.
- Recipe builder (`builder.html`) for recipes from your head, or to edit any saved one. Start blank or from a similar recipe found online, type ingredients and steps one per line, and tag times like `12m` or `1h30m wait`.
- Multi-day plans: set an eat date and time, and steps are scheduled backward with the day shown. Quiet hours (default 10pm to 10am) keep hands-on steps out of the night by stretching flexible waits like brines; anything that can't move asks for your OK.
- Share a plan by link. Recipes, times, the clock and every checkbox sync between phones every few seconds.
- Recipe box saves every recipe you add, including your time fixes. Back it up or move it to another device with the backup box.

Files:
- `index.html` is the main app (static, no build step).
- `builder.html` is the recipe builder and editor. It saves straight into the same recipe box.
- `functions/api/plan.js` stores shared plans in Cloudflare D1. It needs a D1 binding named `DB` on the Pages project; tables are created automatically.
- `core.js` holds the code both pages share: text parsing and the recipe model.
- `functions/api/recipe.js` is a Cloudflare Pages Function that reads the recipe from a link. It tries the site directly, then the Internet Archive copy, then a reader service, and returns only the recipe. Link import only works on the Cloudflare-hosted site; pasting text works anywhere.
