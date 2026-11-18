# Castify App Verifier

Checks OTT app store URLs (Apple, Roku, Amazon, Samsung, LG) and reports whether each is live and matches the expected app.

## Setup
```
npm install
cp .env.example .env
npm start
```
Open http://localhost:3000

## Usage
- Paste a single URL (optionally expected name / developer), or upload a CSV with columns: `url,expected_name,expected_developer`
- Statuses: Verified, Mismatch, Broken, Needs Review
- Export results as CSV from the UI

## Adding a platform
1. Add a detection rule in `src/services/detector.service.js`
2. Create `src/adapters/<name>.adapter.js` extending `BaseAdapter`
3. Register it in `src/services/verifier.service.js`

## Notes
- Apple uses the iTunes Lookup API (reliable).
- Roku and Amazon are scraped; Amazon may show a robot check (reported as Needs Review). For JS-heavy pages use `src/utils/browser.js` (Playwright: `npx playwright install chromium`).
- Samsung and LG are placeholders until real URL formats are known.
# Castify-app-verifier
