# Recipe Game Plan

Import recipes by link or pasted text and get a step-by-step cooking plan: one screen per time block, the ingredients each step needs at the top, checkboxes, and a ready-by time that schedules every step. Several recipes in one meal are timed to finish together.

- Batch sizes from 1/2x to 3x scale every amount, the shopping list, and hands-on time.
- Shopping list for the whole meal, with checkboxes and a copy button.
- Recipe builder (`builder.html`) for recipes from your head, or to edit any saved one. Start blank or from a similar recipe found online, type ingredients and steps one per line, and tag times like `12m` or `1h30m wait`.
- Multi-day plans: set the meal's eat date and time, and give any recipe its own ready-by (stock Saturday, demi Sunday, sides Wednesday). Each recipe is scheduled backward from its own ready-by, with its prep right before its own cooking, and the timeline is grouped by day.
- Active hours (default 10am to 10pm): hands-on steps outside them are flagged on the recipe card and need an OK. Waits run any time; a soak, thaw or brine that would start overnight starts the evening before.
- Share a plan by link. Recipes, times, the clock and every checkbox sync between phones every few seconds.
- Recipe box saves every recipe you add, including your time fixes. Back it up or move it to another device with the backup box.

Files:
- `index.html` is the main app (static, no build step).
- `builder.html` is the recipe builder and editor. It saves straight into the same recipe box.
- `functions/api/plan.js` stores shared plans in Cloudflare D1. It needs a D1 binding named `DB` on the Pages project; tables are created automatically.
- `core.js` holds the code both pages share: text parsing and the recipe model.
- `functions/api/recipe.js` is a Cloudflare Pages Function that reads the recipe from a link. It tries the site directly, then the Internet Archive copy, then a reader service, and returns only the recipe. Link import only works on the Cloudflare-hosted site; pasting text works anywhere.
