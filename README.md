# Catamount Movies (GitHub Pages version)

Shows what's playing at Catamount Arts in St. Johnsbury, VT, grouped by day —
hosted entirely on GitHub, no Cloudflare account needed.

## How it works

- `scripts/scrape.mjs` fetches catamountarts.org's Film listing and each
  show's detail page, and writes the result to `docs/movies.json`.
- `.github/workflows/update-movies.yml` runs that script automatically every
  30 minutes (and commits the updated `movies.json` back to the repo).
- `docs/index.html` is a plain webpage that reads `movies.json` and displays
  it as day tabs. GitHub Pages serves this folder as your website.

## Setup (all on github.com)

1. Create a new repository and upload this whole folder to it (drag the
   `.github`, `docs`, and `scripts` folders, plus this README, into the
   "Add file → Upload files" box on your repo's page).
2. Go to **Settings → Actions → General**, scroll to "Workflow permissions,"
   select **Read and write permissions**, and save. (This lets the scheduled
   job commit the updated `movies.json` file.)
3. Go to **Settings → Pages**, and under "Build and deployment" set
   **Source: Deploy from a branch**, **Branch: main**, **Folder: /docs**,
   then save.
4. Go to the **Actions** tab, click "Update Catamount Movies" in the list,
   then click **Run workflow** to trigger it once by hand instead of waiting
   for the schedule.
5. After that run finishes (green checkmark), GitHub will show you your
   Pages URL under Settings → Pages — something like
   `https://yourname.github.io/your-repo-name/`. Open it.

From then on, the Action re-scrapes every 30 minutes on its own — you don't
need to do anything else.

## Customizing

- **How often it updates** — the `cron` line in
  `.github/workflows/update-movies.yml` controls this. GitHub Actions'
  free-tier scheduled jobs can be delayed a few minutes during busy periods;
  that's normal.
- **Which shows appear** — Catamount tags some non-movie broadcasts (Met
  Opera, National Theatre) under "Film" too. To filter those out, add a
  title check in `scripts/scrape.mjs`'s `main()` function.

If Catamount redesigns their site, this will quietly stop finding new
movies. The `extractTitle` / `extractDates` functions in
`scripts/scrape.mjs` are the first place to fix.
