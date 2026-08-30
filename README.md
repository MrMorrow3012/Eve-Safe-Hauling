# EVE Safe Hauling & Transport

An explainable route-risk prototype for EVE Online travel and hauling. Players can search EVE's public ESI for verified solar-system names, add systems such as Tama to a blocked list, and remove them with one click. Routes containing an excluded system are removed from consideration. This version is a fully static website: it needs no server, database, package installation, or build command.

## Publish with GitHub Pages

1. Create a new empty repository on GitHub.
2. Upload **the contents of this folder** to the repository. Make sure `index.html` is at the repository root.
3. Commit the files to the `main` branch.
4. Open the repository's **Settings → Pages**.
5. Under **Build and deployment**, choose **GitHub Actions** as the source.
6. Open the repository's **Actions** tab and wait for “Deploy EVE Safe Hauling” to finish.

GitHub will then display the public Pages URL. Later pushes to `main` redeploy automatically.

## Run locally

Double-click `index.html`, or serve this directory with any static web server.

## Current data status

The blocked-system autocomplete and complete jump-by-jump route call EVE's public ESI endpoints directly from the browser using the `2025-09-30` compatibility date. No EVE login is required, but those features need an internet connection. Danger activity and risk-score values remain demonstration data.

## Files

- `index.html`: application structure
- `styles.css`: responsive EVE-style interface
- `app.js`: route comparison and risk calculations
- `.github/workflows/pages.yml`: automatic GitHub Pages deployment

EVE Online and the EVE logo are the registered trademarks of CCP hf. This project is not affiliated with CCP hf.
