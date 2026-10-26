# GitHub Pages — One-time activation

The GitHub repository is public and accepts forks and issue comments. The interactive preview resides in `docs/index.html`, with `docs/demo.js` and `docs/demo.css`.

To make the browser demo accessible on GitHub Pages, a repository administrator needs to make one settings change:

1. Open [Repository Settings → Pages](https://github.com/Faysalahmed1994/audit-journal-entry-risk-analyzer/settings/pages).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Select **Branch:** `main` and **Folder:** `/docs`.
4. Click **Save**.
5. Once GitHub reports deployment succeeded, open **https://faysalahmed1994.github.io/audit-journal-entry-risk-analyzer/**.
6. Visit [Actions](https://github.com/Faysalahmed1994/audit-journal-entry-risk-analyzer/actions) if deployment fails.

The preview uses only fixed synthetic entries and runs client-side; GitHub Pages cannot run the separate Python offline audit application. The site includes links to issues and the fork option.

All content in `/docs` is publicly publishable. Do not put confidential files anywhere in the repository.

The demo remains clearly labeled as a non-validated public preview and does not collect client data.

If the **Pages** menu is missing, your GitHub organization or account settings may prevent configuration. Confirm repository admin permissions and follow GitHub's Pages setup documentation.
