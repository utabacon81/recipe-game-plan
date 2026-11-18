/* Ticker for step alerts. Cloudflare Pages can't run on a schedule, so this tiny Worker
   runs every minute (Cron Trigger "* * * * *") and asks the app to send whatever alerts are due.
   Setup: Workers & Pages > Create > Worker > deploy the Hello World starter, Edit code, paste this file, Deploy.
   Then the Worker's Settings > Triggers > Cron Triggers > Add, every minute. */
const APP = "https://recipe-game-plan.pages.dev";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetch(APP + "/api/push?tick=1", { method: "POST" }));
  },
  async fetch() {
    const r = await fetch(APP + "/api/push?tick=1", { method: "POST" });
    return new Response("Game Plan alert ticker. Last run: " + (await r.text()), { headers: { "content-type": "text/plain" } });
  }
};
