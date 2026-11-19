/**
 * Phase 7 (/goal) Exhaustive Global Pixel-Perfection & Modal/Dropdown/Tab Audit
 * Marina Tracker («Ритм») — 2026 Carbon & Cobalt Design System
 *
 * Audits EVERY SINGLE surface across 3 viewports with `locale: "ru-RU"`:
 *   - iPhone 13 (390×844)   — all 5 tabs, 10 sub-tabs, 22 modals (Create+Edit), 17 SelectField popovers, toast-vs-sheet check
 *   - iPhone 14 Pro (393×852) — full tab/sub-tab + key modals/dropdowns sweep
 *   - Desktop (1280×900)    — full tab/sub-tab + centered modals + desktop popover sweep
 *
 * Runs against an isolated temp SQLite DB on port 8099 (NEVER touches :8098 or data/).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  "/home/ruslan_safaev/digital_platform/frontend/package.json"
);
const { chromium } = require("playwright");

const ROOT = "/home/ruslan_safaev/marina_tracker";
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "audit_goal");
const DB_PATH = "/tmp/marina_tracker_audit_goal.sqlite3";
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
const screenshots = [];

function pass(name, detail = "") {
  passes.push({ name, detail });
  console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ""}`);
}

function finding(severity, area, detail) {
  findings.push({ severity, area, detail });
  console.error(`  [${severity}] ${area}: ${detail}`);
}

async function snap(page, filename, fullPage = false) {
  const out = path.join(ARTIFACTS_DIR, filename);
  await page.screenshot({ path: out, fullPage });
  screenshots.push(filename);
  return out;
}

async function clickBottomTab(page, label) {
  await page.locator("nav.bottom-nav button", { hasText: label }).click();
  await page.waitForTimeout(320);
}

async function clickSegment(page, label) {
  await page.locator(".mt-segmented-btn", { hasText: label }).first().click();
  await page.waitForTimeout(320);
}

async function closeAllSheets(page) {
  for (let i = 0; i < 4; i++) {
    const closeBtn = page.locator('.mt-sheet button[aria-label="Закрыть"]').last();
    if (await closeBtn.count()) {
      await closeBtn.click();
      await page.waitForTimeout(220);
    } else {
      break;
    }
  }
}

/**
 * Exhaustive DOM & pixel-level inspection for any screen, sheet, or open dropdown.
 */
async function auditState(
  page,
  label,
  {
    isSheet = false,
    expectDropdown = false,
    allowBrands = false,
    allowToast = true,
  } = {}
) {
  const vp = page.viewportSize();
  const data = await page.evaluate(
    ({ vpW, vpH, checkSheet, expectDD, allowBrandWords }) => {
      const rectsIntersect = (a, b, pad = 1) =>
        a.left < b.right - pad &&
        a.right > b.left + pad &&
        a.top < b.bottom - pad &&
        a.bottom > b.top + pad;

      const visible = (el) => {
        if (!el) return false;
        const st = window.getComputedStyle(el);
        if (
          st.display === "none" ||
          st.visibility === "hidden" ||
          parseFloat(st.opacity) === 0
        )
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 0.5 && r.height > 0.5;
      };

      // 0. Fonts loaded
      const loadedFonts = Array.from(document.fonts)
        .filter((f) => f.status === "loaded")
        .map((f) => f.family.replace(/["']/g, ""));
      const hasManrope = loadedFonts.some((f) => /Manrope/i.test(f));
      const hasInter = loadedFonts.some((f) => /Inter/i.test(f));

      // 1. Horizontal overflow (document + open sheet body)
      const docScrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const sheetBodyOverflow = [];
      for (const body of document.querySelectorAll(".mt-sheet-body")) {
        if (!visible(body)) continue;
        if (body.scrollWidth > body.clientWidth + 2) {
          sheetBodyOverflow.push({
            scrollW: Math.round(body.scrollWidth),
            clientW: Math.round(body.clientWidth),
          });
        }
      }

      // 2. Native <select> count (must be 0)
      const nativeSelectCount = document.querySelectorAll("select").length;

      // 3. Broken JS tokens & English leaks across visible text, placeholders, aria-labels, dropdown options
      const rawText = document.body.innerText || "";
      const badTokens = [];
      if (/\bNaN\b/.test(rawText)) badTokens.push("NaN");
      if (/\bundefined\b/.test(rawText)) badTokens.push("undefined");
      if (rawText.includes("[object Object]")) badTokens.push("[object Object]");

      const brandWhitelist = new Set(
        allowBrandWords
          ? [
              "Safari",
              "Chrome",
              "iPhone",
              "iOS",
              "Android",
              "iPad",
              "Web",
              "Push",
              "PWA",
            ]
          : []
      );

      // Scan visible text nodes + placeholders + aria-labels for English words
      const englishLeaks = [];
      const seenLeaks = new Set();
      const forbiddenExactRe =
        /\b(?:Q[1-4]|A[12]|B[12]|C[12]|CILS|PWA|Todo|Failed|fetch|Not Found|Field required|String should|Loading|Cancel|Save|Delete|Edit|Today|Habits|Goals|Home|Nutrition|Submit|Close|Settings|Profile|Done|Back|Next|Prev|AM|PM|Error|Success|Warning|Push|Web|kcal)\b/g;

      const scanString = (str, source) => {
        if (!str) return;
        const matches = str.match(forbiddenExactRe) || [];
        for (const m of matches) {
          if (brandWhitelist.has(m)) continue;
          const key = `${source}:${m}`;
          if (!seenLeaks.has(key)) {
            seenLeaks.add(key);
            englishLeaks.push(`${m} (${source})`);
          }
        }
        // Also catch any unexpected 3+ letter Latin words
        const latinWords = str.match(/\b[A-Za-z]{3,}\b/g) || [];
        for (const w of latinWords) {
          if (brandWhitelist.has(w)) continue;
          // Ignore known non-brand exceptions? Keep strict so we see everything!
          const key = `latin:${source}:${w}`;
          if (!seenLeaks.has(key) && !seenLeaks.has(`${source}:${w}`)) {
            seenLeaks.add(key);
            englishLeaks.push(`${w} (${source})`);
          }
        }
      };

      scanString(rawText, "text");
      for (const opt of document.querySelectorAll('.mt-select-menu [role="option"]')) {
        if (visible(opt)) scanString(opt.textContent || "", "option");
      }
      for (const el of document.querySelectorAll("input, textarea")) {
        if (!visible(el)) continue;
        if (el.placeholder) scanString(el.placeholder, `placeholder#${el.id || el.type}`);
      }
      for (const el of document.querySelectorAll("[aria-label]")) {
        if (!visible(el)) continue;
        scanString(el.getAttribute("aria-label"), "aria-label");
      }

      // 4. Placeholder clipping check using exact Canvas measureText
      const clippedPlaceholders = [];
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      for (const el of document.querySelectorAll("input[placeholder]")) {
        if (!visible(el)) continue;
        if (["checkbox", "radio", "range", "hidden", "date", "time"].includes(el.type))
          continue;
        if (!el.placeholder) continue;
        const st = window.getComputedStyle(el);
        const padL = parseFloat(st.paddingLeft) || 0;
        const padR = parseFloat(st.paddingRight) || 0;
        const availW = el.clientWidth - padL - padR;
        if (availW <= 10) continue;
        ctx.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
        const textW = ctx.measureText(el.placeholder).width;
        if (textW > availW + 2) {
          clippedPlaceholders.push({
            placeholder: el.placeholder,
            textW: Math.round(textW),
            availW: Math.round(availW),
            inputId: el.id || el.getAttribute("aria-label") || el.className.slice(0, 30),
          });
        }
      }

      // 5. Inputs & SelectField triggers >= 16px font-size
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

      // 6. Razor-straight vertical alignment (±1.5px) & row non-overlap inside EVERY .mt-group-list
      const alignmentIssues = [];
      const rowOverlaps = [];
      for (const group of document.querySelectorAll(".mt-group-list")) {
        if (!visible(group)) continue;
        const rows = Array.from(group.querySelectorAll(":scope > .mt-list-row")).filter(
          visible
        );
        if (rows.length < 1) continue;

        // Consecutive row overlap check
        for (let i = 0; i < rows.length - 1; i++) {
          const r1 = rows[i].getBoundingClientRect();
          const r2 = rows[i + 1].getBoundingClientRect();
          if (r1.bottom > r2.top + 1.5) {
            rowOverlaps.push({
              a: rows[i].innerText.trim().slice(0, 28),
              b: rows[i + 1].innerText.trim().slice(0, 28),
              overlapPx: Math.round((r1.bottom - r2.top) * 10) / 10,
            });
          }
        }

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

      // 7. Icon + text vertical centering in single-line buttons & pills
      const iconCenterIssues = [];
      for (const btn of document.querySelectorAll(".mt-btn, .mt-pill, .mt-segmented-btn")) {
        if (!visible(btn)) continue;
        const svg = btn.querySelector(":scope > svg");
        const span = btn.querySelector(":scope > span");
        if (!svg || !span || !visible(svg) || !visible(span)) continue;
        const br = btn.getBoundingClientRect();
        if (br.height > 54) continue; // multi-line button
        const sr = svg.getBoundingClientRect();
        const tr = span.getBoundingClientRect();
        const diff = Math.abs((sr.top + sr.bottom) / 2 - (tr.top + tr.bottom) / 2);
        if (diff > 3.5) {
          iconCenterIssues.push({
            text: span.innerText.trim().slice(0, 25),
            diffPx: Math.round(diff * 10) / 10,
          });
        }
      }

      // 8. Toast overlaps (when sheet is open, toast floats at top above dimmed backdrop so check against open sheet header/footer; otherwise check page headers/nav)
      const toastOverlaps = [];
      for (const toast of document.querySelectorAll(".mt-toast")) {
        if (!visible(toast)) continue;
        const tr = toast.getBoundingClientRect();
        const selector = checkSheet
          ? ".mt-sheet-footer, .mt-sheet-header"
          : ".mt-page-header, .mt-section-header, .mt-date-bar, .mt-segmented";
        for (const tgt of document.querySelectorAll(selector)) {
          if (!visible(tgt)) continue;
          if (rectsIntersect(tr, tgt.getBoundingClientRect(), 2)) {
            toastOverlaps.push({
              toast: toast.innerText.trim().slice(0, 35),
              covered: tgt.className.slice(0, 40),
            });
          }
        }
      }

      // 9. Sibling button/pill/input collisions
      const siblingCollisions = [];
      for (const container of document.querySelectorAll(
        ".mt-row, .mt-chip-row, .mt-segmented, .bottom-nav, .water-quick-row, .mt-page-header-actions, .mt-sheet-footer, .wish-quick-add, .gratitude-quick-add"
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
                a: kids[i].innerText.trim().slice(0, 20) || kids[i].tagName,
                b: kids[j].innerText.trim().slice(0, 20) || kids[j].tagName,
              });
            }
          }
        }
      }

      // 10. Text clipping / truncation on buttons, segmented controls, headers, nav items, triggers
      const clippedTexts = [];
      for (const el of document.querySelectorAll(
        ".mt-segmented-btn, .bottom-nav-item, .mt-btn, .mt-page-title, .mt-sheet-title, .mt-group-header-title"
      )) {
        if (!visible(el)) continue;
        const st = window.getComputedStyle(el);
        const hClip = el.scrollWidth > el.clientWidth + 2;
        const vClip =
          (st.overflowY === "hidden" || st.overflowY === "clip") &&
          el.scrollHeight > el.clientHeight + 3;
        if (hClip || vClip) {
          clippedTexts.push({
            cls: el.className.slice(0, 32),
            text: el.innerText.trim().slice(0, 35),
            sw: el.scrollWidth,
            cw: el.clientWidth,
            sh: el.scrollHeight,
            ch: el.clientHeight,
          });
        }
      }

      // Check SegmentedControl unwanted wrap (height > 44px)
      const wrappedSegments = [];
      for (const seg of document.querySelectorAll(".mt-segmented-btn")) {
        if (!visible(seg)) continue;
        const r = seg.getBoundingClientRect();
        if (r.height > 44) {
          wrappedSegments.push({
            text: seg.innerText.trim(),
            height: Math.round(r.height),
          });
        }
      }

      // Check hard-clipped parent goal links/tags (must use ellipsis or fit cleanly)
      for (const el of document.querySelectorAll(".goal-parent-link, .goal-parent-link > span, .goal-parent-tag")) {
        if (!visible(el)) continue;
        const st = window.getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 2 && st.textOverflow !== "ellipsis") {
          clippedTexts.push({
            cls: el.className.slice(0, 32) || "span",
            text: el.innerText.trim().slice(0, 35),
            sw: el.scrollWidth,
            cw: el.clientWidth,
            sh: el.scrollHeight,
            ch: el.clientHeight,
          });
        }
      }

      // 11. Open SelectField / DateField / TimeField popover bounds, clipping & option wrapping
      let dropdownIssue = null;
      const openMenus = Array.from(
        document.querySelectorAll('.mt-select-menu[role="listbox"], .mt-picker-popover[role="dialog"]')
      ).filter(visible);
      if (expectDD && openMenus.length === 0) {
        dropdownIssue = "Expected open SelectField/Picker popover but none is visible";
      } else if (openMenus.length > 0) {
        const menu = openMenus[openMenus.length - 1];
        const mr = menu.getBoundingClientRect();
        if (mr.top < 2 || mr.bottom > vpH - 2 || mr.left < 2 || mr.right > vpW - 2) {
          dropdownIssue = `SelectField menu outside ${vpW}x${vpH}: top=${Math.round(mr.top)}, bottom=${Math.round(mr.bottom)}, left=${Math.round(mr.left)}, right=${Math.round(mr.right)}`;
        } else if (menu.scrollWidth > menu.clientWidth + 2) {
          dropdownIssue = `SelectField menu horizontal overflow: scrollW=${Math.round(menu.scrollWidth)} > clientW=${Math.round(menu.clientWidth)}`;
        } else if (mr.height < 36) {
          dropdownIssue = `SelectField menu collapsed too short: height=${Math.round(mr.height)}px`;
        } else {
          // Check that short single-word option labels (like "Воскресенье") don't wrap onto 2+ lines!
          for (const opt of menu.querySelectorAll('[role="option"]')) {
            if (!visible(opt)) continue;
            const or = opt.getBoundingClientRect();
            const txt = (opt.innerText || "").trim();
            if (txt.length <= 22 && or.height > 48) {
              dropdownIssue = `SelectField option wrapped awkwardly (${Math.round(or.height)}px tall): "${txt}"`;
              break;
            }
          }
        }
      }

      // 12. Open Sheet bounds & footer visibility
      let sheetIssue = null;
      if (checkSheet) {
        const sheets = Array.from(document.querySelectorAll(".mt-sheet")).filter(visible);
        if (sheets.length === 0) {
          sheetIssue = "No visible .mt-sheet found";
        } else {
          const sheet = sheets[sheets.length - 1];
          const sr = sheet.getBoundingClientRect();
          if (sr.top < -2 || sr.bottom > vpH + 2 || sr.left < -2 || sr.right > vpW + 2) {
            sheetIssue = `Sheet out of viewport ${vpW}x${vpH}: top=${Math.round(sr.top)}, bottom=${Math.round(sr.bottom)}, left=${Math.round(sr.left)}, right=${Math.round(sr.right)}`;
          }
          const footer = sheet.querySelector(".mt-sheet-footer");
          if (footer && visible(footer)) {
            const fr = footer.getBoundingClientRect();
            if (fr.bottom > vpH + 2) {
              sheetIssue = `Sheet footer clipped below viewport: bottom=${Math.round(fr.bottom)} > ${vpH}`;
            }
          }
          if (vpW >= 1000) {
            const sheetCenter = sr.left + sr.width / 2;
            if (Math.abs(sheetCenter - vpW / 2) > 20) {
              sheetIssue = `Desktop sheet not centered: center=${Math.round(sheetCenter)} vs ${vpW / 2}`;
            }
          }
        }
      }

      // 13. Desktop phone canvas centering
      let desktopCenterIssue = null;
      if (vpW >= 1000) {
        const shell = document.querySelector(".app-shell");
        const nav = document.querySelector(".bottom-nav");
        if (shell) {
          const sr = shell.getBoundingClientRect();
          const c = sr.left + sr.width / 2;
          if (Math.abs(c - vpW / 2) > 20) {
            desktopCenterIssue = `.app-shell center ${Math.round(c)} vs ${vpW / 2}`;
          }
        }
        if (nav && visible(nav)) {
          const nr = nav.getBoundingClientRect();
          const c = nr.left + nr.width / 2;
          if (Math.abs(c - vpW / 2) > 20) {
            desktopCenterIssue = `.bottom-nav center ${Math.round(c)} vs ${vpW / 2}`;
          }
        }
      }

      return {
        hasManrope,
        hasInter,
        docScrollW,
        innerW,
        sheetBodyOverflow,
        nativeSelectCount,
        badTokens,
        englishLeaks,
        clippedPlaceholders,
        smallInputs,
        alignmentIssues,
        rowOverlaps,
        iconCenterIssues,
        toastOverlaps,
        siblingCollisions,
        clippedTexts,
        wrappedSegments,
        dropdownIssue,
        sheetIssue,
        desktopCenterIssue,
      };
    },
    {
      vpW: vp.width,
      vpH: vp.height,
      checkSheet: isSheet,
      expectDD: expectDropdown,
      allowBrandWords: allowBrands,
    }
  );

  let ok = true;
  if (!data.hasManrope || !data.hasInter) {
    finding(
      "P1",
      label,
      `Web fonts missing (Manrope=${data.hasManrope}, Inter=${data.hasInter})`
    );
    ok = false;
  }
  if (data.docScrollW > data.innerW + 1) {
    finding(
      "P0",
      label,
      `Horizontal overflow: scrollWidth=${data.docScrollW} > innerWidth=${data.innerW}`
    );
    ok = false;
  }
  if (data.sheetBodyOverflow.length) {
    finding(
      "P1",
      label,
      `Sheet body horizontal overflow: ${JSON.stringify(data.sheetBodyOverflow)}`
    );
    ok = false;
  }
  if (data.nativeSelectCount > 0) {
    finding("P0", label, `Found ${data.nativeSelectCount} native <select> element(s)!`);
    ok = false;
  }
  if (data.badTokens.length) {
    finding("P0", label, `Broken JS tokens: ${data.badTokens.join(", ")}`);
    ok = false;
  }
  if (data.englishLeaks.length) {
    finding("P1", label, `English/Latin leaks: ${data.englishLeaks.join(", ")}`);
    ok = false;
  }
  if (data.clippedPlaceholders.length) {
    for (const cp of data.clippedPlaceholders) {
      finding(
        "P1",
        label,
        `Placeholder clipped (${cp.textW}px > ${cp.availW}px inner) on [${cp.inputId}]: "${cp.placeholder}"`
      );
    }
    ok = false;
  }
  if (data.smallInputs.length) {
    finding("P1", label, `Inputs < 16px: ${JSON.stringify(data.smallInputs)}`);
    ok = false;
  }
  if (data.alignmentIssues.length) {
    finding("P1", label, `Alignment drift (>1.5px): ${data.alignmentIssues.join(" | ")}`);
    ok = false;
  }
  if (data.rowOverlaps.length) {
    finding("P0", label, `Consecutive ListRow overlap: ${JSON.stringify(data.rowOverlaps)}`);
    ok = false;
  }
  if (data.iconCenterIssues.length) {
    finding(
      "P2",
      label,
      `Icon-text vertical center offset > 3.5px: ${JSON.stringify(data.iconCenterIssues)}`
    );
    ok = false;
  }
  if (allowToast && data.toastOverlaps.length) {
    finding("P1", label, `Toast overlaps UI: ${JSON.stringify(data.toastOverlaps)}`);
    ok = false;
  }
  if (data.siblingCollisions.length) {
    finding("P1", label, `Sibling collision: ${JSON.stringify(data.siblingCollisions)}`);
    ok = false;
  }
  if (data.clippedTexts.length) {
    finding("P1", label, `Clipped text: ${JSON.stringify(data.clippedTexts)}`);
    ok = false;
  }
  if (data.wrappedSegments.length) {
    finding("P1", label, `Wrapped SegmentedControl: ${JSON.stringify(data.wrappedSegments)}`);
    ok = false;
  }
  if (data.dropdownIssue) {
    finding("P1", label, data.dropdownIssue);
    ok = false;
  }
  if (data.sheetIssue) {
    finding("P0", label, data.sheetIssue);
    ok = false;
  }
  if (data.desktopCenterIssue) {
    finding("P1", label, data.desktopCenterIssue);
    ok = false;
  }

  if (ok) {
    pass(label, `${vp.width}×${vp.height}`);
  }
  return data;
}

/**
 * Helper to open every visible SelectField inside a container (or page), audit popover bounds, screenshot, and close it.
 */
async function auditAllSelectFieldsInScope(
  page,
  scopeLocator,
  prefix,
  { takeSnap = true } = {}
) {
  const triggers = scopeLocator.locator(".mt-select-trigger");
  const count = await triggers.count();
  for (let i = 0; i < count; i++) {
    const trig = triggers.nth(i);
    if (!(await trig.isVisible())) continue;
    await trig.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const idOrLabel =
      (await trig.getAttribute("id")) ||
      (await trig.getAttribute("aria-label")) ||
      `dd_${i + 1}`;
    await trig.click();
    await page.waitForTimeout(200);
    await auditState(page, `${prefix} :: Dropdown [${idOrLabel}]`, {
      isSheet: (await page.locator(".mt-sheet").count()) > 0,
      expectDropdown: true,
    });
    if (takeSnap) {
      const safeName = `${prefix}_dd_${i + 1}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      await snap(page, `${safeName}.png`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  return count;
}

/**
 * Run a full exhaustive viewport sweep!
 */
async function runViewportSweep(browser, { tag, width, height, fullModals }) {
  console.log(`\n=== [${tag}] Viewport ${width}×${height} (fullModals=${fullModals}) ===`);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: width < 500 ? 2 : 1,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const httpErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      httpErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // =========================================================================
  // TAB 1: СЕГОДНЯ (Today)
  // =========================================================================
  await auditState(page, `${tag}/01_today`);
  await snap(page, `${tag}_01_today.png`, true);

  if (fullModals) {
    // Modal 1: PwaInstallGuide
    await page.locator('button[aria-label="На экран «Домой»"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M01_PwaInstallGuide`, {
      isSheet: true,
      allowBrands: true,
    });
    await snap(page, `${tag}_m01_pwa_guide.png`);
    await closeAllSheets(page);

    // Modal 2: YearReviewSheet
    await page.locator('button[aria-label="Итоги года"]').click();
    await page.waitForTimeout(350);
    await auditState(page, `${tag}/M02_YearReviewSheet`, { isSheet: true });
    await snap(page, `${tag}_m02_year_review.png`);
    await closeAllSheets(page);

    // Modal 3: NotificationsSheet + ALL 4 SelectField dropdowns!
    await page.locator('button[aria-label="Уведомления"]').click();
    await page.waitForTimeout(350);
    await auditState(page, `${tag}/M03_NotificationsSheet`, { isSheet: true });
    await snap(page, `${tag}_m03_notifications.png`);
    const notifSheet = page.locator(".mt-sheet").last();
    await auditAllSelectFieldsInScope(page, notifSheet, `${tag}_m03_notif`, {
      takeSnap: true,
    });
    // Also trigger save inside NotificationsSheet (saves + closes sheet and shows toast cleanly above bottom nav!)
    const saveNotifBtn = notifSheet.locator("button", { hasText: "Сохранить расписание" });
    if (await saveNotifBtn.count()) {
      await saveNotifBtn.click();
      await page.waitForTimeout(300);
      await auditState(page, `${tag}/M03_NotificationsSheet_saved_toast`, {
        isSheet: false,
      });
      await snap(page, `${tag}_m03_notifications_toast.png`);
    } else {
      finding("P0", `${tag}/M03_NotificationsSheet`, "Save button 'Сохранить расписание' not found");
    }
    await closeAllSheets(page);

    // Modal 4a: TaskFormSheet (Create) + SelectField dropdown
    await page.locator('button[aria-label="Добавить задачу"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M04a_TaskFormSheet_new`, { isSheet: true });
    await snap(page, `${tag}_m04a_task_new.png`);
    await auditAllSelectFieldsInScope(
      page,
      page.locator(".mt-sheet").last(),
      `${tag}_m04_task`,
      { takeSnap: true }
    );
    await closeAllSheets(page);

    // Modal 4b: TaskFormSheet (Edit existing task)
    const firstTaskRow = page
      .locator('section[aria-label="Задачи на день"] .mt-list-row .mt-list-body')
      .first();
    if (await firstTaskRow.count()) {
      await firstTaskRow.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M04b_TaskFormSheet_edit`, { isSheet: true });
      await snap(page, `${tag}_m04b_task_edit.png`);
      await closeAllSheets(page);
    } else {
      finding("P0", `${tag}/M04b_TaskFormSheet_edit`, "No task row found to test Edit modal");
    }

    // Modal 5: Выполнено за день
    await page
      .locator('section[aria-label="Итоги дня"] .mt-list-row', {
        hasText: "Выполнено за день",
      })
      .click();
    await page.waitForTimeout(300);
    await auditState(page, `${tag}/M05_CompletedFeed`, { isSheet: true });
    await snap(page, `${tag}_m05_completed_feed.png`);
    await closeAllSheets(page);

    // Modal 6: Итог дня и заметка
    await page
      .locator('section[aria-label="Итоги дня"] .mt-list-row', {
        hasText: "Итог дня и заметка",
      })
      .click();
    await page.waitForTimeout(300);
    await auditState(page, `${tag}/M06_DailySummary`, { isSheet: true });
    await snap(page, `${tag}_m06_daily_summary.png`);
    await closeAllSheets(page);

    // Modal 7a: Дневник благодарностей + toast check + 7b: Edit gratitude!
    await page
      .locator('section[aria-label="Итоги дня"] .mt-list-row', {
        hasText: "Дневник благодарностей",
      })
      .click();
    await page.waitForTimeout(320);
    await auditState(page, `${tag}/M07a_GratitudeJournal`, { isSheet: true });
    await snap(page, `${tag}_m07a_gratitude_journal.png`);
    // Add one entry inside journal to verify toast vs open sheet!
    const gratInput = page.locator(".mt-sheet textarea, .mt-sheet input[type='text']").first();
    if (await gratInput.count()) {
      await gratInput.fill("Тёплый утренний свет");
      const addGratBtn = page.locator('.mt-sheet button[type="submit"]').first();
      if (await addGratBtn.count()) {
        await addGratBtn.click();
        await page.waitForTimeout(280);
        await auditState(page, `${tag}/M07a_GratitudeJournal_with_toast`, {
          isSheet: true,
        });
        await snap(page, `${tag}_m07a_gratitude_toast.png`);
      }
    }
    // Click first gratitude entry inside journal to open Edit gratitude sheet (M07b)!
    const firstGratEntry = page
      .locator(".mt-sheet .mt-group-list .mt-list-row")
      .first();
    if (await firstGratEntry.count()) {
      await firstGratEntry.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M07b_GratitudeEdit`, { isSheet: true });
      await snap(page, `${tag}_m07b_gratitude_edit.png`);
    }
    await closeAllSheets(page);
  }

  // =========================================================================
  // TAB 2: ЗДОРОВЬЕ (Привычки / Тренировки / Цикл)
  // =========================================================================
  await clickBottomTab(page, "Здоровье");
  await auditState(page, `${tag}/02_health_habits`);
  await snap(page, `${tag}_02_health_habits.png`, true);

  if (fullModals) {
    // Modal 8: WaterGoalAndLogs
    await page.locator('button[aria-label="Цель и записи воды"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M08_WaterGoalAndLogs`, { isSheet: true });
    await snap(page, `${tag}_m08_water.png`);
    await closeAllSheets(page);

    // Modal 9a: HabitForm (Create)
    await page.locator('button[aria-label="Добавить привычку или витамин"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M09a_HabitForm_new`, { isSheet: true });
    await snap(page, `${tag}_m09a_habit_new.png`);
    await closeAllSheets(page);

    // Modal 9b: HabitForm (Edit)
    const firstHabitRow = page.locator(".mt-group-list .mt-list-row .mt-list-body").first();
    if (await firstHabitRow.count()) {
      await firstHabitRow.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M09b_HabitForm_edit`, { isSheet: true });
      await snap(page, `${tag}_m09b_habit_edit.png`);
      await closeAllSheets(page);
    } else {
      finding("P0", `${tag}/M09b_HabitForm_edit`, "No habit row found to test Edit modal");
    }
  }

  // Sub-tab 2b: Тренировки
  await clickSegment(page, "Тренировки");
  await auditState(page, `${tag}/03_health_workouts`);
  await snap(page, `${tag}_03_health_workouts.png`, true);

  if (fullModals) {
    // Modal 10: PracticeTimerSheet
    await page.locator("button", { hasText: "Таймер" }).first().click();
    await page.waitForTimeout(300);
    await auditState(page, `${tag}/M10_PracticeTimerSheet`, { isSheet: true });
    await snap(page, `${tag}_m10_timer.png`);
    await closeAllSheets(page);

    // Modal 11: WorkoutDetail (log a workout first if history empty, or click existing history item)
    let workoutRow = page
      .locator('section[aria-label="История тренировок за 30 дней"] .mt-list-row')
      .first();
    if (!(await workoutRow.count())) {
      await page.locator("button", { hasText: "Отметить" }).first().click();
      await page.waitForTimeout(350);
      workoutRow = page
        .locator('section[aria-label="Тренировки выбранного дня"] .mt-list-row')
        .first();
    }
    if (await workoutRow.count()) {
      await workoutRow.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M11_WorkoutDetail`, { isSheet: true });
      await snap(page, `${tag}_m11_workout_detail.png`);
      await closeAllSheets(page);
    }
  }

  // Sub-tab 2c: Цикл
  await clickSegment(page, "Цикл");
  await auditState(page, `${tag}/04_health_cycle`);
  await snap(page, `${tag}_04_health_cycle.png`, true);

  if (fullModals) {
    // Modal 12: CycleSettings
    await page.locator('button[aria-label="Настройки длительности цикла"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M12_CycleSettings`, { isSheet: true });
    await snap(page, `${tag}_m12_cycle_settings.png`);
    await closeAllSheets(page);

    // Modal 13: CycleMonthPicker
    await page.locator('button[aria-label="Выбрать месяц и год"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M13_CycleMonthPicker`, { isSheet: true });
    await snap(page, `${tag}_m13_cycle_month_picker.png`);
    await closeAllSheets(page);

    // Modal 14: CycleDayEditor
    const firstCalDay = page.locator(".cycle-cal-grid button:not(.is-outside)").first();
    if (await firstCalDay.count()) {
      await firstCalDay.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M14_CycleDayEditor`, { isSheet: true });
      await snap(page, `${tag}_m14_cycle_day.png`);
      await closeAllSheets(page);
    } else {
      finding("P0", `${tag}/M14_CycleDayEditor`, "No cycle calendar day button found");
    }
  }

  // =========================================================================
  // TAB 3: ПИТАНИЕ (Рацион / Меню / Покупки)
  // =========================================================================
  await clickBottomTab(page, "Питание");
  await auditState(page, `${tag}/05_nutrition_ration`);
  await snap(page, `${tag}_05_nutrition_ration.png`, true);

  if (fullModals) {
    // Modal 15a: MealPickerSheet (Из меню)
    await page.locator('button[aria-label^="Добавить в"]').first().click();
    await page.waitForTimeout(300);
    await auditState(page, `${tag}/M15a_MealPicker_menu`, { isSheet: true });
    await snap(page, `${tag}_m15a_meal_picker_menu.png`);

    // Modal 15b: MealPickerSheet (Своё блюдо) + SelectField dropdown!
    const customTabBtn = page
      .locator(".mt-sheet .mt-segmented-btn", { hasText: "Своё" })
      .first();
    if (await customTabBtn.count()) {
      await customTabBtn.click();
      await page.waitForTimeout(260);
      await auditState(page, `${tag}/M15b_MealPicker_custom`, { isSheet: true });
      await snap(page, `${tag}_m15b_meal_picker_custom.png`);
      await auditAllSelectFieldsInScope(
        page,
        page.locator(".mt-sheet").last(),
        `${tag}_m15_meal`,
        { takeSnap: true }
      );
    }
    await closeAllSheets(page);

    // Modal 15c: MealPickerSheet (Edit existing logged meal)
    const loggedMealRow = page
      .locator('section[aria-label="Завтрак"] .mt-list-row, .meal-slot-card .mt-list-row')
      .first();
    if (await loggedMealRow.count()) {
      await loggedMealRow.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M15c_MealPicker_edit`, { isSheet: true });
      await snap(page, `${tag}_m15c_meal_edit.png`);
      await closeAllSheets(page);
    }
  }

  // Sub-tab 3b: Меню
  await clickSegment(page, "Меню");
  await auditState(page, `${tag}/06_nutrition_menu`);
  await snap(page, `${tag}_06_nutrition_menu.png`, true);

  if (fullModals) {
    // Modal 16a: MenuItemFormSheet (Create)
    const addMenuBtn = page
      .locator(".mt-page-header-actions button")
      .first();
    if (await addMenuBtn.count()) {
      await addMenuBtn.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M16a_MenuItemForm_new`, { isSheet: true });
      await snap(page, `${tag}_m16a_menu_new.png`);
      await closeAllSheets(page);
    }

    // Modal 16b: MenuItemFormSheet (Edit existing menu dish)
    const firstMenuDish = page
      .locator('section[aria-label^="Меню:"] .mt-list-row .mt-list-body')
      .first();
    if (await firstMenuDish.count()) {
      await firstMenuDish.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M16b_MenuItemForm_edit`, { isSheet: true });
      await snap(page, `${tag}_m16b_menu_edit.png`);
      await closeAllSheets(page);
    } else {
      finding("P0", `${tag}/M16b_MenuItemForm_edit`, "No menu dish row found to test Edit modal");
    }
  }

  // Sub-tab 3c: Покупки (Продукты)
  await clickSegment(page, "Покупки");
  await auditState(page, `${tag}/07_nutrition_shopping`);
  await snap(page, `${tag}_07_nutrition_shopping.png`, true);

  // =========================================================================
  // TAB 4: ДОМ (Уборка / Покупки)
  // =========================================================================
  await clickBottomTab(page, "Дом");
  await auditState(page, `${tag}/08_home_chores`);
  await snap(page, `${tag}_08_home_chores.png`, true);

  if (fullModals) {
    // Modal 17a: ChoreSheet (Create)
    await page.locator('button[aria-label="Новое дело"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M17a_ChoreSheet_new`, { isSheet: true });
    await snap(page, `${tag}_m17a_chore_new.png`);
    await closeAllSheets(page);

    // Modal 17b: ChoreSheet (Edit)
    const firstChoreRow = page.locator(".mt-group-list .mt-list-row .mt-list-body").first();
    if (await firstChoreRow.count()) {
      await firstChoreRow.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M17b_ChoreSheet_edit`, { isSheet: true });
      await snap(page, `${tag}_m17b_chore_edit.png`);
      await closeAllSheets(page);
    } else {
      finding("P0", `${tag}/M17b_ChoreSheet_edit`, "No chore row found to test Edit modal");
    }
  }

  // Sub-tab 4b: Дом -> Покупки (Хозтовары)
  await clickSegment(page, "Покупки");
  await auditState(page, `${tag}/09_home_shopping`);
  await snap(page, `${tag}_09_home_shopping.png`, true);

  // =========================================================================
  // TAB 5: ЦЕЛИ (Цели / Желания / Календарь)
  // =========================================================================
  await clickBottomTab(page, "Цели");
  await auditState(page, `${tag}/10_goals_goals`);
  await snap(page, `${tag}_10_goals_goals.png`, true);

  // Open GoalsSection category filter SelectField on ALL viewports!
  await auditAllSelectFieldsInScope(
    page,
    page.locator('section[aria-label="Цели"]'),
    `${tag}_goals_filter`,
    { takeSnap: true }
  );

  if (fullModals) {
    // Modal 18: GoalDetailSheet + BOTH milestone SelectField dropdowns!
    const firstGoalCard = page.locator(".goal-card").first();
    if (await firstGoalCard.count()) {
      await firstGoalCard.click();
      await page.waitForTimeout(320);
      await auditState(page, `${tag}/M18_GoalDetailSheet`, { isSheet: true });
      await snap(page, `${tag}_m18_goal_detail.png`);

      const detailSheet = page.locator(".mt-sheet").last();
      // Reveal milestone form via "+ Веха" toggle button
      const addMsToggle = detailSheet.locator("button", { hasText: "Веха" }).first();
      if (await addMsToggle.count()) {
        await addMsToggle.click();
        await page.waitForTimeout(220);
      }
      const detailDdCount = await auditAllSelectFieldsInScope(
        page,
        detailSheet,
        `${tag}_m18_goal_detail`,
        { takeSnap: true }
      );
      if (detailDdCount < 2) {
        finding(
          "P0",
          `${tag}/M18_GoalDetailSheet`,
          `Expected 2 milestone SelectFields inside GoalDetailSheet, found ${detailDdCount}`
        );
      }

      // Modal 20: GoalCheckinSheet (from GoalDetailSheet -> Чек-ин)
      const checkinBtn = detailSheet.locator("button", { hasText: "Чек-ин" }).first();
      if (await checkinBtn.count()) {
        await checkinBtn.click();
        await page.waitForTimeout(280);
        await auditState(page, `${tag}/M20_GoalCheckinSheet`, { isSheet: true });
        await snap(page, `${tag}_m20_goal_checkin.png`);
        await closeAllSheets(page);
      } else {
        finding("P0", `${tag}/M20_GoalCheckinSheet`, "Check-in button not found");
      }

      // Modal 19c: GoalFormSheet (Edit mode via re-opening GoalDetailSheet -> Редактировать)
      await page.locator(".goal-card").first().click();
      await page.waitForTimeout(280);
      const editGoalBtn = page
        .locator(".mt-sheet button", { hasText: "Редактировать" })
        .first();
      if (await editGoalBtn.count()) {
        await editGoalBtn.click();
        await page.waitForTimeout(300);
        await auditState(page, `${tag}/M19c_GoalFormSheet_edit`, { isSheet: true });
        await snap(page, `${tag}_m19c_goal_edit.png`);
      } else {
        finding("P0", `${tag}/M19c_GoalFormSheet_edit`, "Edit goal button not found");
      }
      await closeAllSheets(page);
    }

    // Modal 19a & 19b: GoalFormSheet (Create 1 год / 5 лет AND 1 месяц) + ALL 5 SelectField dropdowns!
    await page.locator('button[aria-label="Новая цель"]').click();
    await page.waitForTimeout(300);
    await auditState(page, `${tag}/M19a_GoalFormSheet_1y5y`, { isSheet: true });
    await snap(page, `${tag}_m19a_goal_new_1y.png`);
    const goalFormSheet = page.locator(".mt-sheet").last();
    // Switch to 1 месяц so ALL 5 SelectFields (parent, category, habit, ms-month, ms-year) exist!
    await goalFormSheet.locator(".mt-pill", { hasText: "1 месяц" }).click();
    await page.waitForTimeout(250);
    await auditState(page, `${tag}/M19b_GoalFormSheet_1m`, { isSheet: true });
    await snap(page, `${tag}_m19b_goal_new_1m.png`);
    await auditAllSelectFieldsInScope(page, goalFormSheet, `${tag}_m19_goal_form`, {
      takeSnap: true,
    });
    await closeAllSheets(page);
  } else {
    // On ip14 & desk, also open GoalFormSheet (1m) and NotificationsSheet to verify desktop/ip14 sheet & dropdown centering!
    await page.locator('button[aria-label="Новая цель"]').click();
    await page.waitForTimeout(300);
    const goalFormSheet = page.locator(".mt-sheet").last();
    await goalFormSheet.locator(".mt-pill", { hasText: "1 месяц" }).click();
    await page.waitForTimeout(220);
    await auditState(page, `${tag}/M19b_GoalFormSheet_1m`, { isSheet: true });
    await snap(page, `${tag}_m19b_goal_new_1m.png`);
    await auditAllSelectFieldsInScope(page, goalFormSheet, `${tag}_m19_goal_form`, {
      takeSnap: false,
    });
    await closeAllSheets(page);
  }

  // Sub-tab 5b: Желания (WishesTab)
  await clickSegment(page, "Желания");
  await auditState(page, `${tag}/11_goals_wishes`);
  await snap(page, `${tag}_11_goals_wishes.png`, true);

  // Open WishesTab category filter SelectField
  await auditAllSelectFieldsInScope(
    page,
    page.locator('section[aria-label="Цели"]'),
    `${tag}_wishes_filter`,
    { takeSnap: fullModals }
  );

  if (fullModals) {
    // Modal 21a: WishFormSheet (Create) + BOTH SelectFields (year + category)
    await page.locator('button[aria-label="Новое желание"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M21a_WishFormSheet_new`, { isSheet: true });
    await snap(page, `${tag}_m21a_wish_new.png`);
    await auditAllSelectFieldsInScope(
      page,
      page.locator(".mt-sheet").last(),
      `${tag}_m21_wish`,
      { takeSnap: true }
    );
    await closeAllSheets(page);

    // Modal 21b: WishFormSheet (Edit)
    const firstWishRow = page.locator(".mt-group-list .mt-list-row .mt-list-body").first();
    if (await firstWishRow.count()) {
      await firstWishRow.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M21b_WishFormSheet_edit`, { isSheet: true });
      await snap(page, `${tag}_m21b_wish_edit.png`);
      await closeAllSheets(page);
    } else {
      finding("P0", `${tag}/M21b_WishFormSheet_edit`, "No wish row found to test Edit modal");
    }
  }

  // Sub-tab 5c: Календарь (EventsCalendarTab)
  await clickSegment(page, "Календарь");
  await auditState(page, `${tag}/12_goals_calendar`);
  await snap(page, `${tag}_12_goals_calendar.png`, true);

  if (fullModals) {
    // Modal 22a: EventFormSheet (Create)
    await page.locator('button[aria-label="Новое событие"]').click();
    await page.waitForTimeout(280);
    await auditState(page, `${tag}/M22a_EventFormSheet_new`, { isSheet: true });
    await snap(page, `${tag}_m22a_event_new.png`);
    await closeAllSheets(page);

    // Modal 22b: EventFormSheet (Edit existing seeded event)
    const firstEventRow = page
      .locator(".mt-group-list .mt-list-row .mt-list-body")
      .first();
    if (await firstEventRow.count()) {
      await firstEventRow.click();
      await page.waitForTimeout(280);
      await auditState(page, `${tag}/M22b_EventFormSheet_edit`, { isSheet: true });
      await snap(page, `${tag}_m22b_event_edit.png`);
      await closeAllSheets(page);
    } else {
      finding("P0", `${tag}/M22b_EventFormSheet_edit`, "No event row found to test Edit modal");
    }
  }

  // Runtime error assertions
  if (consoleErrors.length) {
    finding("P0", `${tag}/console`, consoleErrors.join(" | "));
  } else {
    pass(`${tag}/console`, "0 console errors");
  }
  if (pageErrors.length) {
    finding("P0", `${tag}/pageerror`, pageErrors.join(" | "));
  } else {
    pass(`${tag}/pageerror`, "0 uncaught page errors");
  }
  if (httpErrors.length) {
    finding("P0", `${tag}/http`, httpErrors.join(" | "));
  } else {
    pass(`${tag}/http`, "0 HTTP >= 400 errors");
  }

  await context.close();
}

async function main() {
  let browser;
  try {
    console.log("Waiting for temp audit server on", BASE_URL);
    await waitForServer();
    console.log("Temp audit server ready.");

    browser = await chromium.launch({
      headless: true,
      executablePath: "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    await runViewportSweep(browser, {
      tag: "ip13",
      width: 390,
      height: 844,
      fullModals: true,
    });
    await runViewportSweep(browser, {
      tag: "ip14",
      width: 393,
      height: 852,
      fullModals: false,
    });
    await runViewportSweep(browser, {
      tag: "desk",
      width: 1280,
      height: 900,
      fullModals: false,
    });

    const reportPath = path.join(ARTIFACTS_DIR, "report.json");
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          passed: passes.length,
          findingsCount: findings.length,
          screenshotsCount: screenshots.length,
          findings,
          passes,
          screenshots,
        },
        null,
        2
      )
    );

    console.log(
      `\n========================================================\nGLOBAL GOAL AUDIT SUMMARY: ${passes.length} passed, ${findings.length} findings, ${screenshots.length} screenshots\nReport saved to: ${reportPath}\n========================================================`
    );
    if (findings.length > 0) {
      for (const f of findings) {
        console.error(`  - [${f.severity}] ${f.area}: ${f.detail}`);
      }
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverProc && !serverProc.killed) {
      serverProc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 400));
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
