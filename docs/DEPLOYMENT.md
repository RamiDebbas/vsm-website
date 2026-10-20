# Deployment

## 1. GitHub Pages (free)

Repository: **`RamiDebbas/vsm-website`** (public: Pages is free for public repos).
The workflow `.github/workflows/deploy.yml` typechecks, tests, builds, inspects and publishes on every push to
`main`. A failing check never publishes: `deploy` runs only after `build` succeeds.

One-time setup, **in this order** (the first CI run fails if Pages isn't enabled before the first push):

1. Create the repository **empty** (no README, licence or .gitignore) and don't push yet.
2. Enable Pages in Actions mode: **Settings → Pages → Source: GitHub Actions**, or
   `gh api -X POST repos/RamiDebbas/vsm-website/pages -f build_type=workflow`.
3. Pushing `.github/workflows/*` needs a token with the **`workflow`** scope. Run
   `gh auth refresh -h github.com -s workflow` once. Push with gh's credential (`gh auth setup-git`), not an
   older keychain credential.
4. Push `main`. The site appears at `https://ramidebbas.github.io/vsm-website/`.

Commits use the GitHub **noreply** address (`git config user.email <id>+RamiDebbas@users.noreply.github.com`, set
in this repo), so no personal email is published in the public history.

What is published: the site source, tests, docs and generators. These stay on the owner's machine (git-ignored):
business-card data and print files, logo exploration renders (`brand/concepts/`), and third-party reference images
(`brand/references/`).

## 2. Custom domain: vsmgrp.com (GoDaddy DNS, Microsoft 365 email)

Connecting the domain and the HTTPS certificate are free. Because the site deploys with GitHub Actions, **no
`CNAME` file is used**: the domain is set in the repository's Pages settings.

> **Email must keep working.** vsmgrp.com's mail runs on Microsoft 365 (bought through GoDaddy). Change **only** the
> records listed under "Change". Don't move the nameservers, and don't use GoDaddy's "Connect to a website",
> "Forwarding" or "Reset DNS" wizards.

### Steps

1. **Verify the domain on GitHub first** (takeover protection): github.com → your **Settings → Pages → Add a
   verified domain** → `vsmgrp.com`. GitHub shows a TXT record. Add it in GoDaddy (**Domain → DNS → Add**):
   type `TXT`, name `_github-pages-challenge-RamiDebbas`, value as shown. Click **Verify**.
2. **GoDaddy → Domain → Forwarding:** make sure domain forwarding/parking is **off**, because it re-creates the
   parking records.
3. **GoDaddy DNS, change these records:**

   | Action | Type | Name | Value |
   | --- | --- | --- | --- |
   | Delete | A | `@` | `3.33.130.190` (GoDaddy parking) |
   | Delete | A | `@` | `15.197.148.33` (GoDaddy parking) |
   | Add | A | `@` | `185.199.108.153` |
   | Add | A | `@` | `185.199.109.153` |
   | Add | A | `@` | `185.199.110.153` |
   | Add | A | `@` | `185.199.111.153` |
   | Add | AAAA | `@` | `2606:50c0:8000::153` |
   | Add | AAAA | `@` | `2606:50c0:8001::153` |
   | Add | AAAA | `@` | `2606:50c0:8002::153` |
   | Add | AAAA | `@` | `2606:50c0:8003::153` |
   | Edit | CNAME | `www` | `ramidebbas.github.io` (was `vsmgrp.com`, i.e. `@`) |

   **Do not touch:** NS, `MX` (`vsmgrp-com.mail.protection.outlook.com`), the two `TXT @` records (SPF
   `v=spf1 include:secureserver.net -all` and `NETORGFT….onmicrosoft.com`), `autodiscover`, `selector1/2._domainkey`,
   `_dmarc`, `lyncdiscover`, `sip` and the two `SRV` records.
4. **Set the custom domain** (Repository **Settings → Pages → Custom domain** → `vsmgrp.com`), or:

   ```bash
   gh api -X PUT repos/RamiDebbas/vsm-website/pages -f cname=vsmgrp.com
   ```

   GitHub checks DNS and issues the certificate (minutes to about an hour). Then enforce HTTPS and redeploy, so the
   canonical URL, sitemap and share image use `https://vsmgrp.com`:

   ```bash
   gh api -X PUT repos/RamiDebbas/vsm-website/pages -F https_enforced=true
   gh workflow run deploy.yml -R RamiDebbas/vsm-website
   ```

   `SITE_URL` comes from the Pages config automatically. The repository variable `SITE_URL` is only needed to
   override it (for example while GitHub still reports `http://` before the certificate exists; the build rejects
   non-https URLs).
5. Check: `https://vsmgrp.com` and `https://www.vsmgrp.com` both load the site with a padlock. Then send a test
   email to info@vsmgrp.com and to a co-founder address, to confirm mail still flows.

### Contact address

The site shows `info@vsmgrp.com`. Create it in Microsoft 365 (GoDaddy's Email & Office dashboard, or
admin.microsoft.com) as a **shared mailbox** (free, no licence) or an **alias** on an existing mailbox. Then send a test
from an outside account (Gmail) and delete the `contact.email` entry from `placeholders` in `src/config/site.ts`.

## 3. Azure Static Web Apps (planned production host)

The build already emits `dist/staticwebapp.config.json` from `src/config/security.ts`. It contains the
full security header set that GitHub Pages cannot send: CSP with `frame-ancestors`, HSTS, nosniff, and the rest.

1. Create a **Static Web App** (Free plan) in the Azure portal. Choose deployment source "Other" to get
   a deployment token.
2. Add the token as the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
3. Add the steps below to `.github/workflows/deploy.yml`. They reuse the already-built and already-inspected `dist/`.
   (The Pages artifact can't be reused directly: it is a tarball, not a folder.)

   In the existing `build` job, after the Pages upload step:

   ```yaml
      - name: Upload dist for Azure
        if: github.event_name != 'pull_request'
        uses: actions/upload-artifact@<sha> # pin like the other actions
        with:
          name: site
          path: dist
   ```

   New job:

   ```yaml
   deploy-azure:
     if: github.event_name != 'pull_request'   # PR builds upload nothing
     needs: build
     runs-on: ubuntu-latest
     steps:
       - uses: actions/download-artifact@<sha>
         with:
           name: site
           path: dist
       - uses: Azure/static-web-apps-deploy@<sha>
         with:
           azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
           action: upload
           app_location: dist
           skip_app_build: true
   ```

4. Custom domain: **Static Web App → Custom domains**. Azure issues free SSL. Point DNS at Azure
   instead of GitHub (CNAME for `www`; ALIAS/ANAME or Azure DNS for the apex).
5. Set the repository variable `SITE_URL` to the production origin, so canonical and sitemap URLs are correct.

Nothing in the app is host-specific, so moving hosts never requires code changes.

## Checklist before going live

- [ ] `info@vsmgrp.com` exists and receives a test email; placeholder entry removed
- [ ] vsmgrp.com verified on GitHub, DNS changed (Microsoft 365 records untouched), HTTPS enforced
- [ ] `https://vsmgrp.com` and `https://www.vsmgrp.com` load with a padlock; mail still flows
- [ ] `npm run check` green locally; CI green on `main`
