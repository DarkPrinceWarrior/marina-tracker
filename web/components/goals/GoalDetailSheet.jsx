import React, { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Link2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import Sheet from "../Sheet.jsx";
import {
  CompactProgress,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
  SelectField,
} from "../UiPrimitives.jsx";
import { CHECKIN_FEELING_MAP } from "./GoalCheckinSheet.jsx";
import {
  GOAL_PACE_META,
  QUARTER_OPTIONS,
  formatCountRu,
  formatYearQuarterRu,
  pluralRu,
} from "../../data/presets.js";
import {
  MONTH_SHORT_RU,
  parseISODate,
  formatDateShortRu,
  formatDateWithYearRu,
} from "../../utils/date.js";

function formatHorizonShort(years) {
  const n = Number(years) || 1;
  return `${n} ${pluralRu(n, "год", "года", "лет")}`;
}

function formatTargetLine(goal) {
  const parts = [formatHorizonShort(goal.horizon_years)];
  if (goal.target_date) {
    const dt = parseISODate(goal.target_date);
    parts.push(`до ${MONTH_SHORT_RU[dt.getMonth()]}. ${dt.getFullYear()}`);
  }
  if (goal.status === "completed") {
    parts.push("достигнута");
  } else if (typeof goal.days_remaining === "number") {
    parts.push(
      goal.days_remaining <= 0
        ? "срок наступил"
        : `осталось ${goal.days_remaining} дн.`,
    );
  }
  return parts.join(" · ");
}

export default function GoalDetailSheet({
  open,
  goal,
  onClose,
  onOpenCheckin,
  onEditGoal,
  onDeleteGoal,
  onToggleMilestone,
  onAddMilestone,
  onDeleteMilestone,
}) {
  const currentYear = new Date().getFullYear();
  const [addingMs, setAddingMs] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const [msYear, setMsYear] = useState(currentYear + 1);
  const [msQuarter, setMsQuarter] = useState("Q4");
  const [savingMs, setSavingMs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !goal) return;
    setAddingMs(false);
    setMsTitle("");
    setMsYear(
      goal.target_date
        ? parseISODate(goal.target_date).getFullYear()
        : currentYear + 1,
    );
    setMsQuarter("Q4");
    setConfirmDelete(false);
    setDeleting(false);
  }, [open, goal?.id, currentYear]);

  if (!goal) return null;

  const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
  const checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
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

  const yearOptions = Array.from({ length: 7 }, (_, i) => {
    const y = String(currentYear + i);
    return { value: y, label: y };
  });

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
    } finally {
      setSavingMs(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDeleteGoal?.(goal.id);
      onClose?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goal.title}
      subtitle={formatTargetLine(goal)}
      footer={
        <div className="mt-stack mt-stack--sm">
          <div className="mt-row" style={{ gap: "8px" }}>
            <button
              type="button"
              className="mt-btn mt-btn--primary"
              style={{ flex: "1 1 auto" }}
              onClick={() => {
                onClose?.();
                onOpenCheckin?.(goal);
              }}
            >
              <Sparkles size={16} />
              <span>Чек-ин</span>
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--secondary"
              onClick={() => {
                onClose?.();
                onEditGoal?.(goal);
              }}
            >
              <Pencil size={15} />
              <span>Редактировать</span>
            </button>
          </div>
          <button
            type="button"
            className="mt-btn mt-btn--danger mt-btn--wide"
            disabled={deleting}
            onClick={handleDelete}
          >
            <Trash2 size={15} />
            <span>
              {confirmDelete ? "Подтвердить удаление" : "Удалить"}
            </span>
          </button>
        </div>
      }
    >
      <div className="mt-stack">
        {/* Status & Description */}
        <div className="mt-row mt-row--wrap" style={{ gap: "6px" }}>
          <span className={`goal-pace-badge goal-pace-badge--${paceKey}`}>
            <PaceIcon size={12} />
            <span>{paceLabel}</span>
          </span>
          {goal.category ? <Pill tone="neutral">{goal.category}</Pill> : null}
        </div>

        {goal.description ? (
          <p
            style={{
              fontSize: "14px",
              lineHeight: "20px",
              color: "var(--ink-secondary)",
            }}
          >
            {goal.description}
          </p>
        ) : null}

        {/* Progress Bar */}
        <div className="mt-card mt-card--compact">
          <CompactProgress
            value={goal.progress_pct}
            max={100}
            label={`Прогресс ${Math.round(goal.progress_pct || 0)}%`}
            meta={`План: ${goal.expected_progress_pct ?? 0}%`}
            tone={
              isCompleted
                ? "success"
                : paceKey === "attention"
                  ? "warning"
                  : "cobalt"
            }
          />
        </div>

        {/* Linked Daily Habit */}
        {goal.linked_habit ? (
          <div className="goal-habit-link">
            <Link2 size={15} style={{ flexShrink: 0 }} />
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              Привычка: <strong>{goal.linked_habit.title}</strong> ·{" "}
              <span className="tabular">
                {formatCountRu(
                  goal.linked_habit.completions_30d,
                  "выполнение",
                  "выполнения",
                  "выполнений",
                )}{" "}
                за 30 дн.
              </span>
            </div>
            <span className="tabular" style={{ fontWeight: 700 }}>
              {goal.linked_habit.rate_30d_pct}%
            </span>
          </div>
        ) : null}

        {/* Milestones GroupList */}
        <div className="mt-stack mt-stack--xs">
          <GroupHeader
            title="Вехи"
            meta={`${completedMs}/${milestones.length}`}
            action={
              <button
                type="button"
                className="mt-btn mt-btn--ghost mt-btn--sm"
                onClick={() => setAddingMs((prev) => !prev)}
              >
                <Plus size={15} />
                <span>Веха</span>
              </button>
            }
          />

          {addingMs && (
            <form
              className="mt-card mt-card--compact"
              style={{ gap: "8px" }}
              onSubmit={handleSubmitMilestone}
            >
              <input
                type="text"
                className="mt-input"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="Новый этап цели"
                aria-label="Название новой вехи"
                autoComplete="off"
              />
              <div className="mt-input-row">
                <SelectField
                  value={String(msYear)}
                  onChange={(val) => setMsYear(Number(val))}
                  options={yearOptions}
                  ariaLabel="Год вехи"
                  compact
                />
                <SelectField
                  value={msQuarter}
                  onChange={setMsQuarter}
                  options={QUARTER_OPTIONS}
                  ariaLabel="Квартал вехи"
                  compact
                />
                <button
                  type="submit"
                  className="mt-btn mt-btn--primary mt-btn--sm"
                  disabled={!msTitle.trim() || savingMs}
                >
                  Добавить
                </button>
              </div>
            </form>
          )}

          {milestones.length > 0 ? (
            <GroupList>
              {milestones.map((ms) => {
                const when = formatYearQuarterRu(
                  ms.target_year,
                  ms.target_quarter,
                );
                const meta =
                  ms.completed && ms.completed_at
                    ? `${when} · выполнено ${formatDateShortRu(ms.completed_at)}`
                    : when;

                return (
                  <ListRow
                    key={ms.id}
                    checked={Boolean(ms.completed)}
                    onToggle={() => onToggleMilestone?.(goal.id, ms)}
                    strikethrough={true}
                    accent="cobalt"
                    title={ms.title}
                    meta={meta}
                    trailing={
                      <button
                        type="button"
                        className="mt-icon-btn mt-icon-btn--danger"
                        aria-label={`Удалить веху «${ms.title}»`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteMilestone?.(goal.id, ms.id);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    }
                  />
                );
              })}
            </GroupList>
          ) : (
            <p className="muted" style={{ fontSize: "13px" }}>
              Пока нет вех — добавьте этапы по кварталам, чтобы цель обновляла
              прогресс автоматически.
            </p>
          )}
        </div>

        {/* Check-in History */}
        <div className="mt-stack mt-stack--xs">
          <GroupHeader title="История чек-инов" meta={String(checkins.length)} />

          {checkins.length === 0 ? (
            <p className="muted" style={{ fontSize: "13px" }}>
              Пока нет записей. Нажмите «Чек-ин», чтобы отметить первый шаг.
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
                          <Pill tone={feelingMeta.tone}>
                            {feelingMeta.label}
                          </Pill>
                        ) : ci.feeling ? (
                          <Pill tone="neutral">{ci.feeling}</Pill>
                        ) : null}
                        <Pill tone="cobalt">{ci.progress_pct}%</Pill>
                      </div>
                    </header>
                    {ci.note ? (
                      <p
                        style={{
                          color: "var(--ink)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {ci.note}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
