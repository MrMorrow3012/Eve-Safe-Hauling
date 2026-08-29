# EVE Safe Hauling & Transport

An explainable route-risk prototype for EVE Online travel and hauling. Players can exclude systems such as Tama, and routes containing an excluded system are removed from consideration. This version is a fully static website: it needs no server, database, package installation, or build command.

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

The interface and score calculations work, but the route and danger activity values are demonstration data. The planned next layer is live EVE ESI routing plus current kill and gate-camp activity.

## Files

- `index.html`: application structure
- `styles.css`: responsive EVE-style interface
- `app.js`: route comparison and risk calculations
- `.github/workflows/pages.yml`: automatic GitHub Pages deployment

EVE Online and the EVE logo are the registered trademarks of CCP hf. This project is not affiliated with CCP hf.
