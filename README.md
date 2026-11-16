# Recipe Game Plan

Import recipes by link or pasted text and get a step-by-step cooking plan: one screen per time block, the ingredients each step needs at the top, checkboxes, and a ready-by time that schedules every step. Several recipes in one meal are timed to finish together.

- `index.html` is the whole app (static, no build step).
- `functions/api/recipe.js` is a Cloudflare Pages Function that reads the schema.org Recipe data from a recipe page. Link import only works when hosted on Cloudflare Pages; pasting text works anywhere.
