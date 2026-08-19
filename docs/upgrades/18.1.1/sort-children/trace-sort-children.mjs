import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2];
const OUT = process.argv[3] || "/tmp/claude-0/-home-user/67584629-8c88-580b-a003-2d6c0cd50096/scratchpad";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

const log = (...a) => console.log("[trace]", ...a);

await page.goto(`${BASE}/umbraco`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// Login form (uui-input / input inside shadow roots — Playwright pierces open roots).
try {
  await page.locator('input[name="username"], input[type="email"], #username-input input, input#username').first().fill("admin@admin.com", { timeout: 20000 });
  await page.locator('input[name="password"], input[type="password"], input#password').first().fill("1234567890", { timeout: 20000 });
  await page.locator('button[type="submit"], uui-button[type="submit"]').first().click({ timeout: 20000 });
  log("submitted login");
} catch (e) {
  log("login form not found (maybe already logged in):", e.message.split("\n")[0]);
}
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/01-after-login.png` });
log("url after login:", page.url());

// Go to the Content section
await page.goto(`${BASE}/umbraco/section/content`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/02-content-section.png` });

// Target the "Home" tree item, hover it, and open its entity-actions menu.
const home = page.locator("umb-tree-item").filter({ hasText: "Home" }).first();
await home.scrollIntoViewIfNeeded();
await home.hover();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-tree-hover.png` });

const actionBtn = home.locator('#action-menu-button, uui-button[label*="ction"], uui-symbol-more').first();
await actionBtn.click({ timeout: 20000 }).catch((e) => log("actions click failed:", e.message.split("\n")[0]));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/04-actions-menu.png` });
const menuText = await page.locator("umb-entity-action-list").first().innerText().catch(() => "");
log("ACTION MENU:\n" + menuText);

await page.getByText("Sort children", { exact: false }).first().click({ timeout: 20000 }).catch((e) => log("sort click failed:", e.message.split("\n")[0]));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/05-sort-modal.png`, fullPage: true });
const modal = page.locator("uui-dialog-layout, umb-body-layout").last();
log("SORT MODAL TEXT:\n" + (await modal.innerText().catch(() => "<none>")));
const html = await modal.evaluate((el) => el.outerHTML).catch(() => "");
fs.writeFileSync(`${OUT}/sort-modal.html`, html);
log("wrote sort-modal.html", html.length, "bytes");

// Click the "Name" column header twice to observe the auto-sort + direction toggle.
const names = async () => (await modal.innerText()).split("\n").map(x=>x.trim()).filter(Boolean).slice(0, 16);
log("BEFORE header click:", JSON.stringify(await names()));
const nameHeader = modal.getByText("Name", { exact: true }).first();
await nameHeader.click({ timeout: 15000 }).catch((e) => log("header click 1 failed:", e.message.split("\n")[0]));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/06-name-asc.png`, fullPage: true });
log("AFTER 1st Name click:", JSON.stringify(await names()));
await nameHeader.click({ timeout: 15000 }).catch((e) => log("header click 2 failed:", e.message.split("\n")[0]));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/07-name-desc.png`, fullPage: true });
log("AFTER 2nd Name click:", JSON.stringify(await names()));

await browser.close();
