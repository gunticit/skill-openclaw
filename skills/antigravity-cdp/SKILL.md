---
name: antigravity-cdp
description: >
  Autonomous browser automation using OpenClaw's built-in CDP (Chrome DevTools
  Protocol) browser control. Use when: agent needs to automate websites, login
  to web apps, scrape data, fill forms, post content, interact with any website
  programmatically. Triggers on: "automate browser", "login to website", "scrape
  this page", "fill this form", "post content", "browser automation", "CDP",
  "web automation", "interact with website", "click on", "navigate to and do".
  This skill enables the agent to GENERATE automation code dynamically and
  execute it — making it a self-programming browser agent.
---

# Antigravity CDP Automation

## Overview

This skill turns the OpenClaw agent into an **autonomous browser agent** that can:
1. Analyze what the user wants to automate
2. Generate browser automation code dynamically
3. Execute it via OpenClaw's built-in CDP browser control
4. Verify results and self-correct if something fails

The key difference from static automation: the agent WRITES the automation
code on-the-fly based on the user's intent, then runs it. If it breaks,
the agent reads the error, fixes the code, and retries.

## Architecture

```
User prompt → Agent plans steps → Agent generates CDP commands
    → Execute via `openclaw browser` CLI → Verify result
    → If error: read error → fix code → retry
```

## OpenClaw Browser CLI Reference

The agent has these built-in CDP tools via `openclaw browser`:

### Navigation & Tabs
| Command | Usage |
|---------|-------|
| `navigate <url>` | Navigate current tab to URL |
| `open <url>` | Open URL in new tab |
| `tabs` | List open tabs |
| `focus <id>` | Focus a tab by ID |
| `close <id>` | Close a tab |

### Interaction
| Command | Usage |
|---------|-------|
| `click <ref>` | Click element by ref (from snapshot) |
| `click <ref> --double` | Double-click |
| `type <ref> "text"` | Type text into element |
| `type <ref> "text" --submit` | Type and submit (press Enter) |
| `press <key>` | Press a keyboard key |
| `hover <ref>` | Hover over element |
| `drag <from> <to>` | Drag from one ref to another |
| `select <ref> <options>` | Select option(s) in dropdown |
| `fill --fields '[...]'` | Fill form with JSON field descriptors |

### Observation
| Command | Usage |
|---------|-------|
| `snapshot` | Capture AI-readable page snapshot (element refs) |
| `snapshot --format aria` | Accessibility tree snapshot |
| `screenshot` | Capture screenshot |
| `screenshot --full-page` | Full page screenshot |
| `screenshot --ref <n>` | Screenshot specific element |
| `console --level error` | Get console errors |
| `errors` | Get page errors |
| `requests` | Get recent network requests |

### Advanced
| Command | Usage |
|---------|-------|
| `evaluate --fn '(el) => ...' --ref <n>` | Run JS on element |
| `evaluate --fn '() => ...'` | Run JS on page |
| `cookies` | Read/write cookies |
| `storage` | Read/write localStorage/sessionStorage |
| `wait --text "Done"` | Wait for text to appear |
| `wait --url "*/dashboard*"` | Wait for URL match |
| `upload /path/to/file` | Upload file |
| `download` | Download file via click |
| `dialog --accept` | Accept/dismiss dialog |

## Automation Pipeline

Follow this pipeline for every automation task:

### Step 1: Plan

Analyze the user's request and break it into concrete browser steps.
Think about:
- What URL to start from?
- Is login required? What credentials? (check `TOOLS.md`, env vars, or ask user)
- What sequence of clicks/types/waits achieves the goal?
- What does success look like? (specific element, text, URL)

Write the plan as a numbered list before executing.

### Step 2: Observe

Before interacting, always take a snapshot to understand the current page state:

```bash
openclaw browser snapshot
```

This returns element refs (numbers) you can use for click/type/fill.
Read the snapshot to identify the correct elements.

### Step 3: Execute

Run commands one at a time, verifying after each critical step:

```bash
# Example: login flow
openclaw browser navigate "https://app.example.com/login"
openclaw browser snapshot                              # find form elements
openclaw browser type 5 "username@email.com"           # type in username field (ref 5)
openclaw browser type 8 "password123"                  # type in password field (ref 8)
openclaw browser click 12                              # click login button (ref 12)
openclaw browser wait --text "Dashboard"               # wait for success
openclaw browser screenshot                            # capture proof
```

### Step 4: Verify

After each major action:
1. Take a snapshot or screenshot
2. Check if the expected result appeared
3. Check `openclaw browser errors` for any page errors
4. If something went wrong, analyze the error and adjust

### Step 5: Self-Correct (if needed)

When something fails:

```
Error detected → Take snapshot → Analyze page state
    → Identify what changed → Adjust selectors/approach → Retry
```

Common recovery strategies:
- **Element not found**: retake snapshot, find the correct ref
- **Page changed**: wait for load, then retake snapshot
- **Login failed**: check for error message, verify credentials
- **CAPTCHA**: notify user for manual intervention
- **2FA**: notify user, wait, then continue

## Advanced: Generate & Execute Custom JS

For complex automation that can't be done with simple CLI commands,
generate JavaScript and execute it via `evaluate`:

```bash
openclaw browser evaluate --fn '() => {
  const rows = document.querySelectorAll("table tbody tr");
  return Array.from(rows).map(row => {
    const cells = row.querySelectorAll("td");
    return Array.from(cells).map(c => c.textContent.trim());
  });
}'
```

This is useful for:
- Scraping structured data (tables, lists)
- Complex DOM manipulation
- Reading page state that isn't visible in snapshots
- Automating SPAs with custom logic

## Advanced: Network Interception

For tasks requiring network monitoring (e.g., capturing API responses):

```bash
openclaw browser requests           # see recent network requests
openclaw browser responsebody       # capture response body
```

## Advanced: Run Bundled Script

For complex, multi-step automation that benefits from a dedicated script,
use the bundled `scripts/run.ts`:

```bash
cd skills/antigravity-cdp/scripts
npx ts-node run.ts --gateway-url "ws://127.0.0.1:18789" --token "<gateway-token>" --script "<path-to-generated-script.js>"
```

The script connects to OpenClaw's gateway and executes CDP commands
programmatically. Use this for:
- Long-running automation (many pages)
- Automation that needs loops/conditionals
- Batch operations across multiple URLs

## Security Rules

- **Never log passwords** in console output, screenshots, or memory files
- **Use env vars** for credentials when possible (`process.env.SAAS_PASSWORD`)
- **Check `TOOLS.md`** for stored credentials before asking the user
- **Never commit** credentials to files that might be pushed to git
- **Notify user** before performing any destructive actions (delete, publish)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Clicking without snapshot first | Always `snapshot` before `click` — refs change between pages |
| Using stale refs after navigation | Retake snapshot after every page navigation or major DOM change |
| Not waiting after click | Use `wait --text` or `wait --url` after clicks that trigger navigation |
| Hardcoding refs | Refs are dynamic — always get fresh ones from snapshot |
| Ignoring errors silently | Check `errors` and `console` after each step for early failure detection |
| Running too fast | Add `wait` between actions on slow sites — SPAs need time to render |
| Not taking proof screenshots | Always screenshot after completing the task — visual proof builds trust |
