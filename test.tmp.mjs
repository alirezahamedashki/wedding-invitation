import { chromium } from "playwright-core";

const errors = [];
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", locale: "fa-IR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });
page.on("response", (r) => { if (r.status() >= 400) errors.push("http " + r.status() + ": " + r.url()); });

await page.goto("http://localhost:3000/wedding-invitation/", { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await page.locator(".seal-hit-button").click({ force: true });
await page.waitForTimeout(5500);

const phase = await page.evaluate(() => document.querySelector("main")?.className);
console.log("phase:", phase);

// Ceremony section
await page.evaluate(() => document.querySelector(".ceremony")?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/t-ceremony.png" });

// Scratch test: drag across the cover
const box = await page.locator(".scratch-box").boundingBox();
console.log("scratch box:", JSON.stringify(box));
if (box) {
  for (let row = 0; row < 3; row++) {
    const y = box.y + box.height * (0.25 + row * 0.25);
    await page.mouse.move(box.x + 25, y);
    await page.mouse.down();
    for (let x = box.x + 25; x < box.x + box.width - 15; x += 20) {
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
}
const revealed = await page.evaluate(() => ({
  cls: document.querySelector(".scratch-box")?.className,
  nums: [...document.querySelectorAll(".count-grid strong")].map((e) => e.textContent),
  labels: [...document.querySelectorAll(".count-grid span")].map((e) => e.textContent),
}));
console.log("after scratch:", JSON.stringify(revealed));
await page.screenshot({ path: "/tmp/t-scratched.png" });

// Maps + RSVP
await page.evaluate(() => document.querySelector(".maps-block")?.scrollIntoView({ block: "center" }));
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/t-maps.png" });
const maps = await page.evaluate(() => [...document.querySelectorAll(".map-btn")].map((a) => a.getAttribute("href") + "|" + a.textContent.trim()));
console.log("maps:", JSON.stringify(maps));
await page.evaluate(() => document.querySelector(".rsvp-card")?.scrollIntoView({ block: "center" }));
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/t-rsvp.png" });
const rsvpBtn = await page.locator(".rsvp-actions button").first().textContent();
console.log("rsvp btn:", rsvpBtn);
await page.locator(".rsvp-actions button").first().click();
await page.waitForTimeout(300);
console.log("rsvp answer:", await page.locator(".rsvp-answer h3").textContent());

console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
