# Sceaux Sérénité — Site

Static website for Sceaux Sérénité, hosted live via GitHub Pages.

- **Live URL**: [https://martyzhou.github.io/room-site/](https://martyzhou.github.io/room-site/)

## Real-Time Deployment (GitHub Pages)

Whenever changes are pushed or merged into the `master` branch, GitHub Actions automatically builds the TypeScript assets and deploys the updated static site to GitHub Pages in real time.

### First-Time Repository Configuration:
To ensure GitHub Pages uses the automated workflow:
1. Navigate to **Settings** > **Pages** in the GitHub repository.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.

## Local Development

```bash
# Install dependencies
npm install

# Build TypeScript to app.js
npm run build

# Start local development server
npm run serve
```

Other available commands:
- `npm run watch`: Auto-rebuild TypeScript (`src/app.ts`) on file changes.
- `npm run bundle:content`: Rebuild `content/bundle.js` for standalone local `file://` execution.
- `npm run typecheck`: Run TypeScript typechecks across source files and scripts.