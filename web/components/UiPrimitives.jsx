import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
} from "lucide-react";
import Sheet from "./Sheet.jsx";
import { addDays, getWeekDays, todayISO } from "../utils/date.js";

/**
 * 2026 Minimalist single-row PageHeader.
 * Renders a crisp page title, optional compact inline subtitle/date, and right-aligned actions.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  secondaryAction,
  className = "",
}) {
  return (
    <header
      className={["mt-page-header", className].filter(Boolean).join(" ")}
    >
      <div className="mt-page-header-copy">
        <div className="mt-page-header-title-row">
          {title ? <h1 className="mt-page-title">{title}</h1> : null}
          {subtitle ? <span className="mt-page-meta">{subtitle}</span> : null}
        </div>
      </div>
      {secondaryAction || action ? (
        <div className="mt-page-header-actions">
          {secondaryAction}
          {action}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Backwards-compatible SectionHeader wrapper using the clean 2026 header geometry.
 */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  as = "h1",
  className = "",
}) {
  const Heading = as === "h2" ? "h2" : "h1";
  return (
    <header
      className={["mt-section-header", className].filter(Boolean).join(" ")}
    >
      <div className="mt-section-header-copy">
        {eyebrow ? <p className="mt-eyebrow">{eyebrow}</p> : null}
        {title ? <Heading className="mt-section-title">{title}</Heading> : null}
        {subtitle ? <p className="mt-card-sub">{subtitle}</p> : null}
      </div>
      {action ? <div className="mt-section-header-action">{action}</div> : null}
    </header>
  );
}

/**
 * 2026 iOS Grouped List header: crisp uppercase micro-label + optional meta + right action.
 */
export function GroupHeader({ title, meta, action, className = "" }) {
  return (
    <div className={["mt-group-header", className].filter(Boolean).join(" ")}>
      <div className="mt-group-header-left">
        <span className="mt-group-title">{title}</span>
        {meta ? <span className="mt-group-meta tabular">{meta}</span> : null}
      </div>
      {action ? <div className="mt-group-action">{action}</div> : null}
    </div>
  );
}

/**
 * 2026 iOS Grouped List container: single crisp white card with 1px hairlines between rows.
 */
export function GroupList({ children, className = "" }) {
  return (
    <div className={["mt-group-list", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/**
 * Unified 2026 ListRow used across Tasks, Habits, Vitamins, Meals, Chores, Shopping,
 * Cycle history, and Milestones. Guarantees razor-straight left alignment of title & meta.
 */
export function ListRow({
  checked,
  onToggle,
  title,
  meta,
  trailing,
  onClick,
  strikethrough = false,
  leading,
  accent = "cobalt",
  ariaToggleLabel,
  disabled = false,
  className = "",
}) {
  const isCheckable = typeof onToggle === "function";
  const isChecked = Boolean(checked);
  const rowClasses = [
    "mt-list-row",
    isChecked ? "is-checked" : "",
    strikethrough && isChecked ? "is-strikethrough" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (isCheckable) {
    const bodyClick = typeof onClick === "function" ? onClick : onToggle;
    return (
      <div className={rowClasses} data-accent={accent}>
        <button
          type="button"
          className="mt-list-check-btn"
          role="checkbox"
          aria-checked={isChecked}
          aria-label={
            ariaToggleLabel ||
            (typeof title === "string"
              ? `${isChecked ? "Снять отметку" : "Отметить"}: ${title}`
              : "Переключить")
          }
          disabled={disabled}
          onClick={() => onToggle()}
        >
          <span className="mt-list-check-box" aria-hidden="true">
            {isChecked ? <Check size={14} strokeWidth={2.8} /> : null}
          </span>
        </button>

        <button
          type="button"
          className="mt-list-body mt-list-body--clickable"
          disabled={disabled}
          onClick={() => bodyClick?.()}
        >
          <span className="mt-list-title">{title}</span>
          {meta ? <span className="mt-list-meta">{meta}</span> : null}
        </button>

        {trailing ? <div className="mt-list-trailing">{trailing}</div> : null}
      </div>
    );
  }

  if (typeof onClick === "function") {
    return (
      <button
        type="button"
        className={`${rowClasses} mt-list-row--clickable`}
        data-accent={accent}
        disabled={disabled}
        onClick={onClick}
      >
        {leading ? <span className="mt-list-leading">{leading}</span> : null}
        <span className="mt-list-body">
          <span className="mt-list-title">{title}</span>
          {meta ? <span className="mt-list-meta">{meta}</span> : null}
        </span>
        {trailing ? <span className="mt-list-trailing">{trailing}</span> : null}
      </button>
    );
  }

  return (
    <div className={rowClasses} data-accent={accent}>
      {leading ? <span className="mt-list-leading">{leading}</span> : null}
      <div className="mt-list-body">
        <span className="mt-list-title">{title}</span>
        {meta ? <span className="mt-list-meta">{meta}</span> : null}
      </div>
      {trailing ? <div className="mt-list-trailing">{trailing}</div> : null}
    </div>
  );
}

/**
 * Single crisp horizontal white bar with hairline vertical dividers.
 * items: [{ key?, label, value, tone?, onClick?, ariaLabel? }]
 */
export function MetricStrip({ items = [], className = "" }) {
  return (
    <div className={["mt-metric-strip", className].filter(Boolean).join(" ")}>
      {items.map((item, idx) => {
        const isInteractive = typeof item.onClick === "function";
        const Tag = isInteractive ? "button" : "div";
        return (
          <Tag
            key={item.key || item.label || idx}
            type={isInteractive ? "button" : undefined}
            className={[
              "mt-metric-cell",
              isInteractive ? "is-interactive" : "",
              item.tone ? `is-${item.tone}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={item.onClick}
            aria-label={item.ariaLabel}
          >
            <span className="mt-metric-value tabular">{item.value}</span>
            <span className="mt-metric-label">{item.label}</span>
          </Tag>
        );
      })}
    </div>
  );
}

/**
 * Slim 5px Cobalt progress bar + single-line label/meta header.
 */
export function CompactProgress({
  value = 0,
  max = 100,
  label,
  meta,
  tone = "cobalt",
  className = "",
}) {
  const numVal = Number(value) || 0;
  const numMax = Number(max) || 0;
  const pct =
    numMax > 0 ? Math.max(0, Math.min(100, (numVal / numMax) * 100)) : 0;

  return (
    <div
      className={["mt-compact-progress", className].filter(Boolean).join(" ")}
    >
      {label || meta ? (
        <div className="mt-compact-progress-head">
          <span className="mt-compact-progress-label">{label || ""}</span>
          {meta ? (
            <span className="mt-compact-progress-meta tabular">{meta}</span>
          ) : null}
        </div>
      ) : null}
      <div
        className="mt-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`mt-progress-fill is-${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Slim single-row 7-day DateStrip with inline prev/next week arrows.
 * Displays compact «Сегодня» return pill ONLY when viewing a different date.
 */
export function DateStrip({
  selectedDate,
  todayDate = todayISO(),
  onSelectDate,
  markers = {},
}) {
  const activeISO = selectedDate || todayDate;
  const days = getWeekDays(activeISO);
  const isNotToday = activeISO !== todayDate;

  return (
    <div className="mt-date-strip-wrap">
      <div className="mt-date-bar">
        <button
          type="button"
          className="mt-date-nav-btn"
          aria-label="Предыдущая неделя"
          onClick={() => onSelectDate?.(addDays(activeISO, -7))}
        >
          <ChevronLeft size={16} />
        </button>

        <div
          className="mt-date-strip"
          role="tablist"
          aria-label="Выбор дня недели"
        >
          {days.map((item) => {
            const isSelected = item.iso === activeISO;
            const isToday = item.iso === todayDate;
            const marker = markers?.[item.iso];
            return (
              <button
                key={item.iso}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={`${item.weekdayFull}, ${item.day}`}
                className={[
                  "mt-date-cell",
                  isSelected ? "is-selected" : "",
                  isToday ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelectDate?.(item.iso)}
              >
                <span className="mt-date-weekday">{item.weekdayShort}</span>
                <span className="mt-date-num tabular">{item.day}</span>
                <span
                  className={`mt-date-dot${marker ? ` is-${marker}` : ""}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="mt-date-nav-btn"
          aria-label="Следующая неделя"
          onClick={() => onSelectDate?.(addDays(activeISO, 7))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {isNotToday ? (
        <div className="mt-date-return-row">
          <button
            type="button"
            className="mt-pill mt-pill--cobalt"
            onClick={() => onSelectDate?.(todayDate)}
          >
            Вернуться на сегодня
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SegmentedControl({
  value,
  onChange,
  options = [],
}) {
  return (
    <div className="mt-segmented" role="tablist">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`mt-segmented-btn${isActive ? " is-active" : ""}`}
            onClick={() => onChange?.(option.value)}
          >
            <span className="mt-segmented-label">{option.label}</span>
            {typeof option.count === "number" && (
              <span className="mt-segmented-count tabular">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressRing({
  percent = 0,
  size = 64,
  strokeWidth = 6,
  color = "var(--cobalt)",
  label,
  sublabel,
}) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const displayLabel = label !== undefined ? label : `${Math.round(clamped)}%`;

  return (
    <div
      className="mt-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Прогресс: ${displayLabel}${sublabel ? ` ${sublabel}` : ""}`}
    >
      <svg
        className="mt-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className="mt-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          className="mt-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="mt-ring-label">
        <span className="mt-ring-value tabular">{displayLabel}</span>
        {sublabel ? <span className="mt-ring-sub">{sublabel}</span> : null}
      </div>
    </div>
  );
}

/**
 * Legacy CheckRow preserved for backwards compatibility; prefer ListRow inside GroupList.
 */
export function CheckRow({
  checked = false,
  onToggle,
  title,
  subtitle,
  accent = "cobalt",
  badge,
  trailing,
  strikethrough = false,
  disabled = false,
  className = "",
}) {
  return (
    <div
      className={[
        "mt-check-row",
        checked ? "is-checked" : "",
        strikethrough && checked ? "is-strikethrough" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-accent={accent}
    >
      <button
        type="button"
        className="mt-check-main"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onToggle?.()}
      >
        <span className="mt-check-box" aria-hidden="true">
          {checked ? <Check size={14} strokeWidth={2.75} /> : null}
        </span>
        <span className="mt-check-body">
          <span className="mt-check-title-row">
            <span className="mt-check-title">{title}</span>
            {badge ? <span className="mt-check-badge">{badge}</span> : null}
          </span>
          {subtitle ? <span className="mt-check-meta">{subtitle}</span> : null}
        </span>
      </button>
      {trailing ? <div className="mt-check-actions">{trailing}</div> : null}
    </div>
  );
}

export function Pill({
  tone = "neutral",
  active = false,
  onClick,
  icon,
  children,
  className = "",
  type = "button",
  ...rest
}) {
  const classes = [
    "mt-pill",
    `mt-pill--${tone}`,
    active ? "is-active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (typeof onClick === "function") {
    return (
      <button
        type={type}
        className={classes}
        aria-pressed={active || undefined}
        onClick={onClick}
        {...rest}
      >
        {icon ? <span className="mt-pill-icon">{icon}</span> : null}
        <span>{children}</span>
      </button>
    );
  }

  return (
    <span className={classes} {...rest}>
      {icon ? <span className="mt-pill-icon">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="mt-empty">
      {icon ? (
        <div className="mt-empty-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {title ? <p className="mt-card-title">{title}</p> : null}
      {description ? <p className="mt-card-sub">{description}</p> : null}
      {action ? <div className="mt-empty-action">{action}</div> : null}
    </div>
  );
}

export function FabButton({
  label = "Добавить",
  onClick,
  icon,
}) {
  const button = (
    <button
      type="button"
      className="mt-fab"
      aria-label={label}
      onClick={onClick}
    >
      {icon || <Plus size={20} strokeWidth={2.3} />}
      <span>{label}</span>
    </button>
  );
  return typeof document !== "undefined"
    ? createPortal(button, document.body)
    : button;
}

export function StepperPill({
  value,
  onDecrement,
  onIncrement,
  min = 0,
  max = Infinity,
  unit = "",
  label = "Изменить количество",
}) {
  const numVal = Number(value) || 0;
  return (
    <div className="mt-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="mt-stepper-btn"
        aria-label="Уменьшить"
        disabled={numVal <= min}
        onClick={onDecrement}
      >
        <Minus size={16} />
      </button>
      <span className="mt-stepper-val tabular">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
      <button
        type="button"
        className="mt-stepper-btn"
        aria-label="Увеличить"
        disabled={numVal >= max}
        onClick={onIncrement}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export function PwaInstallGuide({ open = false, onClose }) {
  const [browser, setBrowser] = useState("safari");

  const steps =
    browser === "safari"
      ? [
          {
            num: "1",
            title: "Нажмите «Поделиться» внизу экрана",
            text: "Значок квадрата со стрелкой вверх на нижней панели Safari.",
          },
          {
            num: "2",
            title: "Выберите «На экран „Домой“»",
            text: "Прокрутите меню вниз и нажмите на пункт добавления ярлыка.",
          },
          {
            num: "3",
            title: "Нажмите «Добавить» справа сверху",
            text: "«Ритм» откроется на весь экран iPhone без нижней панели браузера.",
          },
        ]
      : [
          {
            num: "1",
            title: "Нажмите «Поделиться» в адресной строке",
            text: "Кнопка со стрелкой вверх справа от адреса сайта в Chrome на iPhone.",
          },
          {
            num: "2",
            title: "Выберите «На экран „Домой“»",
            text: "В системном меню прокрутите список и нажмите «На экран „Домой“».",
          },
          {
            num: "3",
            title: "Запускайте с рабочего стола",
            text: "Приложение сохранит данные и будет открываться на весь экран.",
          },
        ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="На экран «Домой»"
      subtitle="Полноэкранный запуск без панели браузера"
      footer={
        <button
          type="button"
          className="mt-btn mt-btn--primary mt-btn--wide"
          onClick={() => onClose?.()}
        >
          Понятно
        </button>
      }
    >
      <div className="mt-stack">
        <SegmentedControl
          value={browser}
          onChange={setBrowser}
          options={[
            { value: "safari", label: "Safari" },
            { value: "chrome", label: "Chrome" },
          ]}
        />
        <div className="mt-pwa-steps">
          {steps.map((step) => (
            <div key={step.num} className="mt-pwa-step">
              <span className="mt-pwa-step-num" aria-hidden="true">
                {step.num}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{step.title}</strong>
                <span>{step.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Unified custom-styled 2026 Carbon & Cobalt SelectField replacing native OS dropdowns.
 * Renders its listbox via createPortal(document.body) with smart viewport placement.
 */
export function SelectField({
  id,
  value,
  onChange,
  options = [],
  placeholder = "Выбрать",
  disabled = false,
  ariaLabel,
  className = "",
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [placedAbove, setPlacedAbove] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = useId();

  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" || typeof opt === "number"
      ? { value: String(opt), label: String(opt) }
      : {
          ...opt,
          value: opt?.value === undefined || opt?.value === null ? "" : String(opt.value),
          label: opt?.label ?? String(opt?.value ?? ""),
        }
  );

  const currentStr =
    value === undefined || value === null ? "" : String(value);
  const selectedIndex = normalizedOptions.findIndex(
    (opt) => opt.value === currentStr
  );
  const selectedOption =
    selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  const closeMenu = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }, []);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const gap = 6;
    const maxAllowedH = 240;

    const width = Math.min(vw - margin * 2, Math.max(rect.width, 184));
    let left = rect.left;
    if (left + width > vw - margin) {
      left = rect.right - width;
    }
    left = Math.min(Math.max(margin, left), vw - margin - width);

    const spaceBelow = Math.max(0, vh - rect.bottom - margin - gap);
    const spaceAbove = Math.max(0, rect.top - margin - gap);
    const estimatedH = Math.min(maxAllowedH, normalizedOptions.length * 44 + 12);
    const flipAbove =
      spaceBelow < Math.min(estimatedH, 168) && spaceAbove > spaceBelow;

    setPlacedAbove(flipAbove);
    if (flipAbove) {
      setMenuStyle({
        position: "fixed",
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        bottom: `${Math.round(vh - rect.top + gap)}px`,
        maxHeight: `${Math.round(Math.min(maxAllowedH, Math.max(116, spaceAbove)))}px`,
      });
    } else {
      setMenuStyle({
        position: "fixed",
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        top: `${Math.round(rect.bottom + gap)}px`,
        maxHeight: `${Math.round(Math.min(maxAllowedH, Math.max(116, spaceBelow)))}px`,
      });
    }
  }, [normalizedOptions.length]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const initialIdx =
      selectedIndex >= 0 ? selectedIndex : normalizedOptions.length > 0 ? 0 : -1;
    setHighlightedIndex(initialIdx);

    const rafId = window.requestAnimationFrame(() => {
      if (initialIdx >= 0 && optionRefs.current[initialIdx]) {
        optionRefs.current[initialIdx].scrollIntoView({ block: "nearest" });
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [open, selectedIndex, normalizedOptions.length, updatePosition]);

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
        return;
      }
      if (event.key === "Tab") {
        closeMenu(false);
        return;
      }
      if (!normalizedOptions.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) => {
          const next = (prev + 1) % normalizedOptions.length;
          optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) => {
          const next =
            prev <= 0 ? normalizedOptions.length - 1 : prev - 1;
          optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (event.key === "Home") {
        event.preventDefault();
        setHighlightedIndex(0);
        optionRefs.current[0]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "End") {
        event.preventDefault();
        const last = normalizedOptions.length - 1;
        setHighlightedIndex(last);
        optionRefs.current[last]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const targetIdx = highlightedIndex >= 0 ? highlightedIndex : selectedIndex;
        if (targetIdx >= 0 && normalizedOptions[targetIdx]) {
          onChange?.(normalizedOptions[targetIdx].value);
        }
        closeMenu(true);
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
  }, [open, highlightedIndex, selectedIndex, normalizedOptions, onChange, closeMenu, updatePosition]);

  const handleTriggerKeyDown = (event) => {
    if (disabled || open) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleSelectOption = (opt) => {
    onChange?.(opt.value);
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
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel || placeholder}
          className={`mt-select-menu${placedAbove ? " is-above" : ""}`}
          style={menuStyle}
        >
          {normalizedOptions.length === 0 ? (
            <div className="mt-select-empty">Нет вариантов</div>
          ) : (
            normalizedOptions.map((opt, idx) => {
              const isSelected = idx === selectedIndex;
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    "mt-select-option",
                    isSelected ? "is-selected" : "",
                    isHighlighted ? "is-highlighted is-focused" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleSelectOption(opt)}
                >
                  <span className="mt-select-option-copy">
                    <span className="mt-select-option-label">{opt.label}</span>
                    {opt.meta ? (
                      <span className="mt-select-option-meta">{opt.meta}</span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      className="mt-select-option-check"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
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
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={`mt-select-value${selectedOption ? "" : " is-placeholder"}`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={17}
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
