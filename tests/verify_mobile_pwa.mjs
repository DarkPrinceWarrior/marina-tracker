/**
 * End-to-end Mobile PWA & iPhone 14 Pro (393x852) Visual + Persistence Verification
 * for Marina Tracker («Ритм»).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  "/home/ruslan_safaev/digital_platform/frontend/package.json"
);
const { chromium } = require("playwright");

const ROOT = "/home/ruslan_safaev/marina_tracker";
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "verify");
const DB_PATH = "/tmp/marina_tracker_verify_e2e.sqlite3";
const PORT = Number(process.env.MARINA_PORT || 8099);
const BASE_URL = `http://127.0.0.1:${PORT}`;

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
for (const file of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

const serverEnv = {
  ...process.env,
  MARINA_DB_PATH: DB_PATH,
  PATH: `/home/ruslan_safaev/.local/bin:/home/ruslan_safaev/.nvm/versions/node/v22.23.2/bin:${process.env.PATH || ""}`,
};

const uvicornBin = path.join(ROOT, ".venv", "bin", "uvicorn");
const serverProc = spawn(
  uvicornBin,
  ["app.main:app", "--host", "127.0.0.1", "--port", String(PORT)],
  {
    cwd: ROOT,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverLogs = "";
serverProc.stdout.on("data", (d) => {
  serverLogs += d.toString();
});
serverProc.stderr.on("data", (d) => {
  serverLogs += d.toString();
});

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === "ok") return json;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Server on :${PORT} did not start within ${timeoutMs}ms.\nLogs:\n${serverLogs}`
  );
}

const defects = [];
const passes = [];

function pass(name, detail = "") {
  passes.push({ name, detail });
  console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ""}`);
}

function defect(area, detail) {
  defects.push({ area, detail });
  console.error(`  [FAIL] ${area}: ${detail}`);
}

async function auditViewportAndInputs(page, screenName) {
  const metrics = await page.evaluate(() => {
    const docEl = document.documentElement;
    const scrollW = docEl.scrollWidth;
    const innerW = window.innerWidth;
    const bodyText = document.body.innerText || "";
    const badTokens = [];
    if (/\bNaN\b/.test(bodyText)) badTokens.push("NaN");
    if (/\bundefined\b/.test(bodyText)) badTokens.push("undefined");
    if (bodyText.includes("[object Object]")) badTokens.push("[object Object]");

    const smallInputs = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (el.type === "checkbox" || el.type === "radio" || el.type === "range")
        continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fsPx = parseFloat(style.fontSize);
      if (fsPx < 16) {
        smallInputs.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          placeholder: el.placeholder || el.getAttribute("aria-label") || "",
          fontSize: fsPx,
        });
      }
    }

    // Check overflow of any visible direct children exceeding viewport right edge
    const overflowing = [];
    for (const el of document.querySelectorAll("section, article, button, div")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > innerW + 2 && !el.closest(".mt-date-strip, .mt-chip-row")) {
        const cls = typeof el.className === "string" ? el.className : "";
        if (cls && !overflowing.some((o) => o.cls === cls)) {
          overflowing.push({ cls: cls.slice(0, 60), right: Math.round(rect.right) });
        }
      }
    }

    return {
      scrollW,
      innerW,
      badTokens,
      smallInputs,
      overflowing: overflowing.slice(0, 5),
    };
  });

  if (metrics.scrollW > metrics.innerW) {
    defect(
      `Overflow (${screenName})`,
      `scrollWidth=${metrics.scrollW} > innerWidth=${metrics.innerW}`
    );
  } else {
    pass(`No horizontal overflow (${screenName})`, `${metrics.scrollW} <= ${metrics.innerW}`);
  }

  if (metrics.badTokens.length > 0) {
    defect(`Broken copy (${screenName})`, `Found ${metrics.badTokens.join(", ")}`);
  }

  if (metrics.smallInputs.length > 0) {
    defect(
      `iOS Safari input zoom (${screenName})`,
      `Inputs with font-size < 16px: ${JSON.stringify(metrics.smallInputs)}`
    );
  }
}

async function clickBottomTab(page, label) {
  await page.locator("nav.bottom-nav button", { hasText: label }).click();
  await page.waitForTimeout(350);
}

async function clickSegment(page, label) {
  await page.locator(".mt-segmented-btn", { hasText: label }).click();
  await page.waitForTimeout(350);
}

async function snap(page, filename, fullPage = false) {
  const out = path.join(ARTIFACTS_DIR, filename);
  await page.screenshot({ path: out, fullPage });
  return out;
}

async function main() {
  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  try {
    const health = await waitForServer();
    pass("Server healthy", `today=${health.today} on :${PORT}`);

    // HTTP PWA checks
    const manifestRes = await fetch(`${BASE_URL}/manifest.webmanifest`);
    assert.equal(manifestRes.status, 200);
    const manifest = await manifestRes.json();
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons || []) {
      const iRes = await fetch(`${BASE_URL}${icon.src}`);
      assert.equal(iRes.status, 200, `Icon ${icon.src} failed`);
    }
    const swRes = await fetch(`${BASE_URL}/sw.js`);
    assert.equal(swRes.status, 200);
    pass(
      "PWA manifest & sw.js",
      `display=${manifest.display}, ${(manifest.icons || []).length} icons 200 OK`
    );

    browser = await chromium.launch({
      headless: true,
      executablePath: fs.existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined,
    });

    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    });

    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    // -----------------------------------------------------------------------
    // 1. Load Root + PWA Meta Audit + Tab 1: Сегодня
    // -----------------------------------------------------------------------
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    const pwaMeta = await page.evaluate(() => {
      const meta = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
        "";
      const link = (rel) =>
        document.querySelector(`link[rel="${rel}"]`)?.getAttribute("href") || "";
      return {
        viewport: meta("viewport"),
        appleCapable: meta("apple-mobile-web-app-capable"),
        mobileCapable: meta("mobile-web-app-capable"),
        statusBar: meta("apple-mobile-web-app-status-bar-style"),
        appleTitle: meta("apple-mobile-web-app-title"),
        themeColor: meta("theme-color"),
        manifestHref: link("manifest"),
        appleIcon: link("apple-touch-icon"),
      };
    });

    assert.equal(pwaMeta.appleCapable, "yes", "Missing apple-mobile-web-app-capable=yes");
    assert.ok(
      pwaMeta.viewport.includes("viewport-fit=cover"),
      `viewport missing viewport-fit=cover: ${pwaMeta.viewport}`
    );
    assert.ok(pwaMeta.manifestHref, "Missing manifest link");
    assert.ok(pwaMeta.appleIcon, "Missing apple-touch-icon link");
    pass("iPhone 14 Pro PWA meta tags", JSON.stringify(pwaMeta));

    await auditViewportAndInputs(page, "Сегодня");
    await snap(page, "01_today_viewport.png", false);
    await snap(page, "01_today_full.png", true);

    // Interactive Today: Create a new task + mark it completed + save reflection
    const testTaskTitle = "Тестовая задача Марины";
    await page.getByRole("button", { name: /\+?\s*Задача/i }).first().click();
    await page.waitForTimeout(300);
    await auditViewportAndInputs(page, "TaskFormSheet");
    const taskSheet = page.locator(".mt-sheet");
    const taskSheetBox = await taskSheet.boundingBox();
    assert.ok(
      taskSheetBox && taskSheetBox.y >= 0 && taskSheetBox.y + taskSheetBox.height <= 855,
      `TaskFormSheet must be anchored inside 393x852 viewport, got ${JSON.stringify(taskSheetBox)}`
    );
    pass("Sheet anchored in viewport (TaskFormSheet)", `y=${Math.round(taskSheetBox.y)}, h=${Math.round(taskSheetBox.height)}`);
    await taskSheet.locator('input[type="text"], input:not([type])').first().fill(testTaskTitle);
    await taskSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(450);

    const taskRow = page.locator(".mt-check-row", { hasText: testTaskTitle });
    await taskRow.waitFor({ state: "visible", timeout: 5000 });
    await taskRow.locator(".mt-check-main").click();
    await page.waitForTimeout(350);
    pass("Today task created & checked", testTaskTitle);

    const reflectionText = "Спокойный, продуктивный день проверки Ритма.";
    const reflectionCard = page.locator('section[aria-label="Итог дня и самочувствие"]');
    await reflectionCard.locator("textarea").fill(reflectionText);
    await reflectionCard.getByRole("button", { name: /Сохранить итог/i }).click();
    await page.waitForTimeout(400);
    pass("Today reflection saved", reflectionText);

    // -----------------------------------------------------------------------
    // 2. Tab 2: Привычки -> Привычки (Water + Habits + Vitamins)
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Привычки");
    await page.waitForTimeout(300);
    await auditViewportAndInputs(page, "Привычки");
    await snap(page, "02_habits_water_viewport.png", false);
    await snap(page, "02_habits_water_full.png", true);

    // Add +250 ml water
    const waterBeforeText = await page.locator(".water-card").innerText();
    const matchBefore = waterBeforeText.match(/(\d[\d\s]*)\s*\/\s*(\d[\d\s]*)\s*мл/);
    assert.ok(matchBefore, `Could not parse water ml from: ${waterBeforeText}`);
    const waterBefore = Number(matchBefore[1].replace(/\s+/g, ""));
    await page.locator(".water-card button", { hasText: "+250" }).first().click();
    await page.waitForTimeout(450);
    const waterAfterText = await page.locator(".water-card").innerText();
    const matchAfter = waterAfterText.match(/(\d[\d\s]*)\s*\/\s*(\d[\d\s]*)\s*мл/);
    const waterAfter = Number(matchAfter[1].replace(/\s+/g, ""));
    assert.equal(waterAfter, waterBefore + 250, `Water expected ${waterBefore + 250}, got ${waterAfter}`);
    pass("Water +250 ml added", `${waterBefore} -> ${waterAfter} мл`);

    // Check off an uncompleted vitamin AND an uncompleted habit
    const uncheckedVitamin = page
      .locator(".habits-period-card .mt-check-row:not(.is-checked)", { hasText: "Витамин" })
      .first();
    const vitaminTitle = (await uncheckedVitamin.locator(".mt-check-title").innerText()).trim();
    await uncheckedVitamin.locator(".mt-check-main").click();
    await page.waitForTimeout(400);
    pass("Vitamin marked done", vitaminTitle);

    const uncheckedHabit = page
      .locator(".habits-period-card .mt-check-row:not(.is-checked)")
      .first();
    const habitTitle = (await uncheckedHabit.locator(".mt-check-title").innerText()).trim();
    await uncheckedHabit.locator(".mt-check-main").click();
    await page.waitForTimeout(400);
    pass("Habit marked done", habitTitle);

    // -----------------------------------------------------------------------
    // 3. Tab 2: Привычки -> Тренировки (Breathing / Pilates / Qigong)
    // -----------------------------------------------------------------------
    await clickSegment(page, "Тренировки");
    await page.waitForTimeout(350);
    await auditViewportAndInputs(page, "Тренировки");
    await snap(page, "03_workouts_viewport.png", false);
    await snap(page, "03_workouts_full.png", true);

    // Select Цигун and log a workout
    await page.locator(".workout-type-card", { hasText: "Цигун" }).click();
    await page.waitForTimeout(200);
    const workoutNote = "Вечерний цигун на баланс";
    const noteInput = page.locator('input[placeholder*="замет"], textarea[placeholder*="замет"], input[placeholder*="ощущ"], textarea[placeholder*="ощущ"]').first();
    if (await noteInput.count()) {
      await noteInput.fill(workoutNote);
    }
    await page.getByRole("button", { name: /Отметить тренировку сделанной/i }).click();
    await page.waitForTimeout(500);
    const workoutsText = await page.locator("main").innerText();
    assert.ok(workoutsText.includes("Цигун"), "Logged Qigong workout did not appear");
    pass("Workout logged (Цигун)", workoutNote);

    // -----------------------------------------------------------------------
    // 4. Tab 2: Привычки -> Цикл (12+ Months History & Day Toggle)
    // -----------------------------------------------------------------------
    await clickSegment(page, "Цикл");
    await page.waitForTimeout(450);
    await auditViewportAndInputs(page, "Цикл (текущий)");
    await snap(page, "04_cycle_current_viewport.png", false);
    await snap(page, "04_cycle_current_full.png", true);

    // Verify 12+ month archive cards visible
    const historyCardsCount = await page.locator(".cycle-history-card").count();
    assert.ok(
      historyCardsCount >= 12,
      `Expected >=12 cycle history cards, found ${historyCardsCount}`
    );
    pass("Cycle 12m+ archive rendered", `${historyCardsCount} past cycles visible`);

    // Navigate 7 months back using prev-month button and verify historical period days render
    const prevMonthBtn = page.locator(".cycle-cal-header button").first();
    for (let i = 0; i < 7; i++) {
      await prevMonthBtn.click();
      await page.waitForTimeout(180);
    }
    await page.waitForTimeout(350);
    const pastPeriodDays = await page.locator(".cycle-day.is-period").count();
    assert.ok(
      pastPeriodDays >= 3,
      `Expected >=3 historical period days 7 months back, found ${pastPeriodDays}`
    );
    const pastMonthHeader = (await page.locator(".cycle-cal-header").innerText()).replace(/\s+/g, " ").trim();
    pass("Cycle navigated 7 months back", `${pastMonthHeader}, ${pastPeriodDays} period days`);
    await snap(page, "05_cycle_past_7m.png", false);

    // Tap a non-period day in that past month and toggle period ON + save
    const targetCycleDayBtn = page
      .locator(".cycle-day:not(.is-outside):not(.is-period)")
      .first();
    const cycleDayLabel = (await targetCycleDayBtn.innerText()).trim();
    await targetCycleDayBtn.click();
    await page.waitForTimeout(300);
    await auditViewportAndInputs(page, "CycleDaySheet");
    const cycleSheet = page.locator(".mt-sheet");
    await cycleSheet.locator(".mt-check-main").first().click();
    await page.waitForTimeout(150);
    await cycleSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(500);
    const pastPeriodDaysAfter = await page.locator(".cycle-day.is-period").count();
    assert.equal(
      pastPeriodDaysAfter,
      pastPeriodDays + 1,
      `Expected period days to increase from ${pastPeriodDays} to ${pastPeriodDays + 1}`
    );
    pass("Cycle day toggled & saved", `Day ${cycleDayLabel} marked period (${pastPeriodDays} -> ${pastPeriodDaysAfter})`);

    // -----------------------------------------------------------------------
    // 5. Tab 3: Питание -> Рацион дня & Меню блюд
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Питание");
    await page.waitForTimeout(400);
    await auditViewportAndInputs(page, "Питание (Рацион)");
    await snap(page, "06_nutrition_ration_viewport.png", false);
    await snap(page, "06_nutrition_ration_full.png", true);

    // Log a breakfast meal with custom dish + grams + time
    const breakfastCard = page.locator('article[aria-label="Завтрак"], section[aria-label="Завтрак"]').first();
    await breakfastCard.getByRole("button", { name: /Выбрать из меню \/ добавить/i }).click();
    await page.waitForTimeout(350);
    await auditViewportAndInputs(page, "MealPickerSheet");
    const mealSheet = page.locator(".mt-sheet");
    const mealSheetBox = await mealSheet.boundingBox();
    assert.ok(
      mealSheetBox && mealSheetBox.y >= 0 && mealSheetBox.y + mealSheetBox.height <= 855,
      `MealPickerSheet must be anchored inside 393x852 viewport, got ${JSON.stringify(mealSheetBox)}`
    );
    pass("Sheet anchored in viewport (MealPickerSheet)", `y=${Math.round(mealSheetBox.y)}, h=${Math.round(mealSheetBox.height)}`);
    await snap(page, "11_meal_picker_sheet.png", false);
    // Switch to "Своё блюдо" so we control exact dish name, grams, and time
    const customDishTab = mealSheet.locator("button", { hasText: /Своё блюдо/i }).first();
    if (await customDishTab.count()) {
      await customDishTab.click();
      await page.waitForTimeout(150);
    }
    const testDishName = "Творожная запеканка с грушей";
    await mealSheet.locator('input[type="text"], input:not([type])').first().fill(testDishName);
    // Set grams & time
    const gramsInput = mealSheet.locator('input[type="number"]').nth(1);
    if (await gramsInput.count()) {
      await gramsInput.fill("240");
    }
    const timeInput = mealSheet.locator('input[type="time"]').first();
    if (await timeInput.count()) {
      await timeInput.fill("08:45");
    }
    await mealSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(500);
    const breakfastText = await breakfastCard.innerText();
    assert.ok(breakfastText.includes(testDishName), "Logged breakfast dish not visible");
    assert.ok(breakfastText.includes("08:45"), "Logged breakfast time 08:45 not visible");
    pass("Breakfast meal logged", `${testDishName}, 08:45`);

    // Switch to Меню блюд
    await clickSegment(page, "Меню блюд");
    await page.waitForTimeout(350);
    await auditViewportAndInputs(page, "Питание (Меню)");
    await snap(page, "07_nutrition_menu_viewport.png", false);
    await snap(page, "07_nutrition_menu_full.png", true);

    // -----------------------------------------------------------------------
    // 6. Tab 4: Дом -> Уборка и дела & Покупки
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Дом");
    await page.waitForTimeout(400);
    await auditViewportAndInputs(page, "Дом (Уборка)");
    await snap(page, "08_home_chores_viewport.png", false);
    await snap(page, "08_home_chores_full.png", true);

    // Check off an uncompleted cleaning chore
    const uncheckedChore = page.locator(".chore-card .mt-check-row:not(.is-checked)").first();
    const choreTitle = (await uncheckedChore.locator(".mt-check-title").innerText()).trim();
    await uncheckedChore.locator(".mt-check-main").click();
    await page.waitForTimeout(450);
    pass("Home chore checked off", choreTitle);

    // Switch to Покупки & add a grocery item
    await clickSegment(page, "Покупки");
    await page.waitForTimeout(350);
    await auditViewportAndInputs(page, "Дом (Покупки)");
    await snap(page, "09_home_shopping_viewport.png", false);

    const testGrocery = "Шпинат свежий бэби";
    await page.locator('input[aria-label="Название продукта или товара"]').fill(testGrocery);
    await page.locator('input[aria-label="Количество (необязательно)"]').fill("1 уп");
    await page.locator('button[aria-label="Добавить в покупки"]').click();
    await page.waitForTimeout(450);
    const shoppingBody = await page.locator('section[aria-label="Дом"]').innerText();
    assert.ok(shoppingBody.includes(testGrocery), "Added grocery item not visible");
    pass("Shopping item added", testGrocery);
    await snap(page, "09_home_shopping_full.png", true);

    // -----------------------------------------------------------------------
    // 7. Tab 5: Цели (Multi-Year Goal Check-in)
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Цели");
    await page.waitForTimeout(450);
    await auditViewportAndInputs(page, "Цели");
    const addGoalBox = await page.locator("main button", { hasText: /Цель|Новая цель/i }).first().boundingBox();
    assert.ok(
      addGoalBox && addGoalBox.y >= 0 && addGoalBox.y + addGoalBox.height <= 810,
      `Goals header '+ Цель' button must be visible inside 393x852 viewport, got ${JSON.stringify(addGoalBox)}`
    );
    pass("Header '+ Цель' anchored in viewport (Цели)", `y=${Math.round(addGoalBox.y)}, h=${Math.round(addGoalBox.height)}`);
    await snap(page, "10_goals_viewport.png", false);
    await snap(page, "10_goals_full.png", true);

    // Open Чек-ин on first goal and submit a note
    await page.locator(".goal-card button", { hasText: "Чек-ин" }).first().click();
    await page.waitForTimeout(300);
    await auditViewportAndInputs(page, "GoalCheckinSheet");
    const checkinNote = "Держу стабильный темп, прошла очередной шаг!";
    const checkinSheet = page.locator(".mt-sheet");
    await checkinSheet.locator("textarea").fill(checkinNote);
    await checkinSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(500);
    pass("Multi-year goal check-in saved", checkinNote);

    // -----------------------------------------------------------------------
    // 8. FULL PAGE RELOAD -> Assert ALL Mutations Persisted in SQLite!
    // -----------------------------------------------------------------------
    console.log("\n  --- Reloading page to verify full SQLite persistence ---");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(450);

    // 8a. Today: task still checked & reflection note persisted
    const todayBodyReload = await page.locator("main").innerText();
    assert.ok(todayBodyReload.includes(testTaskTitle), "Task did not persist after reload");
    const reloadedTaskChecked = await page
      .locator(".mt-check-row.is-checked", { hasText: testTaskTitle })
      .count();
    assert.ok(reloadedTaskChecked >= 1, "Task checked state did not persist after reload");
    const reloadedReflection = await page
      .locator('section[aria-label="Итог дня и самочувствие"] textarea')
      .inputValue();
    assert.equal(reloadedReflection, reflectionText, "Reflection did not persist after reload");
    pass("Persist check: Today task + reflection");

    // 8b. Habits: water total, vitamin checked, habit checked, Qigong workout, Cycle day
    await clickBottomTab(page, "Привычки");
    await page.waitForTimeout(400);
    const waterReloadText = await page.locator(".water-card").innerText();
    const matchReload = waterReloadText.match(/(\d[\d\s]*)\s*\/\s*(\d[\d\s]*)\s*мл/);
    assert.equal(
      Number(matchReload[1].replace(/\s+/g, "")),
      waterAfter,
      "Water total did not persist after reload"
    );
    assert.ok(
      (await page.locator(".habits-period-card .mt-check-row.is-checked", { hasText: vitaminTitle }).count()) >= 1,
      `Vitamin '${vitaminTitle}' checked state did not persist`
    );
    assert.ok(
      (await page.locator(".habits-period-card .mt-check-row.is-checked", { hasText: habitTitle }).count()) >= 1,
      `Habit '${habitTitle}' checked state did not persist`
    );
    pass("Persist check: Water + Vitamin + Habit");

    await clickSegment(page, "Тренировки");
    await page.waitForTimeout(350);
    assert.ok(
      (await page.locator("main").innerText()).includes("Цигун"),
      "Qigong workout did not persist after reload"
    );
    pass("Persist check: Workout (Цигун)");

    await clickSegment(page, "Цикл");
    await page.waitForTimeout(400);
    const prevMonthBtn2 = page.locator(".cycle-cal-header button").first();
    for (let i = 0; i < 7; i++) {
      await prevMonthBtn2.click();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator(".cycle-day.is-period").count(),
      pastPeriodDaysAfter,
      "Toggled cycle day did not persist after reload"
    );
    pass("Persist check: Cycle day 7 months back");

    // 8c. Nutrition: Breakfast dish + 08:45 time persisted
    await clickBottomTab(page, "Питание");
    await page.waitForTimeout(400);
    const bfReloadText = await page
      .locator('article[aria-label="Завтрак"], section[aria-label="Завтрак"]')
      .first()
      .innerText();
    assert.ok(bfReloadText.includes(testDishName), "Breakfast meal did not persist");
    assert.ok(bfReloadText.includes("08:45"), "Breakfast meal time did not persist");
    pass("Persist check: Breakfast meal + time");

    // 8d. Home: Chore checked + Grocery item persisted
    await clickBottomTab(page, "Дом");
    await page.waitForTimeout(400);
    assert.ok(
      (await page.locator(".chore-card .mt-check-row.is-checked", { hasText: choreTitle }).count()) >= 1,
      `Chore '${choreTitle}' checked state did not persist`
    );
    await clickSegment(page, "Покупки");
    await page.waitForTimeout(350);
    assert.ok(
      (await page.locator('section[aria-label="Дом"]').innerText()).includes(testGrocery),
      "Grocery item did not persist"
    );
    pass("Persist check: Chore + Grocery item");

    // 8e. Goals: Check-in note persisted (expand check-in history on first goal)
    await clickBottomTab(page, "Цели");
    await page.waitForTimeout(450);
    const firstGoal = page.locator(".goal-card").first();
    const historyBtn = firstGoal.locator("button", { hasText: /История чек-инов|Чек-ины/i }).first();
    if (await historyBtn.count()) {
      await historyBtn.click();
      await page.waitForTimeout(250);
    }
    const goalTextAfter = await firstGoal.innerText();
    assert.ok(
      goalTextAfter.includes(checkinNote),
      `Goal check-in note did not persist after reload. Card text: ${goalTextAfter.slice(0, 400)}`
    );
    pass("Persist check: Multi-year goal check-in");

    // Console / Page / Network errors check
    if (consoleErrors.length > 0) {
      defect("Console errors", consoleErrors.join(" | "));
    } else {
      pass("Zero console errors");
    }
    if (pageErrors.length > 0) {
      defect("Page errors", pageErrors.join(" | "));
    } else {
      pass("Zero uncaught page errors");
    }
    if (failedRequests.length > 0) {
      defect("Failed network responses", failedRequests.join(" | "));
    } else {
      pass("Zero failed network responses (status >= 400)");
    }

    console.log(`\nSummary: ${passes.length} passed, ${defects.length} failed.`);
    if (defects.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    if (serverProc && !serverProc.killed) {
      serverProc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
      if (!serverProc.killed) serverProc.kill("SIGKILL");
    }
    for (const file of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

main().catch((err) => {
  console.error("FATAL E2E ERROR:", err);
  process.exit(1);
});
