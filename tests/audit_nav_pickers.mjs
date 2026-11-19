/**
 * Playwright E2E + Visual Inspection for:
 *   1. Unified non-stock Carbon & Cobalt pickers (DateField, TimeField, RangeField, CheckField)
 *   2. All logical cross-section navigation transitions & zero sticky/spurious-sheet bugs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  "/home/ruslan_safaev/digital_platform/frontend/package.json",
);
const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8097";
const OUT_DIR = path.resolve("artifacts/audit_nav_pickers");
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

async function assertZeroStockControlsAndBounds(page, scopeLabel, { expectPopover = false } = {}) {
  const check = await page.evaluate((wantPop) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const overflow = document.documentElement.scrollWidth - vw;
    const stock = document.querySelectorAll(
      'select, input[type="date"], input[type="time"], input[type="checkbox"], input[type="month"], input[type="week"], input[type="datetime-local"]',
    ).length;

    let popoverIssue = null;
    if (wantPop) {
      const pop = document.querySelector(".mt-picker-popover");
      if (!pop) {
        popoverIssue = "expected .mt-picker-popover not found";
      } else {
        const r = pop.getBoundingClientRect();
        if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) {
          popoverIssue = `popover outside viewport (${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)} vs ${vw}x${vh})`;
        }
      }
    }
    return { overflow, stock, popoverIssue };
  }, expectPopover);

  assert(check.overflow <= 1, `${scopeLabel}: zero horizontal overflow`, `overflow=${check.overflow}px`);
  assert(check.stock === 0, `${scopeLabel}: zero stock select/date/time/checkbox`, `stock=${check.stock}`);
  if (expectPopover) {
    assert(!check.popoverIssue, `${scopeLabel}: custom popover inside viewport`, check.popoverIssue || "");
  }
}

async function clickBottomTab(page, label) {
  await page.locator("nav.bottom-nav button", { hasText: label }).click();
  await page.waitForTimeout(260);
}

async function clickSegment(page, label) {
  await page.locator(".mt-segmented-btn", { hasText: label }).first().click();
  await page.waitForTimeout(260);
}

async function closeAllSheets(page) {
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('.mt-sheet button[aria-label="Закрыть"]').last();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(200);
    } else {
      break;
    }
  }
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
    await page.waitForTimeout(400);

    // -----------------------------------------------------------------------
    // 1. Custom TimeField (compact) in NotificationsSheet + Escape isolation
    // -----------------------------------------------------------------------
    await page.locator('button[aria-label="Уведомления"]').click();
    await page.waitForSelector('.mt-sheet [data-picker="time"]');
    const firstTimeTrigger = page.locator('.mt-sheet [data-picker="time"]').first();
    await firstTimeTrigger.click();
    await page.waitForSelector(".mt-picker-popover--time");
    await assertZeroStockControlsAndBounds(page, "NotificationsSheet TimeField", { expectPopover: true });
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_time_picker_notif.png") });

    // Select 07:45 cleanly
    await page.locator('.mt-time-col[aria-label="Часы"] button', { hasText: /^07$/ }).click();
    await page.locator('.mt-time-col[aria-label="Минуты"] button', { hasText: /^45$/ }).click();
    await page.waitForTimeout(120);
    assert(
      (await firstTimeTrigger.getAttribute("data-value")) === "07:45",
      "TimeField updates value cleanly to 07:45",
    );

    // Pressing Escape must close ONLY the TimeField popover, keeping NotificationsSheet open
    await page.keyboard.press("Escape");
    await page.waitForTimeout(180);
    assert((await page.locator(".mt-picker-popover").count()) === 0, "Escape closes TimeField popover");
    assert((await page.locator(".mt-sheet").count()) === 1, "Escape preserves parent NotificationsSheet");
    await closeAllSheets(page);

    // -----------------------------------------------------------------------
    // 2. Navigation: Today -> Cycle deep-link does NOT stay sticky on return
    // -----------------------------------------------------------------------
    await page.locator('button[aria-label*="цикл" i]').first().click();
    await page.waitForSelector(".cycle-hero");
    pass("Today -> Cycle metric cell navigates directly to Здоровье -> Цикл");

    // Switch back to Привычки, leave Здоровье, return via BottomNav -> must open Привычки (NOT stuck on Цикл!)
    await clickSegment(page, "Привычки");
    await clickBottomTab(page, "Сегодня");
    await clickBottomTab(page, "Здоровье");
    const activeHabitsSeg = await page
      .locator('.mt-segmented-btn[aria-selected="true"]')
      .first()
      .innerText();
    assert(
      activeHabitsSeg.includes("Привычки"),
      "BottomNav -> Здоровье opens Привычки cleanly without stale sticky Цикл redirect",
      `active=${activeHabitsSeg}`,
    );

    // Spurious sheet re-open regression check in Здоровье
    await page.locator('button[aria-label="Добавить привычку или витамин"]').click();
    await page.waitForSelector(".mt-sheet");
    await closeAllSheets(page);
    await clickSegment(page, "Тренировки");
    await clickSegment(page, "Привычки");
    assert(
      (await page.locator(".mt-sheet").count()) === 0,
      "Switching Привычки -> Тренировки -> Привычки does not spuriously reopen create habit modal",
    );

    // -----------------------------------------------------------------------
    // 3. Connected Navigation: Today -> Выполнено за день -> Питание item jump
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Сегодня");
    await page.locator('button[aria-label*="выполненное" i]').first().click();
    await page.waitForSelector(".mt-sheet");
    const mealFeedRow = page.locator(".mt-sheet .mt-list-row", { hasText: "Питание" }).first();
    if (await mealFeedRow.count()) {
      await mealFeedRow.click();
      await page.waitForTimeout(300);
      const heading = await page.locator("h1").first().innerText();
      assert(
        heading.includes("Питание"),
        "Tapping Питание step inside «Выполнено за день» navigates directly to Питание",
        `heading=${heading}`,
      );
      assert((await page.locator(".mt-sheet").count()) === 0, "Sheet closes cleanly after navigation");
    } else {
      fail("Выполнено за день Питание row", "No Питание row in completed feed");
    }

    // -----------------------------------------------------------------------
    // 4. Connected Navigation: YearReviewSheet -> specific GoalDetail -> linked Habit
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Сегодня");
    await page.locator('button[aria-label="Итоги года"]').click();
    await page.waitForSelector(".mt-sheet");
    const firstGoalReviewRow = page
      .locator(".mt-sheet .mt-list-row", { hasText: /1 месяц|1 год|5 лет/ })
      .first();
    const clickedGoalTitle = (await firstGoalReviewRow.locator(".mt-list-title").innerText()).trim();
    await firstGoalReviewRow.click();
    await page.waitForTimeout(400);
    const detailSheetTitle = await page.locator(".mt-sheet-title").first().innerText();
    assert(
      detailSheetTitle.includes(clickedGoalTitle.slice(0, 14)),
      "YearReviewSheet goal click opens that exact GoalDetailSheet directly",
      `expected~=${clickedGoalTitle}, got=${detailSheetTitle}`,
    );

    // Click linked habit inside GoalDetailSheet -> navigates to Здоровье -> Привычки
    const linkedHabitBtn = page.locator(".mt-sheet button.goal-habit-link", { hasText: "Привычка:" }).first();
    if (await linkedHabitBtn.count()) {
      await linkedHabitBtn.click();
      await page.waitForTimeout(350);
      const heading = await page.locator("h1").first().innerText();
      assert(
        heading.includes("Здоровье"),
        "GoalDetailSheet linked habit navigates cleanly to Здоровье -> Привычки",
        `heading=${heading}`,
      );
    } else {
      await closeAllSheets(page);
    }

    // -----------------------------------------------------------------------
    // 5. Custom DateField + TimeField in EventFormSheet + Calendar Today Return
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Цели");
    await clickSegment(page, "Календарь");

    // Browse next month -> verify «Вернуться на сегодня» appears & returns
    await page.locator('button[aria-label="Следующий месяц"]').click();
    await page.waitForTimeout(200);
    const returnTodayBtn = page.locator("button", { hasText: "Вернуться на сегодня" });
    assert((await returnTodayBtn.count()) === 1, "EventsCalendarTab shows «Вернуться на сегодня» on another month");
    await returnTodayBtn.click();
    await page.waitForTimeout(200);
    assert((await returnTodayBtn.count()) === 0, "«Вернуться на сегодня» returns cleanly to current month");

    // Open + Событие -> test custom DateField (including month/year grid) + TimeField
    await page.locator('button[aria-label="Новое событие"]').click();
    await page.waitForSelector('#event-date-input[data-picker="date"]');
    await page.locator("#event-date-input").click();
    await page.waitForSelector(".mt-picker-popover");
    await assertZeroStockControlsAndBounds(page, "EventFormSheet DateField", { expectPopover: true });
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_date_picker_event.png") });

    // Switch to month/year grid & back
    await page.locator(".mt-picker-month-btn").click();
    await page.waitForSelector(".mt-picker-months");
    await page.locator(".mt-picker-month-cell").nth(10).click();
    await page.waitForSelector(".mt-picker-days");
    await page.locator(".mt-picker-day:not(.is-outside)").nth(14).click();
    await page.waitForTimeout(150);
    assert((await page.locator(".mt-picker-popover").count()) === 0, "Selecting a day closes DateField popover");

    await page.locator("#event-time-input").click();
    await page.waitForSelector(".mt-picker-popover--time");
    await assertZeroStockControlsAndBounds(page, "EventFormSheet TimeField", { expectPopover: true });
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_time_picker_event.png") });
    await page.keyboard.press("Escape");
    await closeAllSheets(page);

    // Spurious sheet re-open regression check in Календарь & Желания
    await clickSegment(page, "Желания");
    await page.locator('button[aria-label="Новое желание"]').click();
    await page.waitForSelector(".mt-sheet");
    await closeAllSheets(page);
    await clickSegment(page, "Календарь");
    assert((await page.locator(".mt-sheet").count()) === 0, "Switching to Календарь does not spuriously reopen event modal");
    await clickSegment(page, "Желания");
    assert((await page.locator(".mt-sheet").count()) === 0, "Switching back to Желания does not spuriously reopen wish modal");

    // -----------------------------------------------------------------------
    // 6. Custom RangeField + DateField in GoalCheckinSheet
    // -----------------------------------------------------------------------
    await clickSegment(page, "Цели");
    await page.locator(".goal-card button", { hasText: "Чек-ин" }).first().click();
    await page.waitForSelector(".mt-range-wrap");
    await page.waitForTimeout(300);
    await assertZeroStockControlsAndBounds(page, "GoalCheckinSheet RangeField + DateField");
    await page.screenshot({ path: path.join(OUT_DIR, "ip13_checkin_range_date.png") });
    await closeAllSheets(page);

    // -----------------------------------------------------------------------
    // 7. Custom CheckField in MenuItemFormSheet & MealPickerSheet
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Питание");
    await clickSegment(page, "Меню");
    await page.locator(".mt-list-body--clickable").first().click();
    await page.waitForSelector('.mt-sheet [role="checkbox"]');
    await assertZeroStockControlsAndBounds(page, "MenuItemFormSheet CheckField");
    await closeAllSheets(page);

    await clickSegment(page, "Рацион");
    await page.locator('button[aria-label="Добавить блюдо в рацион"]').click();
    await page.waitForSelector(".mt-sheet");
    await page.locator(".mt-sheet .mt-segmented-btn", { hasText: "Своё" }).click();
    await page.waitForSelector('#meal-eaten-at[data-picker="time"]');
    await assertZeroStockControlsAndBounds(page, "MealPickerSheet TimeField + CheckField");
    await closeAllSheets(page);

    // -----------------------------------------------------------------------
    // 8. Custom TimeField in WorkoutsTab & TaskFormSheet
    // -----------------------------------------------------------------------
    await clickBottomTab(page, "Здоровье");
    await clickSegment(page, "Тренировки");
    await page.locator("button", { hasText: "Сценарий и параметры" }).click();
    await page.waitForSelector('#workout-time-input[data-picker="time"]');
    await assertZeroStockControlsAndBounds(page, "WorkoutsTab TimeField");

    await clickBottomTab(page, "Сегодня");
    await page.locator("button", { hasText: "Задача" }).first().click();
    await page.waitForSelector('#today-task-time[data-picker="time"]');
    await assertZeroStockControlsAndBounds(page, "TaskFormSheet TimeField");
    await closeAllSheets(page);

    // Desktop viewport check for DateField popover
    await page.setViewportSize({ width: 1280, height: 900 });
    await clickBottomTab(page, "Цели");
    await page.locator('button[aria-label="Новая цель"]').click();
    await page.waitForSelector('#goal-target-date[data-picker="date"]');
    await page.locator("#goal-target-date").click();
    await page.waitForSelector(".mt-picker-popover");
    await assertZeroStockControlsAndBounds(page, "Desktop GoalFormSheet DateField", { expectPopover: true });
    await page.screenshot({ path: path.join(OUT_DIR, "desk_date_picker_goal.png") });
    await page.keyboard.press("Escape");
    await closeAllSheets(page);

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
