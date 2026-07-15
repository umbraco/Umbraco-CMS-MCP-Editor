import { chromium } from "@playwright/test";

const BASE = `https://localhost:${process.argv[2] || "57841"}`;
const SHOT = "/private/tmp/claude-501/-Users-philw-Projects-umbraco-mcp-editor-cms/ff28ef75-cb36-4868-a9e3-0bd97b6de842/scratchpad";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

const dumpLabels = async (tag) => {
  const texts = await page.evaluate(() => {
    const out = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
        const label = el.getAttribute?.("label") || el.getAttribute?.("headline") || el.getAttribute?.("name");
        if (label && label.length < 60) out.push(`[${el.tagName.toLowerCase()}] ${label}`);
      }
    };
    walk(document);
    return [...new Set(out)].slice(0, 80);
  });
  console.log(`=== ${tag} labels ===\n` + texts.join("\n"));
};

try {
  await page.goto(`${BASE}/umbraco`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  // Fill the shadow-DOM login inputs by walking all shadow roots.
  const filled = await page.evaluate(({ u, p }) => {
    const inputs = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll("input")) inputs.push(el);
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true, composed: true })); el.dispatchEvent(new Event("change", { bubbles: true, composed: true })); };
    const emailEl = inputs.find(i => /email|user/i.test(i.name + i.type + (i.getAttribute("label")||"") + (i.autocomplete||""))) || inputs[0];
    const passEl = inputs.find(i => i.type === "password") || inputs[1];
    if (emailEl) set(emailEl, u);
    if (passEl) set(passEl, p);
    return { count: inputs.length, email: !!emailEl, pass: !!passEl };
  }, { u: "admin@admin.com", p: "1234567890" });
  console.log("login inputs:", JSON.stringify(filled));
  await page.getByRole("button", { name: /login/i }).first().click().catch(async () => {
    // fallback: click any button in shadow with text login
    await page.evaluate(() => {
      const walk = (root) => { for (const b of root.querySelectorAll("button,uui-button")) if (/login/i.test(b.textContent||b.getAttribute("label")||"")) b.click(); for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot); };
      walk(document);
    });
  });
  await page.waitForTimeout(6000);
  console.log("after-login URL:", page.url());

  await page.goto(`${BASE}/umbraco/section/library`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log("library URL:", page.url());
  await page.screenshot({ path: `${SHOT}/library-section.png` });
  await dumpLabels("LIBRARY");

  // Trace the "Create item for Elements" flow — click the root create (+) action.
  const clicked = await page.evaluate(() => {
    const walk = (root) => {
      for (const b of root.querySelectorAll("uui-button,button")) {
        if (/create item for elements/i.test(b.getAttribute("label") || b.textContent || "")) { b.click(); return true; }
      }
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot && walk(el.shadowRoot)) return true;
      return false;
    };
    return walk(document);
  });
  console.log("clicked create-elements:", clicked);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT}/library-create-modal.png` });
  // Dump modal content: headline + any option/menu-item labels (the type picker)
  const modal = await page.evaluate(() => {
    const out = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll("umb-modal,uui-dialog,uui-modal,uui-menu-item,uui-ref-item,[headline]")) {
        const t = el.getAttribute?.("headline") || el.getAttribute?.("name") || el.textContent?.trim()?.slice(0, 80);
        if (t) out.push(`[${el.tagName.toLowerCase()}] ${t}`);
      }
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return [...new Set(out)].slice(0, 40);
  });
  console.log("=== CREATE MODAL ===\n" + modal.join("\n"));
} catch (e) {
  console.log("ERROR:", String(e).slice(0, 400));
  await page.screenshot({ path: `${SHOT}/error.png` }).catch(() => {});
} finally {
  await browser.close();
}
