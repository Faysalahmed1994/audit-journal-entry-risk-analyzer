# Going live on GitHub Pages (one-time)

The AuditJE web app is a static site in `docs/`. GitHub Pages hosts it for free; there is no server to run.

1. Open [Repository Settings → Pages](https://github.com/Faysalahmed1994/audit-journal-entry-risk-analyzer/settings/pages).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Select **Branch:** `main` and **Folder:** `/docs`, then **Save**.
4. After a minute or two, open **https://faysalahmed1994.github.io/audit-journal-entry-risk-analyzer/**.
5. If it does not appear, check the **pages-build-deployment** run under [Actions](https://github.com/Faysalahmed1994/audit-journal-entry-risk-analyzer/actions).

After that, every merge to `main` republishes the app automatically.

**Smoke test after going live:** open the site in Chrome or Edge → *Try the sample engagement* → walk through each step → generate the workpaper. Then choose *Start a new engagement*, pick an empty test folder, import `docs/assets/sample/synthetic_journal_entries.csv`, attach any image as a voucher, and confirm the files appear in the folder.

**What GitHub hosts:** only the app code and synthetic sample data. Client data is processed in each user's browser and saved to their own folder; nothing is sent to GitHub. Never commit client files to this repository (the `.gitignore` blocks common evidence formats and engagement folder names).

**Optional custom domain:** Settings → Pages → Custom domain (for example `auditje.yourdomain.com`), then add the CNAME record your DNS provider shows. Keep **Enforce HTTPS** on; folder saving requires HTTPS.
