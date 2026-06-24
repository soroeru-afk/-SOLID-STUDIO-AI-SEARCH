<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f63b6bc3-6c55-46f4-9e5d-fb3fd3ad6335

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

This app is configured to deploy to GitHub Pages from the `gh-pages` branch. Pushing to `main` updates the source code, but does NOT trigger a redeployment.

To deploy your changes, run:
```bash
npm run deploy
```
