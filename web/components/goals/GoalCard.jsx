import React, { useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Link2,
  Plus,
  Pencil,
  ChevronDown,
  ChevronUp,
  History,
  Flag,
  Trash2,
} from "lucide-react";
import { ProgressRing, Pill } from "../UiPrimitives.jsx";
import { CHECKIN_FEELING_MAP } from "./GoalCheckinSheet.jsx";
import { GOAL_PACE_META, formatCountRu, pluralRu } from "../../data/presets.js";
import {
  MONTH_SHORT_RU,
  parseISODate,
  formatDateShortRu,
  formatDateWithYearRu,
} from "../../utils/date.js";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function formatHorizonRu(years) {
  const n = Number(years) || 1;
  return `Горизонт: ${n} ${pluralRu(n, "год", "года", "лет")}`;
}

function formatTargetSummary(goal) {
  if (!goal.target_date) return "";
  const dt = parseISODate(goal.target_date);
  const month = MONTH_SHORT_RU[dt.getMonth()];
  const year = dt.getFullYear();
  const base = `до ${month}. ${year}`;
  if (goal.status === "completed") return `${base} · достигнута`;
  if (typeof goal.days_remaining === "number") {
    if (goal.days_remaining <= 0) return `${base} · срок наступил`;
    return `${base} · ${goal.days_remaining} дн.`;
  }
  return base;
}

export default function GoalCard({
  goal,
  defaultMilestonesOpen = false,
  onOpenCheckin,
  onEditGoal,
  onToggleMilestone,
  onAddMilestone,
  onDeleteMilestone,
}) {
  const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
  const checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
  const completedMs = milestones.filter((m) => m.completed).length;

  const [milestonesOpen, setMilestonesOpen] = useState(
    Boolean(defaultMilestonesOpen && milestones.length > 0 && milestones.length <= 5),
  );
  const [addingMs, setAddingMs] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const currentYear = new Date().getFullYear();
  const [msYear, setMsYear] = useState(
    goal.target_date ? parseISODate(goal.target_date).getFullYear() : currentYear + 1,
  );
  const [msQuarter, setMsQuarter] = useState("Q4");
  const [savingMs, setSavingMs] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isCompleted = goal.status === "completed";
  const paceKey = isCompleted
    ? "completed"
    : goal.pace_status === "ahead"
      ? "ahead"
      : goal.pace_status === "attention" || goal.pace_status === "at_risk"
        ? "attention"
        : "on_track";

  const paceLabel = isCompleted
    ? "Достигнута"
    : goal.pace_label || GOAL_PACE_META[paceKey]?.label || "В графике";

  const PaceIcon =
    paceKey === "ahead"
      ? TrendingUp
      : paceKey === "attention"
        ? AlertTriangle
        : CheckCircle2;

  const ringColor = isCompleted
    ? "var(--success)"
    : paceKey === "attention"
      ? "var(--warning)"
      : "var(--goals)";

  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear + i);

  async function handleSubmitMilestone(event) {
    event?.preventDefault();
    const trimmed = msTitle.trim();
    if (!trimmed || savingMs) return;
    setSavingMs(true);
    try {
      await onAddMilestone(goal.id, {
        title: trimmed,
        target_year: Number(msYear) || currentYear + 1,
        target_quarter: msQuarter || "Q4",
      });
      setMsTitle("");
      setAddingMs(false);
      setMilestonesOpen(true);
    } finally {
      setSavingMs(false);
    }
  }

  return (
    <article className="goal-card" data-accent="goals">
      {/* Top Row: Horizon + Pace Watcher Pill + Edit */}
      <div className="goal-card-top">
        <div className="mt-row mt-row--wrap" style={{ gap: "6px", flex: "1 1 auto" }}>
          <span className="goal-horizon-pill">
            {formatHorizonRu(goal.horizon_years)}
          </span>
          <span className={`goal-pace-badge goal-pace-badge--${paceKey}`}>
            <PaceIcon size={12} />
            <span>{paceLabel}</span>
          </span>
        </div>

        <button
          type="button"
          className="mt-icon-btn"
          aria-label={`Редактировать цель «${goal.title}»`}
          onClick={() => onEditGoal?.(goal)}
          style={{ marginTop: "-8px", marginRight: "-8px" }}
        >
          <Pencil size={17} />
        </button>
      </div>

      {/* Title, Description & Target Horizon Info */}
      <div className="mt-stack mt-stack--xs">
        <h3 className="mt-card-title" style={{ fontSize: "16.5px", lineHeight: "22px" }}>
          {goal.title}
        </h3>
        {goal.description ? (
          <p className="mt-card-sub" style={{ marginTop: 0 }}>
            {goal.description}
          </p>
        ) : null}
        <div
          className="mt-row mt-row--wrap"
          style={{ gap: "8px", marginTop: "2px", fontSize: "12.5px", color: "var(--muted)" }}
        >
          {goal.category ? <Pill tone="neutral">{goal.category}</Pill> : null}
          <span className="mt-row tabular" style={{ gap: "5px" }}>
            <Calendar size={13} />
            <span>{formatTargetSummary(goal)}</span>
          </span>
        </div>
      </div>

      {/* Progress Ring + Pace Bar + Check-in CTA */}
      <div className="goal-progress-row">
        <ProgressRing
          percent={goal.progress_pct}
          size={68}
          strokeWidth={6}
          color={ringColor}
          label={`${Math.round(goal.progress_pct || 0)}%`}
        />
        <div className="mt-stack mt-stack--xs" style={{ flex: "1 1 auto" }}>
          <div className="mt-row mt-row--between" style={{ gap: "6px" }}>
            <span className="muted tabular" style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
              План: {goal.expected_progress_pct ?? 0}%
            </span>
            {goal.last_checkin_at ? (
              <span className="muted tabular" style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                Чек-ин: {formatDateShortRu(goal.last_checkin_at)}
              </span>
            ) : null}
          </div>

          <div className="goal-progress-bar" aria-hidden="true">
            <div
              className="goal-progress-fill"
              style={{
                width: `${Math.max(0, Math.min(100, Number(goal.progress_pct) || 0))}%`,
                background: ringColor,
              }}
            />
          </div>

          <div className="mt-row mt-row--between" style={{ gap: "8px", marginTop: "2px" }}>
            {goal.checkin_overdue && !isCompleted ? (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--warning)",
                }}
              >
                Пора обновиться
              </span>
            ) : (
              <span className="muted" style={{ fontSize: "12px" }}>
                {isCompleted ? "Достигнута" : "В спокойном темпе"}
              </span>
            )}
            <button
              type="button"
              className="mt-btn mt-btn--soft mt-btn--sm"
              data-accent="goals"
              onClick={() => onOpenCheckin?.(goal)}
            >
              <Sparkles size={15} />
              <span>Чек-ин</span>
            </button>
          </div>
        </div>
      </div>

      {/* Linked Daily Habit Live Connection */}
      {goal.linked_habit ? (
        <div className="goal-habit-link">
          <Link2 size={16} style={{ flexShrink: 0 }} />
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            Цель следит за привычкой: <strong>{goal.linked_habit.title}</strong> —{" "}
            <span className="tabular">
              {formatCountRu(
                goal.linked_habit.completions_30d,
                "выполнение",
                "выполнения",
                "выполнений",
              )}{" "}
              за 30 дней
            </span>
          </div>
          <Pill tone="habits">{goal.linked_habit.rate_30d_pct}%</Pill>
        </div>
      ) : null}

      {/* Milestones by Year / Quarter */}
      <div className="goal-milestones">
        <div className="mt-row mt-row--between">
          <button
            type="button"
            className="mt-btn mt-btn--ghost mt-btn--sm"
            style={{ paddingInline: "4px" }}
            aria-expanded={milestonesOpen}
            onClick={() => setMilestonesOpen((prev) => !prev)}
          >
            <Flag size={15} />
            <span className="tabular">
              Вехи ({completedMs}/{milestones.length})
            </span>
            {milestonesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          <button
            type="button"
            className="mt-btn mt-btn--ghost mt-btn--sm"
            style={{ color: "var(--goals-ink)" }}
            onClick={() => {
              setAddingMs((prev) => !prev);
              setMilestonesOpen(true);
            }}
          >
            <Plus size={15} />
            <span>Веха</span>
          </button>
        </div>

        {addingMs && (
          <form
            className="mt-card mt-card--compact"
            style={{ gap: "8px", background: "var(--canvas)" }}
            onSubmit={handleSubmitMilestone}
          >
            <input
              type="text"
              className="mt-input"
              value={msTitle}
              onChange={(e) => setMsTitle(e.target.value)}
              placeholder="Новый этап цели..."
              aria-label="Название новой вехи"
              autoComplete="off"
            />
            <div className="mt-input-row">
              <select
                className="mt-select"
                value={msYear}
                onChange={(e) => setMsYear(Number(e.target.value))}
                aria-label="Год вехи"
                style={{ flex: "1 1 88px" }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                className="mt-select"
                value={msQuarter}
                onChange={(e) => setMsQuarter(e.target.value)}
                aria-label="Квартал вехи"
                style={{ flex: "0 0 78px" }}
              >
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="mt-btn mt-btn--primary mt-btn--sm"
                data-accent="goals"
                disabled={!msTitle.trim() || savingMs}
              >
                Добавить
              </button>
            </div>
          </form>
        )}

        {milestonesOpen && milestones.length > 0 && (
          <div className="mt-stack mt-stack--xs">
            {milestones.map((ms) => (
              <div
                key={ms.id}
                className={`goal-milestone-row${ms.completed ? " is-done" : ""}`}
                data-accent="goals"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={Boolean(ms.completed)}
                  className="mt-row"
                  style={{
                    flex: "1 1 auto",
                    minHeight: "36px",
                    textAlign: "left",
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    color: "inherit",
                  }}
                  onClick={() => onToggleMilestone?.(goal.id, ms)}
                >
                  <span
                    className="mt-check-box"
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "7px",
                      border: `1.5px solid ${ms.completed ? "var(--goals)" : "var(--border-strong)"}`,
                      background: ms.completed ? "var(--goals)" : "var(--surface)",
                      color: "#FFFFFF",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {ms.completed ? <Check size={13} strokeWidth={2.75} /> : null}
                  </span>

                  <span
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13.5px",
                        lineHeight: "18px",
                        fontWeight: 500,
                        textDecoration: ms.completed ? "line-through" : "none",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {ms.title}
                    </span>
                    <span className="muted tabular" style={{ fontSize: "11.5px" }}>
                      {ms.target_year} {ms.target_quarter || ""}
                      {ms.completed && ms.completed_at
                        ? ` · выполнено ${formatDateShortRu(ms.completed_at)}`
                        : ""}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  className="mt-icon-btn mt-icon-btn--danger"
                  aria-label={`Удалить веху «${ms.title}»`}
                  onClick={() => onDeleteMilestone?.(goal.id, ms.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {milestonesOpen && milestones.length === 0 && !addingMs && (
          <p className="muted" style={{ fontSize: "12.5px", paddingInline: "4px" }}>
            Добавьте вехи по кварталам — отметка вехи автоматически обновит прогресс цели.
          </p>
        )}
      </div>

      {/* Expandable Check-in History */}
      <div className="goal-checkins">
        <button
          type="button"
          className="mt-btn mt-btn--ghost mt-btn--sm"
          style={{ justifyContent: "space-between", width: "100%", paddingInline: "4px" }}
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((prev) => !prev)}
        >
          <span className="mt-row" style={{ gap: "7px" }}>
            <History size={15} />
            <span className="tabular">
              История чек-инов ({checkins.length})
            </span>
          </span>
          {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {historyOpen && (
          checkins.length === 0 ? (
            <p className="muted" style={{ fontSize: "12.5px", paddingInline: "4px" }}>
              Пока нет записей. Нажмите «Чек-ин», чтобы сохранить первый шаг вашего пути.
            </p>
          ) : (
            <div className="mt-stack mt-stack--xs">
              {checkins.map((ci) => {
                const feelingMeta = CHECKIN_FEELING_MAP[ci.feeling];
                return (
                  <div key={ci.id} className="goal-checkin-item">
                    <header>
                      <span>{formatDateWithYearRu(ci.checkin_date)}</span>
                      <div className="mt-row" style={{ gap: "6px" }}>
                        {feelingMeta ? (
                          <Pill tone={feelingMeta.tone}>{feelingMeta.label}</Pill>
                        ) : ci.feeling ? (
                          <Pill tone="neutral">{ci.feeling}</Pill>
                        ) : null}
                        <Pill tone="goals">{ci.progress_pct}%</Pill>
                      </div>
                    </header>
                    {ci.note ? (
                      <p style={{ color: "var(--ink)", overflowWrap: "anywhere" }}>
                        {ci.note}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </article>
  );
}
