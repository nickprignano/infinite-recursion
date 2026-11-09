# Putting the game on Cloudflare

The game is static files, served by Cloudflare Workers static assets with no Worker script.
[`wrangler.jsonc`](../wrangler.jsonc) names the Worker `infinite-recursion` and serves the repo folder;
[`.assetsignore`](../.assetsignore) leaves out the tests, tools and docs. There's no build step.

The owner does these steps in the Cloudflare dashboard. Nothing here needs a key or token in the
repo: Cloudflare's GitHub app deploys on each push to `main`.

## One-time setup

1. In the Cloudflare dashboard, open **Workers & Pages**, choose **Create application**, then
   **GitHub**.
2. Sign in to GitHub if asked, and pick `nickprignano/infinite-recursion`.
3. Settings:
   - **Project name**: `infinite-recursion`. It must match `name` in `wrangler.jsonc`, or the build fails.
   - **Production branch**: `main`.
   - **Build command**: leave empty.
   - **Deploy command**: `npx wrangler deploy` (the default).
   - **Root directory**: `/` (the default).
4. Choose **Save and Deploy**. When it finishes, the game is on the `infinite-recursion` `workers.dev` address the
   dashboard shows. Open it and play a wave to check.
5. Add the domain: open the `infinite-recursion` Worker, then its **Domains** tab (older dashboards:
   **Settings**, **Domains & Routes**), **Add**, **Custom domain**, and enter `infinite-recursion.prignano.ai`. Cloudflare adds the DNS record and
   certificate itself, because the domain's zone is already on the account.
6. Optional: on the same tab, turn off the `workers.dev` address so the
   game has one home.

## After that

Every merge to `main` deploys on its own. Other branches get preview builds if
**Settings**, **Builds** has non-production branch builds turned on. To roll back, open the
Worker's **Deployments** tab and pick an earlier version.

## Checking it

- `https://infinite-recursion.prignano.ai/` shows the title screen over a still swarm, with the site header above.
- `https://infinite-recursion.prignano.ai/test/` and `/tools/` return 404 (left out by `.assetsignore`).
- The browser console shows no errors.

## Installing and playing offline (manual check)

Do this once after each build that changes the app, on a real phone (the spec keeps it out of CI):

1. iPhone or iPad: open the site in Safari, tap Share, then **Add to Home Screen**. Android: open it
   in Chrome and use **Install app** (or the title screen's Install as an app button).
2. Open the installed app once while online, then turn on airplane mode, close it and open it
   again. It should show the title screen and play.
3. Turn airplane mode off. After a new version is merged, reopen the app: the title screen
   shows Update the game, which reloads into the new version.
