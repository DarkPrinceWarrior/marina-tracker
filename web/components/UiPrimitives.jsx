import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
} from "lucide-react";
import Sheet from "./Sheet.jsx";
import {
  addDays,
  formatShortRangeRu,
  getWeekDays,
  todayISO,
} from "../utils/date.js";

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
        {eyebrow && <p className="mt-eyebrow">{eyebrow}</p>}
        {title && <Heading className="mt-section-title">{title}</Heading>}
        {subtitle && <p className="mt-card-sub">{subtitle}</p>}
      </div>
      {action ? <div className="mt-section-header-action">{action}</div> : null}
    </header>
  );
}

export function DateStrip({
  selectedDate,
  todayDate = todayISO(),
  onSelectDate,
  markers = {},
}) {
  const activeISO = selectedDate || todayDate;
  const days = getWeekDays(activeISO);
  const isNotToday = activeISO !== todayDate;
  const rangeLabel =
    days.length === 7 ? formatShortRangeRu(days[0].iso, days[6].iso) : "";

  return (
    <div className="mt-stack mt-stack--xs">
      <div className="mt-row mt-row--between" style={{ minHeight: 40 }}>
        <div className="mt-row" style={{ gap: 2 }}>
          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Предыдущая неделя"
            onClick={() => onSelectDate?.(addDays(activeISO, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <span
            className="muted tabular"
            style={{ fontSize: "13px", fontWeight: 600, padding: "0 2px" }}
          >
            {rangeLabel}
          </span>
          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Следующая неделя"
            onClick={() => onSelectDate?.(addDays(activeISO, 7))}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {isNotToday ? (
          <button
            type="button"
            className="mt-pill mt-pill--brand"
            onClick={() => onSelectDate?.(todayDate)}
          >
            Сегодня
          </button>
        ) : null}
      </div>

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
    </div>
  );
}

export function SegmentedControl({
  value,
  onChange,
  accent = "brand",
  options = [],
}) {
  return (
    <div className="mt-segmented" role="tablist" data-accent={accent}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`mt-segmented-btn${isActive ? " is-active" : ""}`}
            data-accent={accent}
            onClick={() => onChange?.(option.value)}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {option.label}
            </span>
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
  size = 72,
  strokeWidth = 7,
  color = "var(--brand)",
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

export function CheckRow({
  checked = false,
  onToggle,
  title,
  subtitle,
  accent = "brand",
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
          {checked ? <Check size={15} strokeWidth={2.75} /> : null}
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
        data-accent={tone}
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
    <span className={classes} data-accent={tone} {...rest}>
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
  accent = "brand",
  icon,
}) {
  const button = (
    <button
      type="button"
      className="mt-fab"
      data-accent={accent}
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
            text: "Иконка квадрата со стрелкой вверх на нижней панели Safari.",
          },
          {
            num: "2",
            title: "Выберите «На экран „Домой“»",
            text: "Прокрутите меню чуть вниз и нажмите на пункт добавления ярлыка.",
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
      title="Установить «Ритм» на iPhone"
      subtitle="Полноэкранный режим без панели браузера"
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
          accent="brand"
          options={[
            { value: "safari", label: "Safari (iOS)" },
            { value: "chrome", label: "Chrome (iOS)" },
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
