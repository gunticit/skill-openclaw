/**
 * Antigravity CDP Automation Engine
 *
 * Connects to OpenClaw Gateway via WebSocket and executes
 * CDP browser commands programmatically.
 *
 * Usage:
 *   npx ts-node run.ts --gateway-url ws://127.0.0.1:18789 --token <token> --script <path>
 *   npx ts-node run.ts --cdp-url http://127.0.0.1:18792 --script <path>
 */

import WebSocket from "ws";
import * as fs from "fs";

// ─── Types ───────────────────────────────────────────────────────────

interface CDPCommand {
  id: number;
  method: string;
  params?: Record<string, any>;
}

interface CDPResponse {
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

interface AutomationStep {
  action: string;
  params: Record<string, any>;
  description?: string;
  waitAfter?: number; // ms to wait after this step
  verify?: string; // JS expression that should return true
}

interface AutomationScript {
  name: string;
  description?: string;
  startUrl: string;
  steps: AutomationStep[];
}

// ─── CDP Client ──────────────────────────────────────────────────────

class CDPClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on("open", () => {
        console.log(`✅ Connected to CDP: ${url}`);
        resolve();
      });
      this.ws.on("error", (err) => reject(err));
      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as CDPResponse;
        const handler = this.pending.get(msg.id);
        if (handler) {
          this.pending.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(`CDP error: ${msg.error.message}`));
          } else {
            handler.resolve(msg.result);
          }
        }
      });
    });
  }

  async send(method: string, params?: Record<string, any>): Promise<any> {
    if (!this.ws) throw new Error("Not connected");
    const id = this.nextId++;
    const cmd: CDPCommand = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(cmd));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    this.ws?.close();
  }
}

// ─── Action Executor ─────────────────────────────────────────────────

async function executeStep(
  cdp: CDPClient,
  step: AutomationStep
): Promise<any> {
  console.log(`▶️  ${step.description || step.action}: ${JSON.stringify(step.params)}`);

  switch (step.action) {
    case "navigate":
      return cdp.send("Page.navigate", { url: step.params.url });

    case "click":
      // Click by selector using DOM methods
      return cdp.send("Runtime.evaluate", {
        expression: `document.querySelector('${step.params.selector}')?.click()`,
        awaitPromise: false,
      });

    case "type":
      // Focus element then dispatch input
      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector('${step.params.selector}');
          if (!el) throw new Error('Element not found: ${step.params.selector}');
          el.focus();
          el.value = '${step.params.text?.replace(/'/g, "\\'")}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`,
        awaitPromise: false,
      });
      return;

    case "wait":
      const waitMs = step.params.ms || 2000;
      await new Promise((r) => setTimeout(r, waitMs));
      return;

    case "waitForSelector":
      return cdp.send("Runtime.evaluate", {
        expression: `new Promise((resolve, reject) => {
          const timeout = ${step.params.timeout || 10000};
          const start = Date.now();
          const check = () => {
            const el = document.querySelector('${step.params.selector}');
            if (el) return resolve(true);
            if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for ${step.params.selector}'));
            requestAnimationFrame(check);
          };
          check();
        })`,
        awaitPromise: true,
      });

    case "evaluate":
      return cdp.send("Runtime.evaluate", {
        expression: step.params.expression,
        awaitPromise: step.params.awaitPromise || false,
        returnByValue: true,
      });

    case "screenshot":
      const screenshot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        quality: 80,
      });
      if (screenshot?.data) {
        const path = step.params.path || `screenshot-${Date.now()}.png`;
        fs.writeFileSync(path, Buffer.from(screenshot.data, "base64"));
        console.log(`📸 Screenshot saved: ${path}`);
      }
      return screenshot;

    case "getCookies":
      return cdp.send("Network.getCookies", {});

    case "setCookies":
      return cdp.send("Network.setCookies", {
        cookies: step.params.cookies,
      });

    default:
      // Pass through as raw CDP command
      return cdp.send(step.action, step.params);
  }
}

// ─── Script Runner ───────────────────────────────────────────────────

async function runScript(
  cdp: CDPClient,
  script: AutomationScript
): Promise<{ status: string; results: any[] }> {
  const results: any[] = [];

  console.log(`\n🚀 Running: ${script.name}`);
  console.log(`📝 ${script.description || ""}\n`);

  // Enable necessary CDP domains
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");

  // Navigate to start URL
  console.log(`🌐 Navigating to ${script.startUrl}...`);
  await cdp.send("Page.navigate", { url: script.startUrl });
  await new Promise((r) => setTimeout(r, 3000)); // wait for page load

  // Execute steps
  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    try {
      const result = await executeStep(cdp, step);
      results.push({ step: i + 1, action: step.action, status: "success", result });

      // Wait after step if specified
      if (step.waitAfter) {
        await new Promise((r) => setTimeout(r, step.waitAfter));
      }

      // Verify step if check expression provided
      if (step.verify) {
        const check = await cdp.send("Runtime.evaluate", {
          expression: step.verify,
          returnByValue: true,
        });
        if (!check?.result?.value) {
          console.warn(`⚠️  Verification failed at step ${i + 1}: ${step.verify}`);
          results[results.length - 1].status = "verify_failed";
        }
      }
    } catch (error: any) {
      console.error(`❌ Step ${i + 1} failed: ${error.message}`);
      results.push({ step: i + 1, action: step.action, status: "error", error: error.message });
    }
  }

  return { status: "complete", results };
}

// ─── CLI Entry Point ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string =>
    args[args.indexOf(`--${name}`) + 1] || "";

  const cdpUrl = getArg("cdp-url") || "http://127.0.0.1:18792";
  const scriptPath = getArg("script");

  if (!scriptPath) {
    console.log(`
Antigravity CDP Automation Engine

Usage:
  npx ts-node run.ts --cdp-url <url> --script <path>

Options:
  --cdp-url     CDP WebSocket URL (default: http://127.0.0.1:18792)
  --script      Path to automation script JSON

Script format:
{
  "name": "My Automation",
  "startUrl": "https://example.com",
  "steps": [
    { "action": "type", "params": { "selector": "#email", "text": "user@test.com" }, "description": "Fill email" },
    { "action": "click", "params": { "selector": "#submit" }, "description": "Submit form" },
    { "action": "waitForSelector", "params": { "selector": ".dashboard" }, "description": "Wait for dashboard" },
    { "action": "screenshot", "params": { "path": "result.png" }, "description": "Capture proof" }
  ]
}
    `);
    process.exit(0);
  }

  // Load script
  const scriptContent = fs.readFileSync(scriptPath, "utf-8");
  const script: AutomationScript = JSON.parse(scriptContent);

  // Connect to CDP
  // Convert HTTP URL to WebSocket for CDP
  const wsUrl = cdpUrl
    .replace("http://", "ws://")
    .replace("https://", "wss://");

  const cdp = new CDPClient();

  try {
    // Try to get the WebSocket debugger URL from the CDP endpoint
    const response = await fetch(`${cdpUrl}/json/version`);
    const versionInfo = await response.json();
    const debuggerUrl = versionInfo.webSocketDebuggerUrl;

    if (debuggerUrl) {
      await cdp.connect(debuggerUrl);
    } else {
      await cdp.connect(wsUrl);
    }

    const result = await runScript(cdp, script);
    console.log("\n✅ Automation complete!");
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await cdp.close();
  }
}

main();
