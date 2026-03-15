---
name: saas-automation
description: >
  Automate actions on SaaS platforms (CRM, CMS, marketing tools, admin panels).
  Use when: user asks to login to a web app, create/update content on a platform,
  publish posts, fill forms, scrape dashboard data, or automate repetitive browser
  tasks on SaaS services. Triggers on: "login to", "publish on", "post to",
  "automate", "fill form", "scrape data from", "update CRM", "schedule post".
---

# SaaS Automation

## Overview

Automates browser-based actions on SaaS platforms by combining AI instruction
with Playwright scripts. The AI decides WHAT to do based on user intent;
the Playwright script handles HOW to execute it reliably in a real browser.

This approach is useful because SaaS platforms have complex, dynamic UIs that
are hard to automate with simple selectors alone — the AI can adapt when layouts
change, while Playwright handles timing, waits, and reliable interactions.

## When to Use

- User needs to login and perform actions on a SaaS platform
- Repetitive browser tasks (publishing, form filling, data entry)
- Content publishing across multiple platforms
- Scraping dashboard data or reports
- Any web automation that requires authentication

## When NOT to Use

- The SaaS platform has a public API — use the API directly instead (faster, more reliable)
- Simple one-time data lookup — use browser tool manually
- Tasks that don't require authentication

## Process Flow

```
Gather Input → Validate Credentials → Launch Browser → Login
    → Navigate to Target → Execute Action → Verify Result → Report
```

## Steps

### 1. Gather Input

Ask the user for (skip fields already known from context):

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | Platform login URL |
| `username` | Yes | Login username or email |
| `password` | Yes | Login password |
| `action` | Yes | What to do (publish, update, scrape, etc.) |
| `content` | Depends | Content to publish/fill (if applicable) |
| `target_page` | No | Specific page URL after login (defaults to dashboard) |

> **Security:** Never log or persist passwords. If credentials are in
> `TOOLS.md` or environment variables, use those instead of asking.

### 2. Check for API Alternative

Before launching a browser, quickly check if the platform has a REST API that
could accomplish the task more reliably. If so, suggest the API approach first.
Browser automation is the fallback when no API is available.

### 3. Run Playwright Script

Execute the bundled script with the gathered inputs:

```bash
cd skills/saas-automation/scripts
npx ts-node run.ts --url "<url>" --username "<user>" --password "<pass>" --action "<action>" --content "<content>"
```

If `ts-node` is not available, compile first:
```bash
npx tsc run.ts --outDir dist && node dist/run.js
```

### 4. Handle Failures

| Failure | Recovery |
|---------|----------|
| Login failed (wrong credentials) | Ask user to verify credentials |
| Element not found | Try alternate selectors, or ask user for the correct page |
| Timeout | Increase wait time, retry once |
| CAPTCHA detected | Notify user — manual intervention needed |
| 2FA required | Notify user to complete 2FA manually |

### 5. Verify & Report

After execution, verify the action was successful:
- Take a screenshot of the final state
- Check for success messages on the page
- Report back: what was done, any warnings, screenshot proof

## Customization

For platform-specific automation (e.g., WordPress, HubSpot, Salesforce),
create dedicated reference files in `references/` with:
- Platform-specific selectors
- Login flow quirks (OAuth, SSO, 2FA)
- Common actions and their page paths

Example: `references/wordpress.md` for WordPress-specific automation.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Hardcoding selectors | Use data-testid, aria labels, or text content — they survive UI updates |
| No wait after login | Always wait for navigation/dashboard to fully load before proceeding |
| Storing passwords in files | Use env vars or prompt at runtime — never commit credentials |
| Ignoring CAPTCHA/2FA | Detect and notify user immediately instead of retrying in a loop |
| Running headless on first try | Run headed first to debug, switch to headless once stable |
| No screenshot on failure | Always capture screenshot before reporting errors — saves debugging time |
