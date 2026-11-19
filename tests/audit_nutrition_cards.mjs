/**
 * Playwright E2E + Visual Inspection for Nutrition Photo Cards (Samokat style)
 * & Photo Upload (Menu + Meals) on iPhone 13 (390x844) and Desktop (1280x900).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  "/home/ruslan_safaev/digital_platform/frontend/package.json",
);
const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8099";
const OUT_DIR = path.resolve("artifacts/audit_nutrition_cards");
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = { passed: 0, findings: [] };

function pass(label) {
  results.passed += 1;
  console.log(`  [PASS] ${label}`);
}

function fail(label, detail) {
  results.findings.push({ label, detail });
  console.error(`  [FAIL] ${label}: ${detail}`);
}

function assert(cond, label, detail = "assertion failed") {
  if (cond) pass(label);
  else fail(label, detail);
}

async function checkImagesAndOverflow(page, scopeLabel) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
            setTimeout(resolve, 4000);
          }),
      ),
    );
  });
  const audit = await page.evaluate(() => {
    const vw = window.innerWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const imgs = Array.from(document.querySelectorAll("img")).filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const brokenImgs = imgs
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute("src"));

    const cards = Array.from(document.querySelectorAll(".dish-card"));
    const cardIssues = [];
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      if (r.right > vw + 1) {
        cardIssues.push(`card overflows right (${Math.round(r.right)} > ${vw})`);
      }
      if (r.left < -1) {
        cardIssues.push(`card overflows left (${Math.round(r.left)})`);
      }
    }

    const selects = document.querySelectorAll("select").length;
    return {
      overflow,
      imgCount: imgs.length,
      brokenImgs,
      cardCount: cards.length,
      cardIssues,
      selects,
    };
  });

  assert(audit.overflow <= 1, `${scopeLabel}: zero horizontal overflow`, `overflow=${audit.overflow}px`);
  assert(audit.selects === 0, `${scopeLabel}: zero native <select>`, `found=${audit.selects}`);
  assert(
    audit.brokenImgs.length === 0,
    `${scopeLabel}: all visible images loaded (${audit.imgCount})`,
    `broken=${JSON.stringify(audit.brokenImgs)}`,
  );
  assert(
    audit.cardIssues.length === 0,
    `${scopeLabel}: all dish cards within viewport (${audit.cardCount})`,
    audit.cardIssues.join("; "),
  );
  return audit;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const consoleErrors = [];
  const httpErrors = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("response", (res) => {
      if (res.status() >= 400 && !res.url().includes("favicon")) {
        httpErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    // Open Питание tab
    await page.locator("nav.bottom-nav button", { hasText: "Питание" }).click();
    await page.waitForSelector(".nutrition-view-switch");
    pass("Opened Питание with view-mode switcher");

    // 1. Default Список mode in Рацион
    const listBtn = page.getByRole("button", { name: "Список" });
    const cardsBtn = page.getByRole("button", { name: "Карточки" });
    assert(
      (await listBtn.getAttribute("aria-pressed")) === "true",
      "Default nutrition view mode is Список",
    );

    // 2. Switch to Карточки in Рацион
    await cardsBtn.click();
    await page.waitForSelector(".dish-card");
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_ration_cards.png"), fullPage: true });
    const rationAudit = await checkImagesAndOverflow(page, "ip13 Рацион (Карточки)");
    assert(rationAudit.cardCount >= 3, "Рацион renders seeded meal photo cards", `count=${rationAudit.cardCount}`);
    assert(rationAudit.imgCount >= 3, "Рацион photo cards render studio dish photos", `imgs=${rationAudit.imgCount}`);

    // 3. Toggle 1-tap eaten checkbox on first card
    const firstCheck = page.locator(".dish-card-check").first();
    const beforeChecked = await firstCheck.getAttribute("aria-checked");
    await firstCheck.click();
    await page.waitForTimeout(300);
    const afterChecked = await firstCheck.getAttribute("aria-checked");
    assert(beforeChecked !== afterChecked, "1-tap card checkbox toggles meal status");
    // Restore original state
    await firstCheck.click();
    await page.waitForTimeout(250);

    // 4. Switch to Меню — verify Карточки mode persists & Samokat cards render
    await page.locator(".mt-segmented-btn", { hasText: "Меню" }).first().click();
    await page.waitForSelector(".dish-card[data-dish-card='menu']");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_menu_cards.png"), fullPage: true });
    const menuAudit = await checkImagesAndOverflow(page, "ip13 Меню (Карточки)");
    assert(menuAudit.cardCount >= 18, "Меню renders all 18 Samokat photo cards", `count=${menuAudit.cardCount}`);
    assert(menuAudit.imgCount >= 18, "Меню cards load all 18 studio photos", `imgs=${menuAudit.imgCount}`);

    // 5. Open MenuItemFormSheet on first dish -> inspect PhotoPicker + Description
    await page.locator(".dish-card-body").first().click();
    await page.waitForSelector(".dish-photo-preview-img");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_menu_edit_photo.png") });
    await checkImagesAndOverflow(page, "ip13 MenuItemFormSheet edit");
    const descVal = await page.locator("#menu-dish-description").inputValue();
    assert(descVal.length >= 15, "Seeded menu dish has prefilled Russian description", `desc=${descVal}`);
    await page.getByRole("button", { name: "Закрыть" }).click();
    await page.waitForTimeout(200);

    // 6. Create NEW dish with uploaded photo + short description
    await page.getByRole("button", { name: "Новое блюдо в меню" }).first().click();
    await page.waitForSelector("#menu-dish-name");
    await page.fill("#menu-dish-name", "Боул с манго и тунцом");
    await page.fill(
      "#menu-dish-description",
      "Свежий тунец, спелое манго, авокадо и хрустящие огурцы",
    );
    await page.fill("#menu-kcal", "445");

    // Upload a real JPEG file (reuse oatmeal-berries.jpg from public/dishes)
    const samplePhoto = path.resolve("public/dishes/shrimp-mango-salad.jpg");
    await page.locator('input[type="file"]').setInputFiles(samplePhoto);
    await page.waitForSelector(".dish-photo-preview-img");
    const previewSrc = await page.locator(".dish-photo-preview-img").getAttribute("src");
    assert(
      Boolean(previewSrc && previewSrc.startsWith("/api/nutrition/photos/")),
      "Uploaded menu photo stored via /api/nutrition/photos/{id}",
      `src=${previewSrc}`,
    );
    await page.getByRole("button", { name: "Добавить в меню" }).click();
    await page.waitForTimeout(400);

    // Verify new dish card appears in Меню Карточки with loaded uploaded photo
    const newCard = page.locator(".dish-card", { hasText: "Боул с манго и тунцом" });
    assert((await newCard.count()) === 1, "Newly created dish card appears in Меню");
    const newCardImgSrc = await newCard.locator("img").getAttribute("src");
    assert(
      Boolean(newCardImgSrc && newCardImgSrc.startsWith("/api/nutrition/photos/")),
      "New dish card displays uploaded DB-persisted photo",
      `src=${newCardImgSrc}`,
    );

    // 7. Quick-add from Samokat card pill & verify MealPickerSheet thumbnails + photo upload
    await newCard.locator(".dish-card-action-pill").click();
    await page.waitForTimeout(350);
    await page.locator(".mt-segmented-btn", { hasText: "Рацион" }).first().click();
    await page.waitForSelector(".dish-card[data-dish-card='meal']");
    await page.waitForTimeout(300);

    const addedMealCard = page.locator(".dish-card", { hasText: "Боул с манго и тунцом" });
    assert(
      (await addedMealCard.count()) >= 1,
      "Quick-added Samokat card appears in Рацион with inherited photo",
    );

    // Open MealPickerSheet (add) to verify thumbnails in catalog picker
    await page.getByRole("button", { name: "Добавить блюдо в рацион" }).click();
    await page.waitForSelector(".nutrition-picker-thumb");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_meal_picker_thumbs.png") });
    await checkImagesAndOverflow(page, "ip13 MealPickerSheet thumbs");
    await page.getByRole("button", { name: "Закрыть" }).click();
    await page.waitForTimeout(200);

    // 8. Switch back to Список and verify clean list mode still works
    await listBtn.click();
    await page.waitForTimeout(200);
    assert((await page.locator(".dish-card").count()) === 0, "Список mode restores compact text rows");
    assert((await page.locator(".mt-list-row").count()) >= 3, "Список mode renders meal ListRows");

    // 9. Desktop viewport check in Карточки mode
    await page.setViewportSize({ width: 1280, height: 900 });
    await cardsBtn.click();
    await page.waitForSelector(".dish-card");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, "desk_ration_cards.png"), fullPage: true });
    await checkImagesAndOverflow(page, "desktop Рацион (Карточки)");

    await page.locator(".mt-segmented-btn", { hasText: "Меню" }).first().click();
    await page.waitForSelector(".dish-card[data-dish-card='menu']");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, "desk_menu_cards.png") });
    await checkImagesAndOverflow(page, "desktop Меню (Карточки)");

    assert(consoleErrors.length === 0, "Zero console/page errors", consoleErrors.join(" | "));
    assert(httpErrors.length === 0, "Zero HTTP >= 400 errors", httpErrors.join(" | "));

    await context.close();
  } finally {
    await browser.close();
  }

  console.log(`\nSUMMARY: ${results.passed} passed, ${results.findings.length} findings`);
  if (results.findings.length > 0) {
    console.error(JSON.stringify(results.findings, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
