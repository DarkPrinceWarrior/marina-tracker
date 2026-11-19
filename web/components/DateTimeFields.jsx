import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import {
  MONTH_GENITIVE_RU,
  MONTH_NAMES_RU,
  MONTH_SHORT_RU,
  WEEKDAY_SHORT_RU,
  getMonthMatrix,
  nowTimeHHMM,
  pad2,
  parseISODate,
  shiftMonth,
  todayISO,
} from "../utils/date.js";

const HOURS_24 = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => pad2(i));

function formatDateFieldLabel(iso, compact = false) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const dt = parseISODate(iso);
  const d = dt.getDate();
  const m = dt.getMonth();
  const y = dt.getFullYear();
  if (compact) {
    return `${d} ${MONTH_SHORT_RU[m]} ${y}`;
  }
  return `${d} ${MONTH_GENITIVE_RU[m]} ${y}`;
}

function parseTimeParts(val) {
  const match = String(val || "")
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return { hh: match[1], mm: match[2] };
}

/**
 * Shared floating popover anchor hook matching SelectField's viewport-safe
 * portal positioning, scroll tracking, and Escape handling.
 */
function useAnchoredPopover({ open, setOpen, triggerRef, menuRef, panelWidth, panelHeight }) {
  const [menuStyle, setMenuStyle] = useState(null);
  const [placedAbove, setPlacedAbove] = useState(false);

  const closeMenu = useCallback(
    (returnFocus = false) => {
      setOpen(false);
      if (returnFocus) {
        window.requestAnimationFrame(() => {
          triggerRef.current?.focus();
        });
      }
    },
    [setOpen, triggerRef],
  );

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const gap = 6;

    const width = Math.min(vw - margin * 2, Math.max(rect.width, panelWidth));
    let left = rect.left;
    if (left + width > vw - margin) {
      left = rect.right - width;
    }
    left = Math.min(Math.max(margin, left), vw - margin - width);

    const spaceBelow = Math.max(0, vh - rect.bottom - margin - gap);
    const spaceAbove = Math.max(0, rect.top - margin - gap);
    const flipAbove =
      spaceBelow < panelHeight && spaceAbove > spaceBelow;

    setPlacedAbove(flipAbove);
    if (flipAbove) {
      setMenuStyle({
        position: "fixed",
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        bottom: `${Math.round(vh - rect.top + gap)}px`,
        maxHeight: `${Math.round(Math.min(vh - margin * 2, Math.max(200, spaceAbove)))}px`,
      });
    } else {
      setMenuStyle({
        position: "fixed",
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        top: `${Math.round(rect.bottom + gap)}px`,
        maxHeight: `${Math.round(Math.min(vh - margin * 2, Math.max(200, spaceBelow)))}px`,
      });
    }
  }, [triggerRef, panelWidth, panelHeight]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    return undefined;
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handleResize = () => closeMenu(false);
    const handleScroll = (event) => {
      if (menuRef.current && event.target && menuRef.current.contains(event.target)) {
        return;
      }
      const triggerEl = triggerRef.current;
      if (!triggerEl) {
        closeMenu(false);
        return;
      }
      const rect = triggerEl.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        closeMenu(false);
        return;
      }
      updatePosition();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      } else if (event.key === "Tab") {
        closeMenu(false);
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, closeMenu, updatePosition, menuRef, triggerRef]);

  return { menuStyle, placedAbove, closeMenu };
}

/**
 * Custom 2026 Carbon & Cobalt Russian Calendar Date Picker.
 * Replaces all stock <input type="date"> controls across the app.
 */
export function DateField({
  id,
  value = "",
  onChange,
  placeholder = "Выберите дату",
  ariaLabel,
  compact = false,
  clearable = false,
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [pickingMonthYear, setPickingMonthYear] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const dialogId = useId();

  const today = todayISO();
  const effectiveIso = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    ? value
    : today;

  const [viewYear, setViewYear] = useState(() => parseISODate(effectiveIso).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parseISODate(effectiveIso).getMonth() + 1);

  useEffect(() => {
    if (!open) return;
    const dt = parseISODate(effectiveIso);
    setViewYear(dt.getFullYear());
    setViewMonth(dt.getMonth() + 1);
    setPickingMonthYear(false);
  }, [open, effectiveIso]);

  const { menuStyle, placedAbove, closeMenu } = useAnchoredPopover({
    open,
    setOpen,
    triggerRef,
    menuRef,
    panelWidth: 304,
    panelHeight: 344,
  });

  const weeks = useMemo(
    () => getMonthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const displayLabel = formatDateFieldLabel(value, compact);

  const handleShiftMonth = (delta) => {
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  };

  const handleSelectDay = (iso) => {
    onChange?.(iso);
    closeMenu(true);
  };

  const popup =
    open && menuStyle ? (
      <>
        <div
          className="mt-select-backdrop"
          aria-hidden="true"
          onClick={() => closeMenu(true)}
        />
        <div
          ref={menuRef}
          id={dialogId}
          role="dialog"
          aria-label={ariaLabel || "Выбор даты"}
          className={`mt-picker-popover${placedAbove ? " is-above" : ""}`}
          style={menuStyle}
        >
          <div className="mt-picker-head">
            <button
              type="button"
              className="mt-picker-nav"
              aria-label={pickingMonthYear ? "Предыдущий год" : "Предыдущий месяц"}
              onClick={() =>
                pickingMonthYear
                  ? setViewYear((y) => Math.max(2020, y - 1))
                  : handleShiftMonth(-1)
              }
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              className={`mt-picker-month-btn${pickingMonthYear ? " is-active" : ""}`}
              onClick={() => setPickingMonthYear((prev) => !prev)}
              aria-label="Выбрать месяц и год"
            >
              <span>
                {pickingMonthYear
                  ? `${viewYear} год`
                  : `${MONTH_NAMES_RU[viewMonth - 1]} ${viewYear}`}
              </span>
              <ChevronDown
                size={14}
                className={`mt-picker-month-chevron${pickingMonthYear ? " is-open" : ""}`}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              className="mt-picker-nav"
              aria-label={pickingMonthYear ? "Следующий год" : "Следующий месяц"}
              onClick={() =>
                pickingMonthYear
                  ? setViewYear((y) => Math.min(2040, y + 1))
                  : handleShiftMonth(1)
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {pickingMonthYear ? (
            <div className="mt-picker-months" role="grid" aria-label="Месяцы года">
              {MONTH_SHORT_RU.map((shortName, idx) => {
                const mNum = idx + 1;
                const isSelected = mNum === viewMonth;
                return (
                  <button
                    key={shortName}
                    type="button"
                    className={`mt-picker-month-cell${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      setViewMonth(mNum);
                      setPickingMonthYear(false);
                    }}
                  >
                    {shortName.charAt(0).toUpperCase() + shortName.slice(1)}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="mt-picker-weekdays" aria-hidden="true">
                {WEEKDAY_SHORT_RU.map((wd) => (
                  <span key={wd}>{wd}</span>
                ))}
              </div>
              <div className="mt-picker-days" role="grid" aria-label="Календарь">
                {weeks.flat().map((cell) => {
                  const isSelected = cell.iso === value;
                  const isToday = cell.iso === today;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      className={[
                        "mt-picker-day tabular",
                        cell.inMonth ? "" : "is-outside",
                        isToday ? "is-today" : "",
                        isSelected ? "is-selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-pressed={isSelected}
                      aria-label={formatDateFieldLabel(cell.iso, false)}
                      onClick={() => handleSelectDay(cell.iso)}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-picker-footer">
            <button
              type="button"
              className="mt-picker-foot-btn is-accent"
              onClick={() => handleSelectDay(today)}
            >
              Сегодня
            </button>
            <div className="mt-row" style={{ gap: "4px" }}>
              {clearable && value ? (
                <button
                  type="button"
                  className="mt-picker-foot-btn"
                  onClick={() => {
                    onChange?.("");
                    closeMenu(true);
                  }}
                >
                  Очистить
                </button>
              ) : null}
              <button
                type="button"
                className="mt-picker-foot-btn"
                onClick={() => closeMenu(true)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        data-picker="date"
        data-value={value || ""}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        className={[
          "mt-select-trigger",
          compact ? "mt-select-trigger--compact" : "",
          open ? "is-open" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <Calendar size={16} className="mt-picker-trigger-icon" aria-hidden="true" />
        <span
          className={`mt-select-value${displayLabel ? "" : " is-placeholder"}`}
        >
          {displayLabel || placeholder}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className="mt-select-chevron"
          aria-hidden="true"
        />
      </button>
      {popup && typeof document !== "undefined"
        ? createPortal(popup, document.body)
        : popup}
    </>
  );
}

/**
 * Custom 2026 Carbon & Cobalt 24-Hour Russian Time Picker.
 * Replaces all stock <input type="time"> controls across the app.
 */
export function TimeField({
  id,
  value = "",
  onChange,
  placeholder = "Время",
  ariaLabel,
  compact = false,
  clearable = false,
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);
  const dialogId = useId();

  const parsed = parseTimeParts(value);
  const fallbackNow = useMemo(() => parseTimeParts(nowTimeHHMM()) || { hh: "09", mm: "00" }, []);
  const activeHour = parsed ? parsed.hh : fallbackNow.hh;
  const activeMinute = parsed ? parsed.mm : fallbackNow.mm;

  const { menuStyle, placedAbove, closeMenu } = useAnchoredPopover({
    open,
    setOpen,
    triggerRef,
    menuRef,
    panelWidth: 232,
    panelHeight: 288,
  });

  useEffect(() => {
    if (!open) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      const centerSelected = (colEl) => {
        if (!colEl) return;
        const optEl = colEl.querySelector(".is-selected");
        if (!optEl) return;
        colEl.scrollTop = Math.max(
          0,
          optEl.offsetTop - (colEl.clientHeight - optEl.clientHeight) / 2,
        );
      };
      centerSelected(hourListRef.current);
      centerSelected(minuteListRef.current);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [open]);

  const handleSelectHour = (hh) => {
    const mm = parsed ? parsed.mm : "00";
    onChange?.(`${hh}:${mm}`);
  };

  const handleSelectMinute = (mm) => {
    const hh = parsed ? parsed.hh : activeHour;
    onChange?.(`${hh}:${mm}`);
  };

  const popup =
    open && menuStyle ? (
      <>
        <div
          className="mt-select-backdrop"
          aria-hidden="true"
          onClick={() => closeMenu(true)}
        />
        <div
          ref={menuRef}
          id={dialogId}
          role="dialog"
          aria-label={ariaLabel || "Выбор времени"}
          className={`mt-picker-popover mt-picker-popover--time${placedAbove ? " is-above" : ""}`}
          style={menuStyle}
        >
          <div className="mt-time-pop-head">
            <span className="mt-time-pop-display tabular">
              {parsed ? `${parsed.hh}:${parsed.mm}` : `${activeHour}:${activeMinute}`}
            </span>
            <span className="mt-time-pop-badge">24 ч</span>
          </div>

          <div className="mt-time-cols">
            <div className="mt-time-col-wrap">
              <span className="mt-time-col-label">Часы</span>
              <div
                ref={hourListRef}
                className="mt-time-col"
                role="listbox"
                aria-label="Часы"
              >
                {HOURS_24.map((hh) => {
                  const selected = parsed ? parsed.hh === hh : hh === activeHour;
                  return (
                    <button
                      key={hh}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`mt-time-opt tabular${selected ? " is-selected" : ""}`}
                      onClick={() => handleSelectHour(hh)}
                    >
                      {hh}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-time-col-wrap">
              <span className="mt-time-col-label">Минуты</span>
              <div
                ref={minuteListRef}
                className="mt-time-col"
                role="listbox"
                aria-label="Минуты"
              >
                {MINUTES_60.map((mm) => {
                  const selected = parsed ? parsed.mm === mm : mm === activeMinute;
                  return (
                    <button
                      key={mm}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`mt-time-opt tabular${selected ? " is-selected" : ""}`}
                      onClick={() => handleSelectMinute(mm)}
                    >
                      {mm}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-picker-footer">
            <button
              type="button"
              className="mt-picker-foot-btn is-accent"
              onClick={() => {
                onChange?.(nowTimeHHMM());
                closeMenu(true);
              }}
            >
              Сейчас
            </button>
            <div className="mt-row" style={{ gap: "4px" }}>
              {clearable && value ? (
                <button
                  type="button"
                  className="mt-picker-foot-btn"
                  onClick={() => {
                    onChange?.("");
                    closeMenu(true);
                  }}
                >
                  Очистить
                </button>
              ) : null}
              <button
                type="button"
                className="mt-picker-foot-btn is-done"
                onClick={() => closeMenu(true)}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      </>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        data-picker="time"
        data-value={value || ""}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        className={[
          "mt-select-trigger",
          compact ? "mt-select-trigger--compact mt-time-trigger--compact" : "",
          open ? "is-open" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <Clock
          size={compact ? 14 : 16}
          className="mt-picker-trigger-icon"
          aria-hidden="true"
        />
        <span
          className={`mt-select-value${parsed ? "" : " is-placeholder"}`}
        >
          {parsed ? `${parsed.hh}:${parsed.mm}` : placeholder}
        </span>
        {!compact ? (
          <ChevronDown
            size={16}
            strokeWidth={2}
            className="mt-select-chevron"
            aria-hidden="true"
          />
        ) : null}
      </button>
      {popup && typeof document !== "undefined"
        ? createPortal(popup, document.body)
        : popup}
    </>
  );
}

/**
 * Custom Carbon & Cobalt Range Slider (replaces stock browser range chrome).
 */
export function RangeField({
  id,
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  ariaLabel,
  disabled = false,
}) {
  const numVal = Number(value) || 0;
  const pct = max > min ? Math.min(100, Math.max(0, ((numVal - min) / (max - min)) * 100)) : 0;

  return (
    <div className="mt-range-wrap">
      <div className="mt-range-track" aria-hidden="true">
        <div className="mt-range-fill" style={{ width: `${pct}%` }} />
      </div>
      <input
        id={id}
        type="range"
        className="mt-range-input"
        min={min}
        max={max}
        step={step}
        value={numVal}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * Custom Carbon & Cobalt Checkbox Row (replaces stock <input type="checkbox">).
 */
export function CheckField({
  checked = false,
  onChange,
  label,
  icon = null,
  disabled = false,
  className = "",
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={[
        "mt-check-field",
        checked ? "is-checked" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onChange?.(!checked)}
    >
      <span className="mt-check-field-box" aria-hidden="true">
        {checked ? <Check size={14} strokeWidth={2.75} /> : null}
      </span>
      {icon ? <span className="mt-check-field-icon">{icon}</span> : null}
      <span className="mt-check-field-label">{label}</span>
    </button>
  );
}
