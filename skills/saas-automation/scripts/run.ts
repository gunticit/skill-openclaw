import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

interface SaaSInput {
  url: string;
  username: string;
  password: string;
  action: "publish" | "update" | "scrape" | "fill-form" | "custom";
  content?: string;
  targetPage?: string;
  selectors?: {
    usernameField?: string;
    passwordField?: string;
    submitButton?: string;
    contentArea?: string;
    publishButton?: string;
  };
}

interface SaaSResult {
  status: "success" | "error";
  message: string;
  screenshot?: string;
  data?: any;
}

// Default selectors — override via input.selectors for specific platforms
const DEFAULT_SELECTORS = {
  usernameField:
    'input[name="username"], input[name="email"], input[type="email"], input#username, input#email',
  passwordField:
    'input[name="password"], input[type="password"], input#password',
  submitButton:
    'button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")',
  contentArea:
    'textarea, [contenteditable="true"], .ql-editor, .ProseMirror, .tox-edit-area__iframe',
  publishButton:
    'button:has-text("Publish"), button:has-text("Submit"), button:has-text("Post"), button:has-text("Save")',
};

function getSelector(
  key: keyof typeof DEFAULT_SELECTORS,
  custom?: Partial<typeof DEFAULT_SELECTORS>
): string {
  return custom?.[key] || DEFAULT_SELECTORS[key];
}

async function login(page: Page, input: SaaSInput): Promise<void> {
  console.log(`🔐 Navigating to ${input.url}...`);
  await page.goto(input.url, { waitUntil: "networkidle", timeout: 30000 });

  const usernameSelector = getSelector("usernameField", input.selectors);
  const passwordSelector = getSelector("passwordField", input.selectors);
  const submitSelector = getSelector("submitButton", input.selectors);

  console.log("📝 Filling credentials...");
  await page.fill(usernameSelector, input.username);
  await page.fill(passwordSelector, input.password);

  console.log("🚀 Submitting login...");
  await page.click(submitSelector);
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // Check for common login failure indicators
  const errorVisible = await page
    .locator(
      '.error, .alert-danger, [class*="error"], [class*="invalid"], [role="alert"]'
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (errorVisible) {
    const errorText = await page
      .locator(
        '.error, .alert-danger, [class*="error"], [class*="invalid"], [role="alert"]'
      )
      .first()
      .textContent()
      .catch(() => "Unknown error");
    throw new Error(`Login failed: ${errorText}`);
  }

  console.log("✅ Login successful");
}

async function publishContent(page: Page, input: SaaSInput): Promise<string> {
  if (input.targetPage) {
    console.log(`📄 Navigating to ${input.targetPage}...`);
    await page.goto(input.targetPage, {
      waitUntil: "networkidle",
      timeout: 15000,
    });
  }

  const contentSelector = getSelector("contentArea", input.selectors);
  const publishSelector = getSelector("publishButton", input.selectors);

  console.log("✍️ Filling content...");
  const contentEl = page.locator(contentSelector).first();
  await contentEl.click();
  await contentEl.fill(input.content || "");

  console.log("📤 Publishing...");
  await page.click(publishSelector);
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  return "Content published successfully";
}

async function scrapeData(page: Page, input: SaaSInput): Promise<any> {
  if (input.targetPage) {
    await page.goto(input.targetPage, {
      waitUntil: "networkidle",
      timeout: 15000,
    });
  }

  console.log("🔍 Scraping page data...");
  const title = await page.title();
  const url = page.url();
  const bodyText = await page
    .locator("main, [role='main'], .content, #content, body")
    .first()
    .textContent()
    .catch(() => "");

  return {
    title,
    url,
    textPreview: bodyText?.substring(0, 2000) || "",
  };
}

export async function run(input: SaaSInput): Promise<SaaSResult> {
  let browser: Browser | null = null;

  try {
    console.log("🌐 Launching browser...");
    browser = await chromium.launch({
      headless: false, // headed first for debugging — switch to true once stable
    });

    const page = await browser.newPage();

    // Step 1: Login
    await login(page, input);

    // Step 2: Execute action
    let message = "";
    let data: any = undefined;

    switch (input.action) {
      case "publish":
        message = await publishContent(page, input);
        break;
      case "scrape":
        data = await scrapeData(page, input);
        message = "Data scraped successfully";
        break;
      case "fill-form":
        if (input.targetPage) {
          await page.goto(input.targetPage, {
            waitUntil: "networkidle",
            timeout: 15000,
          });
        }
        message = "Form page loaded — ready for manual field mapping";
        break;
      case "update":
        message = await publishContent(page, input); // same flow as publish
        break;
      default:
        message = `Custom action "${input.action}" — extend this switch case`;
    }

    // Step 3: Screenshot for verification
    const screenshotPath = `saas-result-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);

    return {
      status: "success",
      message,
      screenshot: screenshotPath,
      data,
    };
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return {
      status: "error",
      message: error.message,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// CLI entry point (ESM-compatible)
const args = process.argv.slice(2);
if (args.length > 0) {
  const parseArg = (name: string): string =>
    args[args.indexOf(`--${name}`) + 1] || "";

  const input: SaaSInput = {
    url: parseArg("url"),
    username: parseArg("username"),
    password: parseArg("password"),
    action: (parseArg("action") || "publish") as SaaSInput["action"],
    content: parseArg("content") || undefined,
    targetPage: parseArg("target-page") || undefined,
  };

  if (!input.url || !input.username || !input.password) {
    console.error(
      "Usage: npx ts-node run.ts --url <url> --username <user> --password <pass> --action <action> [--content <text>] [--target-page <url>]"
    );
    process.exit(1);
  }

  run(input).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "success" ? 0 : 1);
  });
}

