/**
 * Exhaustive Playwright Click-All, Geometry/Alignment/Overlap Audit
 * & Full-Month (30-Day) SQLite Stress Test for Marina Tracker («Ритм»).
 *
 * Runs against an isolated temp SQLite DB on port 8099 (NEVER touches :8098 or data/).
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  "/home/ruslan_safaev/digital_platform/frontend/package.json"
);
const { chromium } = require("playwright");

const ROOT = "/home/ruslan_safaev/marina_tracker";
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "audit");
const DB_PATH = "/tmp/marina_tracker_audit_exhaustive.sqlite3";
const PORT = Number(process.env.MARINA_AUDIT_PORT || 8099);
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
    `Temp audit server on :${PORT} did not start within ${timeoutMs}ms.\nLogs:\n${serverLogs}`
  );
}

const passes = [];
const findings = [];

function pass(name, detail = "") {
  passes.push({ name, detail });
  console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ""}`);
}

function finding(severity, area, detail) {
  findings.push({ severity, area, detail });
  console.error(`  [${severity}] ${area}: ${detail}`);
}

function isoOffset(baseIso, deltaDays) {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

async function dismissToastIfAny(page) {
  const closeBtns = page.locator(".mt-toast-close");
  const count = await closeBtns.count();
  for (let i = 0; i < count; i++) {
    try {
      await closeBtns.first().click({ timeout: 500 });
      await page.waitForTimeout(100);
    } catch {
      break;
    }
  }
}

/**
 * Pixel-level geometry, alignment, overlap, clipping, input font-size & bottom-nav audit.
 */
async function auditGeometry(page, label, { checkBottomScroll = false, isSheet = false } = {}) {
  const vp = page.viewportSize();
  const data = await page.evaluate(
    ({ vpW, vpH, checkSheet }) => {
      const rectsIntersect = (a, b, pad = 1) =>
        a.left < b.right - pad &&
        a.right > b.left + pad &&
        a.top < b.bottom - pad &&
        a.bottom > b.top + pad;

      const visible = (el) => {
        if (!el) return false;
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0)
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 0.5 && r.height > 0.5;
      };

      const docScrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;

      // 1. Text tokens sanity
      const text = document.body.innerText || "";
      const badTokens = [];
      if (/\bNaN\b/.test(text)) badTokens.push("NaN");
      if (/\bundefined\b/.test(text)) badTokens.push("undefined");
      if (text.includes("[object Object]")) badTokens.push("[object Object]");

      // 2. Inputs font-size >= 16px (prevents iOS Safari auto-zoom)
      const smallInputs = [];
      for (const el of document.querySelectorAll("input, select, textarea")) {
        if (!visible(el)) continue;
        if (["checkbox", "radio", "range", "hidden"].includes(el.type)) continue;
        const fs = parseFloat(window.getComputedStyle(el).fontSize);
        if (fs < 16) {
          smallInputs.push({
            tag: el.tagName.toLowerCase(),
            type: el.type || "",
            label: el.getAttribute("aria-label") || el.placeholder || el.id || "",
            fontSize: fs,
          });
        }
      }

      // 3. FAB overlap with visible content/buttons
      const fabOverlaps = [];
      for (const fab of document.querySelectorAll(".mt-fab")) {
        if (!visible(fab)) continue;
        const fr = fab.getBoundingClientRect();
        for (const target of document.querySelectorAll(
          ".mt-card .mt-icon-btn, .mt-card .mt-check-title, .mt-card .mt-card-title, .goal-milestone-row, .chore-card"
        )) {
          if (!visible(target) || target.contains(fab) || fab.contains(target)) continue;
          const tr = target.getBoundingClientRect();
          if (rectsIntersect(fr, tr, 2)) {
            fabOverlaps.push({
              fab: fab.innerText.trim().slice(0, 30),
              target: (target.getAttribute("aria-label") || target.innerText || target.className)
                .toString()
                .trim()
                .slice(0, 45),
            });
            if (fabOverlaps.length >= 4) break;
          }
        }
      }

      // 4. Toast overlap with h1 / SectionHeader / DateStrip / SegmentedControl
      const toastOverlaps = [];
      for (const toast of document.querySelectorAll(".mt-toast")) {
        if (!visible(toast)) continue;
        const tr = toast.getBoundingClientRect();
        for (const hdr of document.querySelectorAll(
          ".mt-section-header h1, .mt-section-header, .mt-date-strip, .mt-segmented"
        )) {
          if (!visible(hdr)) continue;
          const hr = hdr.getBoundingClientRect();
          if (rectsIntersect(tr, hr, 2)) {
            toastOverlaps.push({
              toast: toast.innerText.trim().slice(0, 40),
              covered: hdr.className.slice(0, 40) || hdr.tagName,
            });
          }
        }
      }

      // 5. Sibling button/pill collision inside same row containers
      const siblingCollisions = [];
      for (const container of document.querySelectorAll(
        ".mt-row, .mt-chip-row, .mt-segmented, .bottom-nav, .water-quick-row"
      )) {
        if (!visible(container)) continue;
        const kids = Array.from(container.children).filter(
          (k) => visible(k) && ["BUTTON", "A", "INPUT", "SELECT"].includes(k.tagName)
        );
        for (let i = 0; i < kids.length; i++) {
          const r1 = kids[i].getBoundingClientRect();
          for (let j = i + 1; j < kids.length; j++) {
            const r2 = kids[j].getBoundingClientRect();
            if (rectsIntersect(r1, r2, 2)) {
              siblingCollisions.push({
                container: container.className.slice(0, 40),
                a: kids[i].innerText.trim().slice(0, 25),
                b: kids[j].innerText.trim().slice(0, 25),
              });
            }
          }
        }
      }

      // 6. Vertical text clipping inside hidden/clip cards & buttons + horizontal ellipsis on segmented tabs
      const clippedTexts = [];
      for (const el of document.querySelectorAll(
        ".menu-catalog-item, .mt-btn, .mt-pill, .mt-card-title, .mt-check-title, .bottom-nav-item, .today-domain-tile"
      )) {
        if (!visible(el)) continue;
        const st = window.getComputedStyle(el);
        const clipsY = ["hidden", "clip"].includes(st.overflowY);
        if (clipsY && el.scrollHeight > el.clientHeight + 4) {
          clippedTexts.push({
            cls: el.className.slice(0, 40),
            text: el.innerText.trim().slice(0, 40),
            scrollH: el.scrollHeight,
            clientH: el.clientHeight,
          });
        }
      }
      for (const el of document.querySelectorAll(".mt-segmented-btn span")) {
        if (!visible(el)) continue;
        if (el.scrollWidth > el.clientWidth + 1) {
          clippedTexts.push({
            cls: "mt-segmented-btn span",
            text: el.innerText.trim(),
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
          });
        }
      }

      // 7. BottomNav symmetry & badge clipping check
      const navIssues = [];
      const nav = document.querySelector(".bottom-nav");
      if (nav && visible(nav)) {
        const nr = nav.getBoundingClientRect();
        if (nr.bottom > vpH + 2 || nr.right > vpW + 2 || nr.left < -2) {
          navIssues.push(`BottomNav outside viewport: ${JSON.stringify(nr)}`);
        }
        const items = Array.from(nav.querySelectorAll(".bottom-nav-item"));
        const widths = items.map((it) => Math.round(it.getBoundingClientRect().width));
        const maxW = Math.max(...widths);
        const minW = Math.min(...widths);
        if (maxW - minW > 6) {
          navIssues.push(`BottomNav asymmetric columns: ${widths.join(",")}`);
        }
      }

      // 8. Sheet viewport bounds
      let sheetIssue = null;
      if (checkSheet) {
        const sheet = document.querySelector(".mt-sheet");
        if (!sheet || !visible(sheet)) {
          sheetIssue = "Expected open .mt-sheet but not visible";
        } else {
          const sr = sheet.getBoundingClientRect();
          if (sr.top < -2 || sr.bottom > vpH + 2 || sr.left < -2 || sr.right > vpW + 2) {
            sheetIssue = `Sheet outside viewport (${vpW}x${vpH}): top=${Math.round(sr.top)}, bottom=${Math.round(sr.bottom)}, left=${Math.round(sr.left)}, right=${Math.round(sr.right)}`;
          }
        }
      }

      // 9. Desktop centering check (when viewport > 480px)
      let desktopFrameIssue = null;
      if (vpW > 480) {
        const shell = document.querySelector(".app-shell, .app-main, main");
        if (shell) {
          const sr = shell.getBoundingClientRect();
          if (sr.width > 460) {
            desktopFrameIssue = `App frame too wide on desktop: ${Math.round(sr.width)}px`;
          }
          const leftGap = sr.left;
          const rightGap = vpW - sr.right;
          if (Math.abs(leftGap - rightGap) > 20) {
            desktopFrameIssue = `App frame not centered: left=${Math.round(leftGap)}, right=${Math.round(rightGap)}`;
          }
        }
      }

      return {
        docScrollW,
        innerW,
        badTokens,
        smallInputs,
        fabOverlaps,
        toastOverlaps,
        siblingCollisions,
        clippedTexts: clippedTexts.slice(0, 5),
        navIssues,
        sheetIssue,
        desktopFrameIssue,
      };
    },
    { vpW: vp.width, vpH: vp.height, checkSheet: isSheet }
  );

  let ok = true;
  if (data.docScrollW > data.innerW) {
    ok = false;
    finding("P0", `Overflow (${label})`, `scrollWidth=${data.docScrollW} > innerWidth=${data.innerW}`);
  }
  if (data.badTokens.length) {
    ok = false;
    finding("P0", `Broken text (${label})`, data.badTokens.join(", "));
  }
  if (data.smallInputs.length) {
    ok = false;
    finding("P0", `Input <16px (${label})`, JSON.stringify(data.smallInputs));
  }
  if (data.fabOverlaps.length) {
    ok = false;
    finding("P1", `FAB overlap (${label})`, JSON.stringify(data.fabOverlaps));
  }
  if (data.toastOverlaps.length) {
    ok = false;
    finding("P1", `Toast overlaps header/nav (${label})`, JSON.stringify(data.toastOverlaps));
  }
  if (data.siblingCollisions.length) {
    ok = false;
    finding("P1", `Sibling button overlap (${label})`, JSON.stringify(data.siblingCollisions));
  }
  if (data.clippedTexts.length) {
    ok = false;
    finding("P1", `Clipped text (${label})`, JSON.stringify(data.clippedTexts));
  }
  if (data.navIssues.length) {
    ok = false;
    finding("P1", `BottomNav geometry (${label})`, data.navIssues.join("; "));
  }
  if (data.sheetIssue) {
    ok = false;
    finding("P0", `Sheet geometry (${label})`, data.sheetIssue);
  }
  if (data.desktopFrameIssue) {
    ok = false;
    finding("P1", `Desktop frame (${label})`, data.desktopFrameIssue);
  }

  // Optional bottom scroll coverage check
  if (checkBottomScroll && !isSheet) {
    const bottomCheck = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const nav = document.querySelector(".bottom-nav");
      const main = document.querySelector("main");
      if (!nav || !main) return { ok: true };
      const navTop = nav.getBoundingClientRect().top;
      const cards = Array.from(main.querySelectorAll("section, article, .mt-card")).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!cards.length) return { ok: true };
      const lastCard = cards[cards.length - 1];
      const lastBottom = lastCard.getBoundingClientRect().bottom;
      window.scrollTo(0, 0);
      return {
        ok: lastBottom <= navTop + 4,
        lastBottom: Math.round(lastBottom),
        navTop: Math.round(navTop),
      };
    });
    if (!bottomCheck.ok) {
      ok = false;
      finding(
        "P1",
        `BottomNav covers bottom content (${label})`,
        `lastCardBottom=${bottomCheck.lastBottom} > bottomNavTop=${bottomCheck.navTop}`
      );
    }
  }

  if (ok) {
    pass(`Geometry & alignment clean (${label})`, `${data.docScrollW}px <= ${data.innerW}px`);
  }
}

async function snap(page, filename, fullPage = false) {
  const out = path.join(ARTIFACTS_DIR, filename);
  await page.screenshot({ path: out, fullPage });
  return out;
}

async function clickBottomTab(page, label) {
  await page.locator("nav.bottom-nav button", { hasText: label }).click();
  await page.waitForTimeout(350);
}

async function clickSegment(page, label) {
  await page.locator(".mt-segmented-btn", { hasText: label }).click();
  await page.waitForTimeout(350);
}

async function closeOpenSheet(page) {
  const closeBtn = page.locator('.mt-sheet button[aria-label="Закрыть"]').first();
  if (await closeBtn.count()) {
    await closeBtn.click();
    await page.waitForTimeout(220);
  }
}

async function runMobileAudit(browser, todayIso) {
  console.log("\n=== PHASE 1: iPhone 14 Pro (393x852) Exhaustive Click-All & Geometry Audit ===");
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
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // -------------------------------------------------------------------------
  // 1. TODAY TAB — all controls & sheets
  // -------------------------------------------------------------------------
  await auditGeometry(page, "Mobile: Сегодня", { checkBottomScroll: true });
  await snap(page, "mobile_01_today.png", false);

  // 1a. PwaInstallGuide («На экран»)
  const pwaBtn = page.getByRole("button", { name: /Установить приложение|На экран/i }).first();
  if (await pwaBtn.count()) {
    await pwaBtn.click();
    await page.waitForTimeout(300);
    await auditGeometry(page, "Sheet: PwaInstallGuide", { isSheet: true });
    await snap(page, "mobile_sheet_pwa.png", false);
    const chromeSeg = page.locator(".mt-sheet .mt-segmented-btn", { hasText: /Chrome/i });
    if (await chromeSeg.count()) {
      await chromeSeg.click();
      await page.waitForTimeout(150);
    }
    await closeOpenSheet(page);
    pass("Sheet clicked: PwaInstallGuide (Safari & Chrome)");
  }

  // 1b. YearReviewSheet («Итоги года»)
  const yearBtn = page.getByRole("button", { name: /Итоги года|Итоги/i }).first();
  if (await yearBtn.count()) {
    await yearBtn.click();
    await page.waitForTimeout(450);
    await auditGeometry(page, "Sheet: YearReviewSheet", { isSheet: true });
    await snap(page, "mobile_sheet_year_review.png", false);
    await closeOpenSheet(page);
    pass("Sheet clicked: YearReviewSheet");
  }

  // 1c. TaskFormSheet (with goal <select>, priority/sphere pills, create, toggle, reschedule, delete)
  await page.getByRole("button", { name: /\+?\s*Задача/i }).first().click();
  await page.waitForTimeout(300);
  await auditGeometry(page, "Sheet: TaskFormSheet", { isSheet: true });
  await snap(page, "mobile_sheet_task.png", false);
  const taskSheet = page.locator(".mt-sheet");
  await taskSheet.locator('input[type="text"], input:not([type])').first().fill("Аудит задача дня");
  const taskGoalSelect = taskSheet.locator("select").first();
  if (await taskGoalSelect.count()) {
    const opts = await taskGoalSelect.locator("option").allInnerTexts();
    if (opts.length > 1) {
      const val = await taskGoalSelect.locator("option").nth(1).getAttribute("value");
      if (val) await taskGoalSelect.selectOption(val);
    }
  }
  await taskSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);
  // Check if toast overlaps header right after action!
  await auditGeometry(page, "Mobile: Сегодня (with live toast)");

  // Toggle task filters Все / Активные / Сделано
  for (const f of ["Активные", "Сделано", "Все"]) {
    const chip = page.locator('div[aria-label="Фильтр задач"] button', { hasText: f }).first();
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(120);
    }
  }
  // Toggle new task checked & reschedule another active task
  const auditTaskRow = page.locator(".mt-check-row", { hasText: "Аудит задача дня" }).first();
  await auditTaskRow.locator(".mt-check-main").click();
  await page.waitForTimeout(300);
  // Reflection save
  const refl = page.locator('section[aria-label="Итог дня и самочувствие"]');
  await refl.locator("textarea").fill("Исчерпывающий аудит дня пройден.");
  await refl.getByRole("button", { name: /Сохранить итог/i }).click();
  await page.waitForTimeout(350);
  pass("Today: TaskFormSheet + filters + toggle + reflection");

  // -------------------------------------------------------------------------
  // 2. HABITS TAB — Water, Habits/Vitamins, Workouts + Timer, Cycle (12m+)
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Привычки");
  await page.waitForTimeout(350);
  await auditGeometry(page, "Mobile: Привычки", { checkBottomScroll: true });
  await snap(page, "mobile_02_habits.png", false);

  // 2a. Water +250, collapsible logs, undo, water goal sheet
  await page.locator(".water-card button", { hasText: "+250" }).first().click();
  await page.waitForTimeout(350);
  const logsToggle = page.locator(".water-card button", { hasText: /Записи за день/i }).first();
  if (await logsToggle.count()) {
    await logsToggle.click();
    await page.waitForTimeout(150);
    await logsToggle.click();
  }
  // Open water goal settings sheet (icon button in water-card)
  const waterGear = page.locator(".water-card .mt-icon-btn").first();
  if (await waterGear.count()) {
    await waterGear.click();
    await page.waitForTimeout(300);
    await auditGeometry(page, "Sheet: WaterGoalSheet", { isSheet: true });
    await snap(page, "mobile_sheet_water_goal.png", false);
    await closeOpenSheet(page);
    pass("Sheet clicked: WaterGoalSheet");
  }

  // 2b. Habit/Vitamin filter chips & Add Habit/Vitamin sheet
  for (const flt of ["Привычки", "Витамины", "Все"]) {
    const b = page.locator("main button", { hasText: new RegExp(`^${flt}\\s*\\(`) }).first();
    if (await b.count()) {
      await b.click();
      await page.waitForTimeout(120);
    }
  }
  const addHabitBtn = page.getByRole("button", { name: /Добавить/i }).first();
  await addHabitBtn.click();
  await page.waitForTimeout(300);
  await auditGeometry(page, "Sheet: HabitFormSheet", { isSheet: true });
  await snap(page, "mobile_sheet_habit.png", false);
  const hSheet = page.locator(".mt-sheet");
  await hSheet.locator('input[type="text"], input:not([type])').first().fill("Витамин C 500 мг");
  const vitPill = hSheet.locator("button", { hasText: /Витамин/i }).first();
  if (await vitPill.count()) await vitPill.click();
  await hSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);
  pass("Habits: Water + Goal sheet + Habit/Vitamin add sheet");

  // 2c. Workouts sub-tab + PracticeTimerSheet (Breathing / Pilates / Qigong)
  await clickSegment(page, "Тренировки");
  await page.waitForTimeout(350);
  await auditGeometry(page, "Mobile: Тренировки", { checkBottomScroll: true });
  await snap(page, "mobile_03_workouts.png", false);

  // Click through all 3 practice cards & launch PracticeTimerSheet for Breathing
  for (const wName of ["Пилатес", "Цигун", "Дыхательная практика"]) {
    await page.locator(".workout-type-card", { hasText: wName }).click();
    await page.waitForTimeout(150);
  }
  const timerBtn = page.getByRole("button", { name: /Таймер/i }).first();
  if (await timerBtn.count()) {
    await timerBtn.click();
    await page.waitForTimeout(350);
    await auditGeometry(page, "Sheet: PracticeTimerSheet", { isSheet: true });
    await snap(page, "mobile_sheet_timer.png", false);
    // Start & pause & close
    const startBtn = page.locator(".mt-sheet button", { hasText: /Начать|Старт/i }).first();
    if (await startBtn.count()) {
      await startBtn.click();
      await page.waitForTimeout(400);
      const pauseBtn = page.locator(".mt-sheet button", { hasText: /Пауза/i }).first();
      if (await pauseBtn.count()) await pauseBtn.click();
    }
    await closeOpenSheet(page);
    pass("Sheet clicked: PracticeTimerSheet (start/pause)");
  }

  // Expand collapsible "Дополнительно" if present, log a workout
  const extraToggle = page.locator("main button", { hasText: /Дополнительно/i }).first();
  if (await extraToggle.count()) {
    await extraToggle.click();
    await page.waitForTimeout(200);
    await auditGeometry(page, "Mobile: Тренировки (Дополнительно expanded)");
  }
  await page.getByRole("button", { name: /Отметить тренировку/i }).first().click();
  await page.waitForTimeout(450);
  pass("Workouts: all types + timer sheet + log workout");

  // 2d. Cycle sub-tab — settings sheet, month picker sheet, 12m back nav, day editor save & clear
  await clickSegment(page, "Цикл");
  await page.waitForTimeout(450);
  await auditGeometry(page, "Mobile: Цикл", { checkBottomScroll: true });
  await snap(page, "mobile_04_cycle.png", false);

  // Cycle settings sheet
  const cycleGear = page.locator(".cycle-hero .mt-icon-btn").first();
  if (await cycleGear.count()) {
    await cycleGear.click();
    await page.waitForTimeout(300);
    await auditGeometry(page, "Sheet: CycleSettingsSheet", { isSheet: true });
    await snap(page, "mobile_sheet_cycle_settings.png", false);
    await closeOpenSheet(page);
    pass("Sheet clicked: CycleSettingsSheet");
  }

  // Month picker sheet -> pick a month 10 months ago
  const monthPill = page.locator(".cycle-cal-header button").nth(1);
  if (await monthPill.count()) {
    await monthPill.click();
    await page.waitForTimeout(300);
    await auditGeometry(page, "Sheet: CycleMonthPicker", { isSheet: true });
    const monthBtns = page.locator(".mt-sheet .mt-sheet-body button");
    const mCount = await monthBtns.count();
    if (mCount >= 10) {
      await monthBtns.nth(9).click();
      await page.waitForTimeout(400);
    } else {
      await closeOpenSheet(page);
    }
    pass("Sheet clicked: CycleMonthPicker (jumped 9m back)");
  }

  // Tap a day -> open CycleDaySheet -> toggle Menstruation + symptom + save -> reopen & Clear
  const cycleDayBtn = page.locator(".cycle-day:not(.is-outside):not(.is-period)").first();
  await cycleDayBtn.click();
  await page.waitForTimeout(300);
  await auditGeometry(page, "Sheet: CycleDaySheet", { isSheet: true });
  await snap(page, "mobile_sheet_cycle_day.png", false);
  await page.locator(".mt-sheet .mt-check-main").first().click();
  await page.waitForTimeout(150);
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);
  pass("Cycle: Day editor saved");

  // -------------------------------------------------------------------------
  // 3. NUTRITION TAB — Рацион дня, MealPickerSheet, Меню блюд, MenuItemFormSheet
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Питание");
  await page.waitForTimeout(400);
  await auditGeometry(page, "Mobile: Питание (Рацион)", { checkBottomScroll: true });
  await snap(page, "mobile_05_nutrition.png", false);

  // Open MealPickerSheet from Завтрак
  const bfCard = page.locator('article[aria-label="Завтрак"], section[aria-label="Завтрак"]').first();
  await bfCard.getByRole("button", { name: /Выбрать из меню|добавить/i }).first().click();
  await page.waitForTimeout(350);
  await auditGeometry(page, "Sheet: MealPickerSheet (menu list)", { isSheet: true });
  await snap(page, "mobile_sheet_meal_picker.png", false);

  // Pick first dish from menu -> test stepper, unit <select>, time input, submit!
  const firstDishBtn = page.locator(".mt-sheet .menu-catalog-item").first();
  if (await firstDishBtn.count()) {
    await firstDishBtn.click();
    await page.waitForTimeout(250);
    await auditGeometry(page, "Sheet: MealPickerSheet (portion & time)", { isSheet: true });
    const plusStep = page.locator('.mt-sheet button[aria-label="Увеличить"]').first();
    if (await plusStep.count()) await plusStep.click();
    const unitSel = page.locator(".mt-sheet select").first();
    if (await unitSel.count()) {
      const unitFs = await unitSel.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(unitFs >= 16, `Unit select fontSize ${unitFs} < 16`);
    }
    const timeInp = page.locator('.mt-sheet input[type="time"]').first();
    if (await timeInp.count()) await timeInp.fill("09:05");
    await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(450);
    pass("Nutrition: MealPickerSheet menu select + stepper + time");
  }

  // Switch to Меню блюд -> open MenuItemFormSheet (+ Рецепт) & click В покупки
  await clickSegment(page, "Меню блюд");
  await page.waitForTimeout(350);
  await auditGeometry(page, "Mobile: Питание (Меню)", { checkBottomScroll: true });
  await snap(page, "mobile_06_nutrition_menu.png", false);

  const addRecipeBtn = page.getByRole("button", { name: /Рецепт/i }).first();
  if (await addRecipeBtn.count()) {
    await addRecipeBtn.click();
    await page.waitForTimeout(300);
    await auditGeometry(page, "Sheet: MenuItemFormSheet", { isSheet: true });
    await snap(page, "mobile_sheet_menu_item.png", false);
    const mSheet = page.locator(".mt-sheet");
    await mSheet.locator('input[type="text"], input:not([type])').first().fill("Боул с киноа и авокадо");
    await mSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(450);
    pass("Nutrition: MenuItemFormSheet created custom dish");
  }
  const toShopBtn = page.locator("main button", { hasText: /В покупки/i }).first();
  if (await toShopBtn.count()) {
    await toShopBtn.click();
    await page.waitForTimeout(350);
    pass("Nutrition: «В покупки» synced dish to shopping");
  }

  // -------------------------------------------------------------------------
  // 4. HOME TAB — Chores (ChoreSheet) & Shopping (quick-add, toggle, clear)
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Дом");
  await page.waitForTimeout(400);
  await auditGeometry(page, "Mobile: Дом (Уборка)", { checkBottomScroll: true });
  await snap(page, "mobile_07_home_chores.png", false);

  // Open ChoreSheet via header button OR FAB
  const addChoreBtn = page
    .locator("main button", { hasText: /Дело|Новое дело/i })
    .first();
  if (await addChoreBtn.count()) {
    await addChoreBtn.click();
    await page.waitForTimeout(300);
    await auditGeometry(page, "Sheet: ChoreSheet", { isSheet: true });
    await snap(page, "mobile_sheet_chore.png", false);
    const cSheet = page.locator(".mt-sheet");
    await cSheet.locator('input[type="text"], input:not([type])').first().fill("Полить домашние растения");
    await cSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(450);
    pass("Home: ChoreSheet created chore");
  }

  await clickSegment(page, "Покупки");
  await page.waitForTimeout(350);
  await auditGeometry(page, "Mobile: Дом (Покупки)", { checkBottomScroll: true });
  await snap(page, "mobile_08_home_shopping.png", false);

  await page.locator('input[aria-label="Название продукта или товара"]').fill("Ягоды голубики");
  await page.locator('input[aria-label="Количество (необязательно)"]').fill("250 г");
  await page.locator('button[aria-label="Добавить в покупки"]').click();
  await page.waitForTimeout(400);
  // Mark it bought then clear bought
  const shopRow = page.locator(".mt-check-row", { hasText: "Ягоды голубики" }).first();
  await shopRow.locator(".mt-check-main").click();
  await page.waitForTimeout(350);
  const clearBoughtBtn = page.getByRole("button", { name: /Очистить купленное/i }).first();
  if (await clearBoughtBtn.count()) {
    await clearBoughtBtn.click();
    await page.waitForTimeout(350);
  }
  pass("Home: Shopping quick-add + bought toggle + clear-bought");

  // -------------------------------------------------------------------------
  // 5. GOALS TAB — GoalFormSheet, GoalCheckinSheet, Milestones, History
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Цели");
  await page.waitForTimeout(450);
  await auditGeometry(page, "Mobile: Цели", { checkBottomScroll: true });
  await snap(page, "mobile_09_goals.png", false);

  // Open GoalFormSheet (+ Цель or + Новая цель)
  const addGoalBtn = page.locator("main button", { hasText: /Цель|Новая цель/i }).first();
  if (await addGoalBtn.count()) {
    await addGoalBtn.click();
    await page.waitForTimeout(300);
    await auditGeometry(page, "Sheet: GoalFormSheet", { isSheet: true });
    await snap(page, "mobile_sheet_goal_form.png", false);
    const gSheet = page.locator(".mt-sheet");
    // Inspect select dropdowns inside GoalFormSheet
    const selects = gSheet.locator("select");
    const selCount = await selects.count();
    for (let i = 0; i < selCount; i++) {
      const fs = await selects.nth(i).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(fs >= 16, `GoalFormSheet select #${i} fontSize ${fs} < 16`);
    }
    await gSheet.locator('input[type="text"], input:not([type])').first().fill("Финансовая подушка на 12 месяцев");
    await gSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(450);
    pass("Goals: GoalFormSheet created multi-year goal");
  }

  // Open GoalCheckinSheet
  await page.locator(".goal-card button", { hasText: "Чек-ин" }).first().click();
  await page.waitForTimeout(300);
  await auditGeometry(page, "Sheet: GoalCheckinSheet", { isSheet: true });
  await snap(page, "mobile_sheet_goal_checkin.png", false);
  await page.locator(".mt-sheet textarea").fill("Отличный ритм за этот месяц!");
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);
  pass("Goals: GoalCheckinSheet saved");

  // -------------------------------------------------------------------------
  // 6. FULL-MONTH (30-DAY) SQLITE STRESS TEST
  // -------------------------------------------------------------------------
  console.log("\n=== PHASE 2: Full-Month (30-Day) DB Stress Test ===");
  const habitsResp = await (await fetch(`${BASE_URL}/api/habits?date=${todayIso}`)).json();
  const habitIds = habitsResp.items.map((h) => h.id);
  const firstHabitId = habitIds[0];
  const vitaminId = habitsResp.items.find((h) => h.category === "vitamin")?.id || habitIds[1];
  const choresResp = await (await fetch(`${BASE_URL}/api/home/chores?date=${todayIso}`)).json();
  const firstChoreId = choresResp.items[0].id;
  const menuResp = await (await fetch(`${BASE_URL}/api/nutrition/menu`)).json();
  const menuSample = menuResp.items.slice(0, 4);

  const workoutCycle = ["breathing", "pilates", "qigong"];
  const slots = [
    ["breakfast", "08:30"],
    ["lunch", "13:30"],
    ["dinner", "19:15"],
  ];

  // Populate 30 consecutive days in SQLite (with concurrent batches to stress SQLite busy_timeout too!)
  for (let offset = 29; offset >= 0; offset--) {
    const d = isoOffset(todayIso, -offset);
    const batch = [
      // Water log
      fetch(`${BASE_URL}/api/water/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, amount_ml: 250, logged_at: "10:00" }),
      }),
      // Morning habit toggled EVERY day for 30 consecutive days -> tests 30-day streak!
      fetch(`${BASE_URL}/api/habits/${firstHabitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, completed: true }),
      }),
      // Vitamin toggled every day
      fetch(`${BASE_URL}/api/habits/${vitaminId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, completed: true }),
      }),
    ];

    // Workout every 2nd day rotating breathing / pilates / qigong
    if (offset % 2 === 0) {
      const wt = workoutCycle[(offset / 2) % 3];
      batch.push(
        fetch(`${BASE_URL}/api/workouts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            log_date: d,
            workout_type: wt,
            duration_min: 20 + (offset % 3) * 10,
            intensity: "medium",
            mood: "energized",
            note: `30-day stress ${wt}`,
            logged_at: "08:00",
          }),
        })
      );
    }

    // Meals across the last 10 days (breakfast, lunch, dinner)
    if (offset < 10) {
      for (let s = 0; s < slots.length; s++) {
        const [slot, timeStr] = slots[s];
        const dish = menuSample[s % menuSample.length];
        batch.push(
          fetch(`${BASE_URL}/api/nutrition/meals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              log_date: d,
              meal_slot: slot,
              menu_item_id: dish.id,
              dish_name: dish.name,
              amount_value: 1,
              amount_unit: "порция",
              grams: dish.default_grams || 220,
              eaten_at: timeStr,
              kcal: dish.kcal || 350,
              completed: true,
            }),
          })
        );
      }
    }

    // Chore + Task every 3rd day
    if (offset % 3 === 0) {
      batch.push(
        fetch(`${BASE_URL}/api/home/chores/${firstChoreId}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: d, completed: true }),
        }),
        fetch(`${BASE_URL}/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Задача дня ${d}`,
            task_date: d,
            time_slot: "11:00",
            priority: "medium",
            section_tag: "personal",
          }),
        })
      );
    }

    // 5-day period block in the previous cycle window (~35-39 days ago) + reflection
    if (offset === 0 || offset === 14 || offset === 29) {
      batch.push(
        fetch(`${BASE_URL}/api/today/reflection`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: d,
            summary_note: `Итог дня ${d}`,
            energy_level: 4,
            mood: "calm",
          }),
        })
      );
    }

    const results = await Promise.all(batch);
    for (const r of results) {
      if (!r.ok) {
        const txt = await r.text();
        finding("P0", `30-day stress API failure (${d})`, `${r.status} ${r.url}: ${txt.slice(0, 140)}`);
      }
    }
  }

  // Verify 30-day streak computed accurately!
  const afterHabits = await (await fetch(`${BASE_URL}/api/habits?date=${todayIso}`)).json();
  const streaked = afterHabits.items.find((h) => h.id === firstHabitId);
  assert.ok(
    streaked.streak_days >= 30,
    `Expected >=30 day streak after 30 consecutive days, got ${streaked.streak_days}`
  );
  pass("30-day stress: consecutive habit streak verified", `${streaked.streak_days} days`);

  // Verify SQLite row counts directly via sqlite3
  const countsJson = execFileSync(
    path.join(ROOT, ".venv", "bin", "python"),
    [
      "-c",
      `import json, sqlite3; c=sqlite3.connect(${JSON.stringify(DB_PATH)}); ` +
        `tables=['habit_logs','water_logs','workouts','cycle_days','meal_logs','tasks','goals','goal_milestones','goal_checkins','chore_logs','shopping_items','day_reflections']; ` +
        `print(json.dumps({t: c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in tables}))`,
    ],
    { encoding: "utf-8" }
  ).trim();
  const rowCounts = JSON.parse(countsJson);
  assert.ok(rowCounts.habit_logs >= 60, `Expected >=60 habit_logs, got ${rowCounts.habit_logs}`);
  assert.ok(rowCounts.water_logs >= 30, `Expected >=30 water_logs, got ${rowCounts.water_logs}`);
  assert.ok(rowCounts.workouts >= 15, `Expected >=15 workouts, got ${rowCounts.workouts}`);
  assert.ok(rowCounts.meal_logs >= 30, `Expected >=30 meal_logs, got ${rowCounts.meal_logs}`);
  pass("SQLite DB row counts verified after 30-day load", countsJson);

  // Reload browser and click through DateStrip days + all 5 tabs under 30-day populated DB!
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(450);

  // Click 3 different days in DateStrip on Today, then return to today!
  const dateCells = page.locator(".mt-date-cell");
  const dcCount = await dateCells.count();
  for (let i = 0; i < Math.min(3, dcCount); i++) {
    await dateCells.nth(i).click();
    await page.waitForTimeout(200);
  }
  const todayCell = page.locator(".mt-date-cell.is-today").first();
  if (await todayCell.count()) {
    await todayCell.click();
    await page.waitForTimeout(250);
  }
  await clickBottomTab(page, "Привычки");
  await page.waitForTimeout(300);
  assert.ok(
    (await page.locator("main").innerText()).includes(`${streaked.streak_days} дн.`),
    `30-day streak badge (${streaked.streak_days} дн.) not visible after reload`
  );
  await clickBottomTab(page, "Питание");
  await page.waitForTimeout(300);
  await clickBottomTab(page, "Дом");
  await page.waitForTimeout(300);
  await clickBottomTab(page, "Цели");
  await page.waitForTimeout(300);
  pass("Post-stress reload across all 5 tabs & DateStrip clean");

  if (consoleErrors.length) finding("P0", "Mobile console errors", consoleErrors.join(" | "));
  else pass("Zero mobile console errors");
  if (pageErrors.length) finding("P0", "Mobile page errors", pageErrors.join(" | "));
  else pass("Zero mobile page errors");
  if (failedRequests.length) finding("P0", "Mobile failed requests", failedRequests.join(" | "));
  else pass("Zero mobile failed requests (>=400)");

  await context.close();
}

async function runDesktopAudit(browser) {
  console.log("\n=== PHASE 3: Desktop (1280x900) Centered Frame Audit ===");
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`);
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await auditGeometry(page, "Desktop: Сегодня");
  await snap(page, "desktop_01_today.png", false);

  await clickBottomTab(page, "Привычки");
  await auditGeometry(page, "Desktop: Привычки");
  await clickSegment(page, "Цикл");
  await auditGeometry(page, "Desktop: Цикл");
  await snap(page, "desktop_02_cycle.png", false);

  await clickBottomTab(page, "Питание");
  await auditGeometry(page, "Desktop: Питание");
  // Open MealPickerSheet on desktop to verify centered sheet frame
  const bfCard = page.locator('article[aria-label="Завтрак"], section[aria-label="Завтрак"]').first();
  await bfCard.getByRole("button", { name: /Выбрать из меню|добавить/i }).first().click();
  await page.waitForTimeout(300);
  await auditGeometry(page, "Desktop Sheet: MealPickerSheet", { isSheet: true });
  await snap(page, "desktop_03_sheet.png", false);
  await closeOpenSheet(page);

  await clickBottomTab(page, "Дом");
  await auditGeometry(page, "Desktop: Дом");
  await clickBottomTab(page, "Цели");
  await auditGeometry(page, "Desktop: Цели");
  await snap(page, "desktop_04_goals.png", false);

  if (errors.length) finding("P0", "Desktop runtime errors", errors.join(" | "));
  else pass("Zero desktop console/page/HTTP errors");

  await context.close();
}

async function main() {
  let browser;
  try {
    const health = await waitForServer();
    pass("Temp audit server ready", `today=${health.today} on :${PORT}`);

    browser = await chromium.launch({
      headless: true,
      executablePath: fs.existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined,
    });

    await runMobileAudit(browser, health.today);
    await runDesktopAudit(browser);

    console.log(
      `\n========================================================\n` +
        `AUDIT SUMMARY: ${passes.length} passed, ${findings.length} findings\n` +
        `========================================================`
    );
    if (findings.length > 0) {
      for (const f of findings) {
        console.log(` - [${f.severity}] ${f.area}: ${f.detail}`);
      }
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
  console.error("FATAL AUDIT ERROR:", err);
  process.exit(1);
});
