import React from "react";
import {
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { GOAL_PACE_META, pluralRu } from "../../data/presets.js";
import { MONTH_SHORT_RU, parseISODate } from "../../utils/date.js";

function formatHorizonMeta(goal) {
  const years = Number(goal.horizon_years) || 1;
  const horizonPart = `${years} ${pluralRu(years, "год", "года", "лет")}`;
  if (!goal.target_date) return horizonPart;
  const dt = parseISODate(goal.target_date);
  return `${horizonPart} · до ${MONTH_SHORT_RU[dt.getMonth()]}. ${dt.getFullYear()}`;
}

export default function GoalCard({ goal, onOpenDetail, onOpenCheckin }) {
  const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
  const completedMs = milestones.filter((m) => m.completed).length;

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
    : GOAL_PACE_META[paceKey]?.shortLabel || goal.pace_label || "В графике";

  const PaceIcon =
    paceKey === "ahead"
      ? TrendingUp
      : paceKey === "attention"
        ? AlertTriangle
        : CheckCircle2;

  const pct = Math.max(0, Math.min(100, Math.round(Number(goal.progress_pct) || 0)));

  const subLine = goal.linked_habit
    ? `Привычка: ${goal.linked_habit.title} · ${goal.linked_habit.completions_30d}/30`
    : goal.category || "";

  const fillColor = isCompleted
    ? "var(--success)"
    : paceKey === "attention"
      ? "var(--warning)"
      : "var(--cobalt)";

  return (
    <article className="goal-card">
      {/* 1. Top row: status pill + horizon/date */}
      <div className="goal-card-top">
        <span className={`goal-pace-badge goal-pace-badge--${paceKey}`}>
          <PaceIcon size={12} />
          <span>{paceLabel}</span>
        </span>
        <span className="goal-horizon-meta">{formatHorizonMeta(goal)}</span>
      </div>

      {/* 2. Title + 1 quiet line (linked habit or sphere) */}
      <button
        type="button"
        className="goal-card-main"
        onClick={() => onOpenDetail?.(goal)}
      >
        <span className="goal-card-title">{goal.title}</span>
        {subLine ? <span className="goal-card-sub">{subLine}</span> : null}
      </button>

      {/* 3. Slim Cobalt progress bar + % */}
      <div className="goal-progress-row">
        <div
          className="goal-progress-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Прогресс цели «${goal.title}»`}
        >
          <div
            className="goal-progress-fill"
            style={{ width: `${pct}%`, background: fillColor }}
          />
        </div>
        <span className="goal-progress-pct">{pct}%</span>
      </div>

      {/* 4. Bottom row: Вехи link left + compact Чек-ин button right */}
      <div className="goal-card-foot">
        <button
          type="button"
          className="goal-milestones-link"
          onClick={() => onOpenDetail?.(goal)}
        >
          <span>
            Вехи {completedMs}/{milestones.length}
          </span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="mt-btn mt-btn--soft mt-btn--sm"
          onClick={() => onOpenCheckin?.(goal)}
        >
          <Sparkles size={14} />
          <span>Чек-ин</span>
        </button>
      </div>
    </article>
  );
}
