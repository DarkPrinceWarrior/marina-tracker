/**
 * Phase 3 Exhaustive Verification Suite (`tests/audit_v3.mjs`)
 * Marina Tracker («Ритм») — 2026 Carbon & Cobalt Minimalist Redesign
 *
 * Tests 3 viewports:
 *   - iPhone 13 (390x844) — full click-all, 16 sheets, 30-day DB stress, reload persistence
 *   - iPhone 14 Pro (393x852) — full screen + sheet + geometry + alignment sweep
 *   - Desktop (1280x900) — centered phone canvas + bottom nav + centered sheet
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
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "audit_v3");
const DB_PATH = "/tmp/marina_tracker_audit_v3.sqlite3";
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

/**
 * Exhaustive pixel-level audit:
 * 1. Zero leaked English UI tokens (Q1-Q4, A1/B1/B2/CILS, PWA, Todo, Failed to fetch, etc.)
 * 2. Razor-straight vertical alignment (±1.5px) for .mt-list-title & .mt-list-meta in every .mt-group-list
 * 3. Carbon & Cobalt palette verification (#F7F8FA canvas)
 * 4. Zero horizontal overflow, zero overlaps, zero clipping, >=16px inputs, sheet bounds, desktop centering
 */
async function auditScreen(
  page,
  label,
  { isSheet = false, allowBrandNames = false, checkBottomScroll = false } = {}
) {
  const vp = page.viewportSize();
  const data = await page.evaluate(
    ({ vpW, vpH, checkSheet, allowBrands }) => {
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

      // 0. Check 2026 Carbon & Cobalt theme token
      const canvasToken = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim()
        .toUpperCase();

      // 1. Check leaked English UI strings & broken JS tokens
      const rawText = document.body.innerText || "";
      const badTokens = [];
      if (/\bNaN\b/.test(rawText)) badTokens.push("NaN");
      if (/\bundefined\b/.test(rawText)) badTokens.push("undefined");
      if (rawText.includes("[object Object]")) badTokens.push("[object Object]");

      // 1b. Assert ZERO native <select> elements exist anywhere in the DOM!
      const nativeSelectCount = document.querySelectorAll("select").length;

      // Collect visible text + open listbox option texts
      const optionTexts = [];
      for (const opt of document.querySelectorAll('.mt-select-menu [role="option"]')) {
        if (visible(opt)) optionTexts.push(opt.textContent || "");
      }
      const combinedText = `${rawText}\n${optionTexts.join("\n")}`;

      const forbiddenEnglishRe =
        /\b(?:Q[1-4]|A[12]|B[12]|C[12]|CILS|PWA|Todo|Failed to fetch|Not Found|Field required|Loading|Cancel|Save|Delete|Edit|Today|Habits|Goals|Home|Nutrition)\b/g;
      const englishLeaks = Array.from(new Set(combinedText.match(forbiddenEnglishRe) || []));

      if (!allowBrands) {
        const brandRe = /\b(?:Safari|Chrome|iPhone)\b/g;
        const brandLeaks = Array.from(new Set(rawText.match(brandRe) || []));
        for (const b of brandLeaks) englishLeaks.push(b);
      }

      // 2. Razor-straight vertical alignment inside EVERY .mt-group-list (±1.5px)
      const alignmentIssues = [];
      for (const group of document.querySelectorAll(".mt-group-list")) {
        if (!visible(group)) continue;
        const rows = Array.from(group.querySelectorAll(":scope > .mt-list-row")).filter(visible);
        if (rows.length < 1) continue;

        // Group rows by whether they have a left control (checkbox/leading) vs plain text rows
        const buckets = { withLeft: [], plain: [] };
        for (const row of rows) {
          const titleEl = row.querySelector(".mt-list-title");
          if (!titleEl || !visible(titleEl)) continue;
          const tRect = titleEl.getBoundingClientRect();
          const hasLeft = Boolean(
            row.querySelector(":scope > .mt-list-check-btn, :scope > .mt-list-leading")
          );
          const bucket = hasLeft ? buckets.withLeft : buckets.plain;
          bucket.push({ text: titleEl.innerText.trim().slice(0, 28), left: tRect.left });

          // Also check .mt-list-meta aligns directly under .mt-list-title (±1.5px)
          const metaEl = row.querySelector(".mt-list-meta");
          if (metaEl && visible(metaEl)) {
            const mRect = metaEl.getBoundingClientRect();
            if (Math.abs(mRect.left - tRect.left) > 1.5) {
              alignmentIssues.push(
                `Meta offset ${Math.round((mRect.left - tRect.left) * 10) / 10}px on "${titleEl.innerText.trim().slice(0, 24)}"`
              );
            }
          }
        }

        for (const [bName, entries] of Object.entries(buckets)) {
          if (entries.length < 2) continue;
          const lefts = entries.map((e) => e.left);
          const spread = Math.max(...lefts) - Math.min(...lefts);
          if (spread > 1.5) {
            alignmentIssues.push(
              `GroupList (${bName}) title left spread ${spread.toFixed(1)}px: ${entries
                .map((e) => `${e.text}@${e.left.toFixed(1)}`)
                .join(", ")}`
            );
          }
        }
      }

      // 3. Inputs & custom SelectField triggers >= 16px (prevents iOS Safari zoom)
      const smallInputs = [];
      for (const el of document.querySelectorAll("input, textarea, .mt-select-trigger")) {
        if (!visible(el)) continue;
        if (["checkbox", "radio", "range", "hidden"].includes(el.type)) continue;
        const fs = parseFloat(window.getComputedStyle(el).fontSize);
        if (fs < 16) {
          smallInputs.push({
            tag: el.tagName.toLowerCase(),
            label: el.getAttribute("aria-label") || el.placeholder || el.id || "",
            fontSize: fs,
          });
        }
      }

      // 3b. Open custom SelectField menu viewport bounds check
      let selectMenuIssue = null;
      const openMenu = document.querySelector('.mt-select-menu[role="listbox"]');
      if (openMenu && visible(openMenu)) {
        const mr = openMenu.getBoundingClientRect();
        if (mr.top < 2 || mr.bottom > vpH - 2 || mr.left < 2 || mr.right > vpW - 2) {
          selectMenuIssue = `SelectField menu outside ${vpW}x${vpH}: top=${Math.round(mr.top)}, bottom=${Math.round(mr.bottom)}, left=${Math.round(mr.left)}, right=${Math.round(mr.right)}`;
        }
      }

      // 4. Toast overlap with headers / DateStrip / SegmentedControl
      const toastOverlaps = [];
      for (const toast of document.querySelectorAll(".mt-toast")) {
        if (!visible(toast)) continue;
        const tr = toast.getBoundingClientRect();
        for (const hdr of document.querySelectorAll(
          ".mt-page-header, .mt-section-header, .mt-date-bar, .mt-segmented"
        )) {
          if (!visible(hdr)) continue;
          if (rectsIntersect(tr, hdr.getBoundingClientRect(), 2)) {
            toastOverlaps.push({
              toast: toast.innerText.trim().slice(0, 35),
              covered: hdr.className.slice(0, 35),
            });
          }
        }
      }

      // 5. Sibling button/pill collision inside row containers
      const siblingCollisions = [];
      for (const container of document.querySelectorAll(
        ".mt-row, .mt-chip-row, .mt-segmented, .bottom-nav, .water-quick-row, .mt-page-header-actions"
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
                container: container.className.slice(0, 35),
                a: kids[i].innerText.trim().slice(0, 20),
                b: kids[j].innerText.trim().slice(0, 20),
              });
            }
          }
        }
      }

      // 6. Vertical text clipping & SegmentedControl horizontal truncation
      const clippedTexts = [];
      for (const el of document.querySelectorAll(
        ".mt-btn, .mt-pill, .mt-list-title, .bottom-nav-item, .mt-metric-value"
      )) {
        if (!visible(el)) continue;
        const st = window.getComputedStyle(el);
        if (["hidden", "clip"].includes(st.overflowY) && el.scrollHeight > el.clientHeight + 4) {
          clippedTexts.push({
            cls: el.className.slice(0, 35),
            text: el.innerText.trim().slice(0, 35),
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

      // 7. Sheet bounds check
      let sheetIssue = null;
      if (checkSheet) {
        const sheet = document.querySelector(".mt-sheet");
        if (!sheet || !visible(sheet)) {
          sheetIssue = "Expected open .mt-sheet but not visible";
        } else {
          const sr = sheet.getBoundingClientRect();
          if (sr.top < -2 || sr.bottom > vpH + 2 || sr.left < -2 || sr.right > vpW + 2) {
            sheetIssue = `Sheet outside ${vpW}x${vpH}: top=${Math.round(sr.top)}, bottom=${Math.round(sr.bottom)}`;
          }
        }
      }

      // 8. Desktop centered frame check (> 480px)
      let desktopFrameIssue = null;
      if (vpW > 480) {
        const shell = document.querySelector(".app-shell, .app-main, main");
        if (shell) {
          const sr = shell.getBoundingClientRect();
          if (sr.width > 460) desktopFrameIssue = `App frame too wide: ${Math.round(sr.width)}px`;
          if (Math.abs(sr.left - (vpW - sr.right)) > 20) {
            desktopFrameIssue = `App frame off-center: left=${Math.round(sr.left)}, right=${Math.round(vpW - sr.right)}`;
          }
        }
      }

      return {
        canvasToken,
        nativeSelectCount,
        docScrollW,
        innerW,
        badTokens,
        englishLeaks,
        alignmentIssues: alignmentIssues.slice(0, 6),
        smallInputs,
        selectMenuIssue,
        toastOverlaps,
        siblingCollisions,
        clippedTexts: clippedTexts.slice(0, 5),
        sheetIssue,
        desktopFrameIssue,
      };
    },
    { vpW: vp.width, vpH: vp.height, checkSheet: isSheet, allowBrands: allowBrandNames }
  );

  let ok = true;
  if (data.nativeSelectCount > 0) {
    ok = false;
    finding("P0", `Native <select> found (${label})`, `count=${data.nativeSelectCount}`);
  }
  if (data.selectMenuIssue) {
    ok = false;
    finding("P0", `SelectField menu bounds (${label})`, data.selectMenuIssue);
  }
  if (data.canvasToken !== "#F7F8FA") {
    ok = false;
    finding("P0", `Theme token (${label})`, `Expected --canvas=#F7F8FA, got ${data.canvasToken}`);
  }
  if (data.docScrollW > data.innerW) {
    ok = false;
    finding("P0", `Overflow (${label})`, `scrollWidth=${data.docScrollW} > innerWidth=${data.innerW}`);
  }
  if (data.badTokens.length) {
    ok = false;
    finding("P0", `Broken tokens (${label})`, data.badTokens.join(", "));
  }
  if (data.englishLeaks.length) {
    ok = false;
    finding("P0", `Leaked English UI (${label})`, data.englishLeaks.join(", "));
  }
  if (data.alignmentIssues.length) {
    ok = false;
    finding("P1", `ListRow alignment >1.5px (${label})`, data.alignmentIssues.join(" | "));
  }
  if (data.smallInputs.length) {
    ok = false;
    finding("P0", `Input <16px (${label})`, JSON.stringify(data.smallInputs));
  }
  if (data.toastOverlaps.length) {
    ok = false;
    finding("P1", `Toast overlap (${label})`, JSON.stringify(data.toastOverlaps));
  }
  if (data.siblingCollisions.length) {
    ok = false;
    finding("P1", `Sibling collision (${label})`, JSON.stringify(data.siblingCollisions));
  }
  if (data.clippedTexts.length) {
    ok = false;
    finding("P1", `Clipped text (${label})`, JSON.stringify(data.clippedTexts));
  }
  if (data.sheetIssue) {
    ok = false;
    finding("P0", `Sheet bounds (${label})`, data.sheetIssue);
  }
  if (data.desktopFrameIssue) {
    ok = false;
    finding("P1", `Desktop frame (${label})`, data.desktopFrameIssue);
  }

  if (checkBottomScroll && !isSheet) {
    const bottomCheck = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const nav = document.querySelector(".bottom-nav");
      const main = document.querySelector("main");
      if (!nav || !main) return { ok: true };
      const navTop = nav.getBoundingClientRect().top;
      const els = Array.from(main.querySelectorAll(".mt-group-list, .mt-card, .goal-card")).filter(
        (el) => el.getBoundingClientRect().height > 0
      );
      if (!els.length) return { ok: true };
      const lastBottom = els[els.length - 1].getBoundingClientRect().bottom;
      window.scrollTo(0, 0);
      return { ok: lastBottom <= navTop + 4, lastBottom: Math.round(lastBottom), navTop: Math.round(navTop) };
    });
    if (!bottomCheck.ok) {
      ok = false;
      finding(
        "P1",
        `BottomNav covers content (${label})`,
        `lastBottom=${bottomCheck.lastBottom} > navTop=${bottomCheck.navTop}`
      );
    }
  }

  if (ok) {
    pass(`Clean (${label})`, `${data.docScrollW}<=${data.innerW}px, 0 English leaks, ±1.5px aligned`);
  }
}

async function runIPhone13FullAudit(browser, todayIso) {
  console.log("\n=== PHASE 1: iPhone 13 (390x844) Exhaustive Click-All, Alignment, Russian & 30-Day Stress ===");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
  // 1. TODAY TAB (390x844)
  // -------------------------------------------------------------------------
  await auditScreen(page, "iPhone13: Сегодня", { checkBottomScroll: true });
  await snap(page, "ip13_01_today.png", false);

  // 1a. Tap Water cell in MetricStrip (+250 ml directly!)
  const waterMetric = page.locator(".mt-metric-cell", { hasText: /Вода/i }).first();
  const beforeMetricText = await waterMetric.innerText();
  await waterMetric.click();
  await page.waitForTimeout(400);
  const afterMetricText = await waterMetric.innerText();
  assert.notEqual(afterMetricText, beforeMetricText, "Water MetricStrip tap did not update water");
  pass("Today: MetricStrip water +250 tap updated");

  // 1b. PwaInstallGuide sheet (brands Safari/Chrome/iPhone allowed ONLY inside guide!)
  const pwaBtn = page.locator('button[aria-label*="экран"], button[aria-label*="Установить"]').first();
  if (await pwaBtn.count()) {
    await pwaBtn.click();
    await page.waitForTimeout(300);
    await auditScreen(page, "iPhone13 Sheet: PwaInstallGuide", { isSheet: true, allowBrandNames: true });
    await closeOpenSheet(page);
  }

  // 1c. YearReviewSheet
  const yearBtn = page.locator('button[aria-label*="Итоги"], button:has-text("Итоги")').first();
  if (await yearBtn.count()) {
    await yearBtn.click();
    await page.waitForTimeout(450);
    await auditScreen(page, "iPhone13 Sheet: YearReviewSheet", { isSheet: true });
    await snap(page, "ip13_sheet_year_review.png", false);
    await closeOpenSheet(page);
  }

  // 1d. TaskFormSheet: create with custom SelectField goal picker, toggle
  await page.locator(".mt-group-header button", { hasText: /Задача/i }).first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: TaskFormSheet", { isSheet: true });
  await snap(page, "ip13_sheet_task.png", false);
  const tSheet = page.locator(".mt-sheet");
  await tSheet.locator('input[type="text"], input:not([type])').first().fill("Новая задача 2026");
  // Click custom SelectField #1: Task -> linked goal
  const taskGoalTrigger = tSheet.locator('.mt-select-trigger[role="combobox"]').first();
  await taskGoalTrigger.scrollIntoViewIfNeeded();
  await taskGoalTrigger.click();
  await page.waitForTimeout(250);
  await auditScreen(page, "iPhone13 Dropdown #1: Task goal SelectField", { isSheet: true });
  await snap(page, "ip13_dropdown_task_goal.png", false);
  await page.locator('.mt-select-menu [role="option"]').nth(1).click();
  await page.waitForTimeout(150);
  await tSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);
  const newTaskRow = page.locator(".mt-list-row", { hasText: "Новая задача 2026" }).first();
  await newTaskRow.locator(".mt-list-check-btn").click();
  await page.waitForTimeout(300);

  // 1e. CRITICAL Phase 4 Bugfix check: «Выполнено за день» sheet (14+ rows, ZERO vertical squashing/overlap!)
  const doneRow = page.locator(".mt-list-row", { hasText: /Выполнено за день/i }).first();
  if (await doneRow.count()) {
    await doneRow.click();
    await page.waitForTimeout(350);
    await auditScreen(page, "iPhone13 Sheet: CompletedFeed", { isSheet: true });
    const rowOverlapResult = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".mt-sheet .mt-group-list .mt-list-row"));
      const overlaps = [];
      const squashed = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (r.height < 42) {
          squashed.push({ index: i, height: Math.round(r.height), text: rows[i].innerText.trim().slice(0, 30) });
        }
        if (i > 0) {
          const prev = rows[i - 1].getBoundingClientRect();
          if (r.top < prev.bottom - 1.5) {
            overlaps.push({
              prevIdx: i - 1,
              currIdx: i,
              overlapPx: Math.round((prev.bottom - r.top) * 10) / 10,
            });
          }
        }
      }
      return { count: rows.length, overlaps, squashed };
    });
    assert.ok(rowOverlapResult.count >= 12, `Expected >=12 rows in CompletedFeed, got ${rowOverlapResult.count}`);
    assert.equal(
      rowOverlapResult.overlaps.length,
      0,
      `CompletedFeed rows vertically overlapped: ${JSON.stringify(rowOverlapResult.overlaps)}`
    );
    assert.equal(
      rowOverlapResult.squashed.length,
      0,
      `CompletedFeed rows squashed (<42px): ${JSON.stringify(rowOverlapResult.squashed)}`
    );
    await snap(page, "ip13_sheet_completed.png", false);
    pass("CompletedFeed 14+ rows zero vertical overlap/squashing", `${rowOverlapResult.count} crisp rows`);
    await closeOpenSheet(page);
  }
  const reflRow = page.locator(".mt-list-row", { hasText: /Итог дня/i }).first();
  if (await reflRow.count()) {
    await reflRow.click();
    await page.waitForTimeout(300);
    await auditScreen(page, "iPhone13 Sheet: Reflection", { isSheet: true });
    await page.locator(".mt-sheet textarea").fill("Чистый спокойный день 2026.");
    await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(400);
  }

  // 1f. Сегодня -> Благодарности sub-tab (add, edit, screenshot)
  await clickSegment(page, "Благодарности");
  await page.waitForTimeout(350);
  await auditScreen(page, "iPhone13: Сегодня (Благодарности)", { checkBottomScroll: true });
  const gratText = "Благодарю за тёплое солнце и ясную голову";
  await page.locator(".gratitude-composer textarea, .gratitude-composer input").first().fill(gratText);
  await page.locator(".gratitude-composer button", { hasText: /Добавить/i }).first().click();
  await page.waitForTimeout(450);
  assert.ok((await page.locator("main").innerText()).includes(gratText), "Added gratitude did not appear");
  await snap(page, "ip13_today_gratitude.png", false);
  // Tap created gratitude row to verify edit sheet opens & saves cleanly
  await page.locator(".mt-group-list .mt-list-row", { hasText: gratText }).first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: GratitudeEdit", { isSheet: true });
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(350);
  await clickSegment(page, "День");
  await page.waitForTimeout(250);
  pass("Today: all sheets + CompletedFeed (0 overlap) + Gratitude add/edit + reflection");

  // -------------------------------------------------------------------------
  // 2. HEALTH TAB — «Здоровье» (Привычки / Тренировки / Цикл)
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Здоровье");
  await page.waitForTimeout(350);
  const healthHeader = (await page.locator(".mt-page-title").first().innerText()).trim();
  assert.equal(healthHeader, "Здоровье", `Expected PageHeader 'Здоровье', got '${healthHeader}'`);
  await auditScreen(page, "iPhone13: Здоровье (Привычки)", { checkBottomScroll: true });
  await snap(page, "ip13_02_habits.png", false);

  // Water +250 & Water Goal/Logs Sheet
  await page.locator(".water-card button", { hasText: "+250" }).first().click();
  await page.waitForTimeout(350);
  await page.locator(".water-card .mt-icon-btn").first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: WaterGoalAndLogs", { isSheet: true });
  await closeOpenSheet(page);

  // Add Habit/Vitamin sheet
  await page.locator(".mt-page-header button", { hasText: /Добавить|\+/ }).first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: HabitForm", { isSheet: true });
  const hSheet = page.locator(".mt-sheet");
  await hSheet.locator('input[type="text"], input:not([type])').first().fill("Витамин С 500 мг");
  await hSheet.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(400);

  // Toggle a habit via checkbox & tap row body to open Edit sheet
  const firstHabitRow = page.locator(".mt-group-list .mt-list-row").first();
  await firstHabitRow.locator(".mt-list-body").click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: HabitEdit", { isSheet: true });
  await closeOpenSheet(page);
  pass("Habits: compact water + sheet + grouped ListRow + edit sheet");

  // 2b. Workouts sub-tab + PracticeTimerSheet
  await clickSegment(page, "Тренировки");
  await page.waitForTimeout(350);
  await auditScreen(page, "iPhone13: Тренировки", { checkBottomScroll: true });
  await snap(page, "ip13_03_workouts.png", false);

  await page.locator(".workout-type-card", { hasText: "Цигун" }).click();
  await page.waitForTimeout(150);
  const timerBtn = page.getByRole("button", { name: /Таймер/i }).first();
  await timerBtn.click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: PracticeTimer", { isSheet: true });
  await snap(page, "ip13_sheet_timer.png", false);
  await closeOpenSheet(page);

  await page.getByRole("button", { name: /Отметить/i }).first().click();
  await page.waitForTimeout(450);
  pass("Workouts: compact log card + timer sheet + log Qigong");

  // 2c. Cycle sub-tab (12m+ archive, settings, month picker, day editor)
  await clickSegment(page, "Цикл");
  await page.waitForTimeout(450);
  await auditScreen(page, "iPhone13: Цикл", { checkBottomScroll: true });
  await snap(page, "ip13_04_cycle.png", false);

  await page.locator(".cycle-hero .mt-icon-btn").first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: CycleSettings", { isSheet: true });
  await closeOpenSheet(page);

  // Month picker jump 8 months back & toggle period day
  await page.locator(".cycle-cal-header button").nth(1).click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: CycleMonthPicker", { isSheet: true });
  await page.locator(".mt-sheet .mt-sheet-body button").nth(8).click();
  await page.waitForTimeout(400);

  await page.locator(".cycle-day:not(.is-outside):not(.is-period)").first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: CycleDayEditor", { isSheet: true });
  await page.locator(".mt-sheet .mt-list-check-btn, .mt-sheet .mt-check-main").first().click();
  await page.waitForTimeout(150);
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);
  pass("Cycle: 12m+ archive + settings + month picker + day editor");

  // -------------------------------------------------------------------------
  // 3. NUTRITION TAB (Рацион & Меню)
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Питание");
  await page.waitForTimeout(400);
  await auditScreen(page, "iPhone13: Питание (Рацион)", { checkBottomScroll: true });
  await snap(page, "ip13_05_nutrition.png", false);

  // Open MealPickerSheet via page header '+' or breakfast '+'
  await page.locator(".mt-page-header button").first().click();
  await page.waitForTimeout(350);
  await auditScreen(page, "iPhone13 Sheet: MealPicker", { isSheet: true });
  await snap(page, "ip13_sheet_meal_picker.png", false);
  const firstMenuChoice = page.locator(".mt-sheet .mt-list-row").first();
  if (await firstMenuChoice.count()) {
    await firstMenuChoice.click();
    await page.waitForTimeout(250);
    await auditScreen(page, "iPhone13 Sheet: MealPicker (portion)", { isSheet: true });
    // Click custom SelectField #2: Nutrition unit picker
    const unitTrigger = page.locator('.mt-sheet .mt-select-trigger[role="combobox"]').first();
    await unitTrigger.scrollIntoViewIfNeeded();
    await unitTrigger.click();
    await page.waitForTimeout(250);
    await auditScreen(page, "iPhone13 Dropdown #2: Nutrition unit SelectField", { isSheet: true });
    await snap(page, "ip13_dropdown_nutrition_unit.png", false);
    await page.locator('.mt-select-menu [role="option"]', { hasText: "порция" }).first().click();
    await page.waitForTimeout(150);
    await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
    await page.waitForTimeout(450);
  } else {
    await closeOpenSheet(page);
  }

  await clickSegment(page, "Меню");
  await page.waitForTimeout(350);
  await auditScreen(page, "iPhone13: Питание (Меню)", { checkBottomScroll: true });
  await snap(page, "ip13_06_nutrition_menu.png", false);

  // Tap a menu dish row to open MenuItemFormSheet (edit/в покупки)
  const firstCatalogRow = page.locator(".mt-group-list .mt-list-row .mt-list-body").first();
  if (await firstCatalogRow.count()) {
    await firstCatalogRow.click();
    await page.waitForTimeout(300);
    await auditScreen(page, "iPhone13 Sheet: MenuItemForm", { isSheet: true });
    await closeOpenSheet(page);
  }

  // 3b. Питание -> Покупки (GROCERIES ONLY — strictly isolated from Дом household!)
  await clickSegment(page, "Покупки");
  await page.waitForTimeout(350);
  await auditScreen(page, "iPhone13: Питание (Покупки продуктов)", { checkBottomScroll: true });
  const groceryItemName = "Спелый авокадо хасс";
  await page.locator("main form input").first().fill(groceryItemName);
  await page.locator('button[aria-label="Добавить в покупки"]').first().click();
  await page.waitForTimeout(400);
  const groceriesPageText = await page.locator("main").innerText();
  assert.ok(groceriesPageText.includes(groceryItemName), "Added grocery item not visible in Nutrition -> Покупки");
  assert.ok(
    !groceriesPageText.includes("посудомойки"),
    "Household item leaked into Nutrition -> Покупки groceries list!"
  );
  await snap(page, "ip13_nutrition_groceries.png", false);
  pass("Nutrition: grouped ration + MealPicker + MenuCatalog + isolated Groceries");

  // -------------------------------------------------------------------------
  // 4. HOME TAB (Уборка & Покупки для дома — HOUSEHOLD ONLY!)
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Дом");
  await page.waitForTimeout(400);
  await auditScreen(page, "iPhone13: Дом (Уборка)", { checkBottomScroll: true });
  await snap(page, "ip13_07_home_chores.png", false);

  // Open ChoreSheet via header '+'
  await page.locator(".mt-page-header button").first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: ChoreSheet", { isSheet: true });
  await page.locator('.mt-sheet input[type="text"], .mt-sheet input:not([type])').first().fill("Полить цветы");
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(400);

  await clickSegment(page, "Покупки");
  await page.waitForTimeout(350);
  await auditScreen(page, "iPhone13: Дом (Покупки для дома)", { checkBottomScroll: true });
  const householdItemName = "Льняная скатерть";
  await page.locator("main form input").first().fill(householdItemName);
  await page.locator('button[aria-label="Добавить в покупки"]').first().click();
  await page.waitForTimeout(400);
  const householdPageText = await page.locator("main").innerText();
  assert.ok(householdPageText.includes(householdItemName), "Added household item not visible in Home -> Покупки");
  assert.ok(
    !householdPageText.includes(groceryItemName),
    "Grocery item leaked into Home -> Покупки household list!"
  );
  await snap(page, "ip13_home_household.png", false);
  await snap(page, "ip13_08_home_shopping.png", false);
  pass("Home: unified GroupList chores + ChoreSheet + strictly isolated Household shopping");

  // -------------------------------------------------------------------------
  // 5. GOALS TAB (1 месяц / 1 год / 5 лет + Mini-Goals + Календарь событий)
  // -------------------------------------------------------------------------
  await clickBottomTab(page, "Цели");
  await page.waitForTimeout(450);
  await auditScreen(page, "iPhone13: Цели", { checkBottomScroll: true });
  const goalsPageText = await page.locator("main").innerText();
  for (const hLabel of ["1 месяц", "1 год", "5 лет"]) {
    assert.ok(goalsPageText.includes(hLabel), `Missing horizon pill '${hLabel}' on Goals tab`);
  }
  await snap(page, "ip13_09_goals.png", false);
  await snap(page, "ip13_goals_horizons.png", false);

  // Create a 1-month mini-goal linked to a 1-year/5-year big goal via custom SelectField!
  await page.locator(".mt-page-header button", { hasText: /Цель|\+/ }).last().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: GoalFormSheet", { isSheet: true });
  await snap(page, "ip13_sheet_goal_form.png", false);
  const miniGoalTitle = "Прочитать 2 книги за месяц";
  await page.locator('.mt-sheet input[type="text"], .mt-sheet input:not([type])').first().fill(miniGoalTitle);
  await page.locator(".mt-sheet button", { hasText: "1 месяц" }).first().click();
  await page.waitForTimeout(200);
  // Select parent big goal via custom SelectField (#5 parent goal!)
  const parentGoalTrigger = page.locator('.mt-sheet .mt-select-trigger[role="combobox"]').first();
  await parentGoalTrigger.scrollIntoViewIfNeeded();
  await parentGoalTrigger.click();
  await page.waitForTimeout(250);
  await auditScreen(page, "iPhone13 Dropdown: Mini-goal parent SelectField", { isSheet: true });
  const firstParentOption = page.locator('.mt-select-menu [role="option"]').nth(1);
  const chosenParentTitle = (await firstParentOption.locator(".mt-select-option-label").innerText()).trim();
  await firstParentOption.click();
  await page.waitForTimeout(150);
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(500);
  pass("Goals: Created 1-month mini-goal linked to big goal", `${miniGoalTitle} -> ${chosenParentTitle}`);

  // Open parent big goal's GoalDetailSheet (exclude mini-goal card that mentions parent title in its subtitle!)
  const parentCard = page
    .locator(".goal-card")
    .filter({ has: page.locator(".goal-card-title", { hasText: chosenParentTitle }) })
    .first();
  await parentCard.locator(".goal-milestones-link").click();
  await page.waitForTimeout(350);
  await auditScreen(page, "iPhone13 Sheet: GoalDetailSheet", { isSheet: true });
  await snap(page, "ip13_sheet_goal_detail.png", false);
  const detailText = await page.locator(".mt-sheet").innerText();
  assert.ok(/кв\./.test(detailText), `Expected Russian quarters ('кв.') in GoalDetailSheet`);
  assert.ok(
    detailText.includes(miniGoalTitle),
    `Linked 1-month mini-goal '${miniGoalTitle}' not listed inside parent GoalDetailSheet`
  );

  // Click "+ Веха" inside GoalDetailSheet to exercise SelectFields (year & quarter)
  await page.locator(".mt-sheet button", { hasText: /Веха/i }).first().click();
  await page.waitForTimeout(200);
  await page.locator('.mt-sheet input[aria-label="Название новой вехи"]').fill("Веха из кастомного списка");
  const detailTriggers = page.locator('.mt-sheet .mt-select-trigger[role="combobox"]');
  await detailTriggers.nth(0).scrollIntoViewIfNeeded();
  await detailTriggers.nth(0).click();
  await page.waitForTimeout(250);
  await auditScreen(page, "iPhone13 Dropdown: GoalDetail year SelectField", { isSheet: true });
  await snap(page, "ip13_dropdown_detail_year.png", false);
  await page.locator('.mt-select-menu [role="option"]').nth(1).click();
  await page.waitForTimeout(150);
  await detailTriggers.nth(1).click();
  await page.waitForTimeout(250);
  await auditScreen(page, "iPhone13 Dropdown: GoalDetail quarter SelectField", { isSheet: true });
  await snap(page, "ip13_dropdown_detail_quarter.png", false);
  await page.locator('.mt-select-menu [role="option"]', { hasText: "2 кв." }).first().click();
  await page.waitForTimeout(150);
  await page.locator('.mt-sheet button[type="submit"]', { hasText: /Добавить/i }).first().click();
  await page.waitForTimeout(450);
  assert.ok(
    (await page.locator(".mt-sheet").innerText()).includes("Веха из кастомного списка"),
    "Milestone created with custom SelectField did not appear"
  );
  await closeOpenSheet(page);
  pass("Goals: GoalDetailSheet shows linked mini-goal + custom SelectFields verified");

  // Open GoalCheckinSheet & save
  await page.locator(".goal-card button", { hasText: "Чек-ин" }).first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: GoalCheckinSheet", { isSheet: true });
  await page.locator(".mt-sheet textarea").fill("Стабильное движение к цели.");
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);

  // 5b. Цели -> Календарь событий (add Doctor/Cosmetologist event, toggle done, navigate months)
  await clickSegment(page, "Календарь");
  await page.waitForTimeout(400);
  await auditScreen(page, "iPhone13: Цели (Календарь событий)", { checkBottomScroll: true });
  await page.locator(".mt-page-header button", { hasText: /Событие|\+/ }).last().click();
  await page.waitForTimeout(300);
  await auditScreen(page, "iPhone13 Sheet: EventFormSheet", { isSheet: true });
  const testEventTitle = "Приём у косметолога";
  await page.locator('.mt-sheet input[type="text"], .mt-sheet input:not([type])').first().fill(testEventTitle);
  const evTimeInput = page.locator('.mt-sheet input[type="time"]').first();
  if (await evTimeInput.count()) await evTimeInput.fill("15:30");
  await page.locator(".mt-sheet button", { hasText: /Косметолог/i }).first().click();
  await page.waitForTimeout(100);
  await page.locator(".mt-sheet-footer .mt-btn--primary").first().click();
  await page.waitForTimeout(450);
  assert.ok((await page.locator("main").innerText()).includes(testEventTitle), "Created calendar event did not appear");
  // Toggle event completed & capture screenshot
  const evRow = page.locator(".mt-group-list .mt-list-row", { hasText: testEventTitle }).first();
  await evRow.locator(".mt-list-check-btn").click();
  await page.waitForTimeout(350);
  await snap(page, "ip13_goals_calendar.png", false);
  // Navigate next month & back
  const calNextBtn = page.locator(".events-cal-header button").last();
  const calPrevBtn = page.locator(".events-cal-header button").first();
  await calNextBtn.click();
  await page.waitForTimeout(250);
  await calPrevBtn.click();
  await page.waitForTimeout(250);
  pass("Goals -> Календарь: created event, toggled done, navigated months");

  // -------------------------------------------------------------------------
  // 6. FULL 30-DAY SQLITE STRESS TEST & RELOAD PERSISTENCE
  // -------------------------------------------------------------------------
  console.log("\n=== PHASE 2: Full-Month (30-Day) SQLite Stress & Reload ===");
  const habitsResp = await (await fetch(`${BASE_URL}/api/habits?date=${todayIso}`)).json();
  const firstHabitId = habitsResp.items[0].id;
  const vitaminId = habitsResp.items.find((h) => h.category === "vitamin")?.id || habitsResp.items[1].id;
  const choresResp = await (await fetch(`${BASE_URL}/api/home/chores?date=${todayIso}`)).json();
  const firstChoreId = choresResp.items[0].id;
  const menuResp = await (await fetch(`${BASE_URL}/api/nutrition/menu`)).json();
  const menuSample = menuResp.items.slice(0, 3);
  const workoutCycle = ["breathing", "pilates", "qigong"];

  for (let offset = 29; offset >= 0; offset--) {
    const d = isoOffset(todayIso, -offset);
    const batch = [
      fetch(`${BASE_URL}/api/water/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, amount_ml: 250, logged_at: "10:00" }),
      }),
      fetch(`${BASE_URL}/api/habits/${firstHabitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, completed: true }),
      }),
      fetch(`${BASE_URL}/api/habits/${vitaminId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, completed: true }),
      }),
    ];
    if (offset % 2 === 0) {
      batch.push(
        fetch(`${BASE_URL}/api/workouts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            log_date: d,
            workout_type: workoutCycle[(offset / 2) % 3],
            duration_min: 25,
            intensity: "medium",
            logged_at: "08:30",
          }),
        })
      );
    }
    if (offset < 7) {
      const dish = menuSample[offset % menuSample.length];
      batch.push(
        fetch(`${BASE_URL}/api/nutrition/meals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            log_date: d,
            meal_slot: "breakfast",
            menu_item_id: dish.id,
            dish_name: dish.name,
            amount_value: 1,
            amount_unit: "порция",
            grams: dish.default_grams || 220,
            eaten_at: "08:40",
            kcal: dish.kcal || 320,
          }),
        })
      );
    }
    if (offset % 3 === 0) {
      batch.push(
        fetch(`${BASE_URL}/api/home/chores/${firstChoreId}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: d, completed: true }),
        })
      );
    }
    const resList = await Promise.all(batch);
    for (const r of resList) {
      if (!r.ok) finding("P0", `30-day stress (${d})`, `${r.status} ${r.url}`);
    }
  }

  const afterHabits = await (await fetch(`${BASE_URL}/api/habits?date=${todayIso}`)).json();
  const streak = afterHabits.items.find((h) => h.id === firstHabitId).streak_days;
  assert.ok(streak >= 30, `Expected >=30 day streak, got ${streak}`);

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
  pass("30-day SQLite stress verified", `streak=${streak}d, rows=${countsJson}`);

  // Reload & verify FULL Phase 4 persistence (Today task + Gratitude, Health 30d streak, Nutrition groceries, Home household, Goals mini-goal + Calendar event)
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  assert.ok((await page.locator("main").innerText()).includes("Новая задача 2026"), "Task did not persist");
  await clickSegment(page, "Благодарности");
  await page.waitForTimeout(300);
  assert.ok((await page.locator("main").innerText()).includes(gratText), "Gratitude did not persist");

  await clickBottomTab(page, "Здоровье");
  await page.waitForTimeout(300);
  assert.ok((await page.locator("main").innerText()).includes(`${streak} дн.`), "30d streak did not persist");

  await clickBottomTab(page, "Питание");
  await clickSegment(page, "Покупки");
  await page.waitForTimeout(300);
  assert.ok((await page.locator("main").innerText()).includes(groceryItemName), "Grocery item did not persist");

  await clickBottomTab(page, "Дом");
  await clickSegment(page, "Покупки");
  await page.waitForTimeout(300);
  assert.ok((await page.locator("main").innerText()).includes(householdItemName), "Household item did not persist");

  await clickBottomTab(page, "Цели");
  await page.waitForTimeout(350);
  assert.ok((await page.locator("main").innerText()).includes(miniGoalTitle), "1-month mini-goal did not persist");
  await clickSegment(page, "Календарь");
  await page.waitForTimeout(350);
  assert.ok((await page.locator("main").innerText()).includes(testEventTitle), "Calendar event did not persist");
  pass("Post-reload persistence verified across ALL Phase 4 features (Gratitude, Health, Groceries, Household, Mini-Goal, Calendar)");

  if (consoleErrors.length) finding("P0", "iPhone13 console errors", consoleErrors.join(" | "));
  else pass("Zero iPhone 13 console errors");
  if (pageErrors.length) finding("P0", "iPhone13 page errors", pageErrors.join(" | "));
  else pass("Zero iPhone 13 page errors");
  if (failedRequests.length) finding("P0", "iPhone13 HTTP>=400", failedRequests.join(" | "));
  else pass("Zero iPhone 13 failed HTTP responses");

  await context.close();
}

async function runViewportSweep(browser, name, width, height, dpr, prefix) {
  console.log(`\n=== PHASE: ${name} (${width}x${height}) Sweep ===`);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: width <= 480,
    hasTouch: width <= 480,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  const page = await context.newPage();
  const errs = [];
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errs.push(`http ${r.status()} ${r.url()}`);
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  await auditScreen(page, `${name}: Сегодня`);
  await snap(page, `${prefix}_01_today.png`, false);

  await clickBottomTab(page, "Здоровье");
  await auditScreen(page, `${name}: Здоровье (Привычки)`);
  await clickSegment(page, "Тренировки");
  await auditScreen(page, `${name}: Тренировки`);
  await clickSegment(page, "Цикл");
  await auditScreen(page, `${name}: Цикл`);
  await snap(page, `${prefix}_02_cycle.png`, false);

  await clickBottomTab(page, "Питание");
  await auditScreen(page, `${name}: Питание`);
  await snap(page, `${prefix}_03_nutrition.png`, false);

  await clickBottomTab(page, "Дом");
  await auditScreen(page, `${name}: Дом`);

  await clickBottomTab(page, "Цели");
  await auditScreen(page, `${name}: Цели`);
  await snap(page, `${prefix}_04_goals.png`, false);

  // Open GoalDetailSheet to verify centering + open custom SelectField on desktop / iPhone 14 Pro
  await page.locator(".goal-card .goal-milestones-link").first().click();
  await page.waitForTimeout(300);
  await auditScreen(page, `${name} Sheet: GoalDetailSheet`, { isSheet: true });
  await snap(page, `${prefix}_05_goal_detail_sheet.png`, false);
  await page.locator(".mt-sheet button", { hasText: /Веха/i }).first().click();
  await page.waitForTimeout(200);
  const sweepQuarterTrigger = page.locator('.mt-sheet .mt-select-trigger[role="combobox"]').nth(1);
  await sweepQuarterTrigger.scrollIntoViewIfNeeded();
  await sweepQuarterTrigger.click();
  await page.waitForTimeout(250);
  await auditScreen(page, `${name} Dropdown: GoalDetail quarter SelectField`, { isSheet: true });
  if (prefix === "desktop") {
    await snap(page, "desktop_dropdown_quarter.png", false);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await closeOpenSheet(page);

  if (errs.length) finding("P0", `${name} runtime errors`, errs.join(" | "));
  else pass(`Zero ${name} console/page/HTTP errors`);

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

    await runIPhone13FullAudit(browser, health.today);
    await runViewportSweep(browser, "iPhone 14 Pro", 393, 852, 3, "ip14p");
    await runViewportSweep(browser, "Desktop", 1280, 900, 2, "desktop");

    console.log(
      `\n========================================================\n` +
        `PHASE 3 AUDIT SUMMARY: ${passes.length} passed, ${findings.length} findings\n` +
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
  console.error("FATAL AUDIT V3 ERROR:", err);
  process.exit(1);
});
