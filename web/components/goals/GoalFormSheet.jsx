import React, { useEffect, useState } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import Sheet from "../Sheet.jsx";
import { GroupList, ListRow, Pill } from "../UiPrimitives.jsx";
import {
  GOAL_SPHERES,
  GOAL_HORIZONS,
  GOAL_CHECKIN_CADENCES,
  GOAL_STARTER_BLUEPRINTS,
  QUARTER_OPTIONS,
  formatYearQuarterRu,
} from "../../data/presets.js";
import { todayISO, parseISODate, toISODate } from "../../utils/date.js";

function addYearsISO(iso, years) {
  const dt = parseISODate(iso || todayISO());
  const next = new Date(
    dt.getFullYear() + Number(years || 1),
    dt.getMonth(),
    dt.getDate(),
    12,
    0,
    0,
    0,
  );
  return toISODate(next);
}

function addMonthsToYearQuarter(iso, offsetMonths) {
  const dt = parseISODate(iso || todayISO());
  const next = new Date(
    dt.getFullYear(),
    dt.getMonth() + Number(offsetMonths || 3),
    15,
    12,
    0,
    0,
    0,
  );
  const q = Math.floor(next.getMonth() / 3) + 1;
  return { target_year: next.getFullYear(), target_quarter: `Q${q}` };
}

export default function GoalFormSheet({
  open,
  goal = null,
  habits = [],
  todayDate,
  onClose,
  onSave,
  onDelete,
}) {
  const isEditing = Boolean(goal?.id);
  const baseDate = todayDate || todayISO();
  const currentYear = parseISODate(baseDate).getFullYear();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(GOAL_SPHERES[0].key);
  const [horizonYears, setHorizonYears] = useState(1);
  const [startDate, setStartDate] = useState(baseDate);
  const [targetDate, setTargetDate] = useState(addYearsISO(baseDate, 1));
  const [linkedHabitId, setLinkedHabitId] = useState("");
  const [checkInCadence, setCheckInCadence] = useState("weekly");
  const [status, setStatus] = useState("active");

  // Initial milestones (for new goal creation)
  const [milestones, setMilestones] = useState([]);
  const [msTitle, setMsTitle] = useState("");
  const [msYear, setMsYear] = useState(currentYear + 1);
  const [msQuarter, setMsQuarter] = useState("Q2");

  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (goal?.id) {
      setTitle(goal.title || "");
      setDescription(goal.description || "");
      setCategory(goal.category || GOAL_SPHERES[0].key);
      setHorizonYears(Number(goal.horizon_years) || 1);
      setStartDate(goal.start_date || baseDate);
      setTargetDate(
        goal.target_date ||
          addYearsISO(goal.start_date || baseDate, goal.horizon_years || 1),
      );
      setLinkedHabitId(goal.linked_habit_id ? String(goal.linked_habit_id) : "");
      setCheckInCadence(goal.check_in_cadence || "weekly");
      setStatus(goal.status || "active");
      setMilestones([]);
    } else {
      setTitle("");
      setDescription("");
      setCategory(GOAL_SPHERES[0].key);
      setHorizonYears(1);
      setStartDate(baseDate);
      setTargetDate(addYearsISO(baseDate, 1));
      setLinkedHabitId("");
      setCheckInCadence("weekly");
      setStatus("active");
      setMilestones([]);
    }
    setMsTitle("");
    setMsYear(currentYear + 1);
    setMsQuarter("Q2");
    setSaving(false);
    setConfirmDelete(false);
    setError("");
  }, [open, goal, baseDate, currentYear]);

  function handleSelectHorizon(years) {
    setHorizonYears(years);
    setTargetDate(addYearsISO(startDate || baseDate, years));
    setMsYear(
      parseISODate(startDate || baseDate).getFullYear() + Math.min(years, 1),
    );
  }

  function handleApplyBlueprint(bp) {
    setTitle(bp.title);
    setDescription(bp.description);
    setCategory(bp.category);
    setHorizonYears(bp.horizon_years);
    setTargetDate(addYearsISO(startDate || baseDate, bp.horizon_years));
    setCheckInCadence(bp.check_in_cadence || "weekly");
    setMilestones(
      (bp.milestones || []).map((m, idx) => {
        const yq = addMonthsToYearQuarter(startDate || baseDate, m.offsetMonths);
        return {
          tempId: `${bp.id}-${idx}-${Date.now()}`,
          title: m.title,
          target_year: yq.target_year,
          target_quarter: yq.target_quarter,
        };
      }),
    );
    setError("");
  }

  function handleAddMilestoneDraft() {
    const trimmed = msTitle.trim();
    if (!trimmed) return;
    setMilestones((prev) => [
      ...prev,
      {
        tempId: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: trimmed,
        target_year: Number(msYear) || currentYear + 1,
        target_quarter: msQuarter || "Q4",
      },
    ]);
    setMsTitle("");
  }

  function handleRemoveMilestoneDraft(tempId) {
    setMilestones((prev) => prev.filter((item) => item.tempId !== tempId));
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введите название цели");
      return;
    }

    const effectiveStart = startDate || baseDate;
    const effectiveTarget =
      targetDate || addYearsISO(effectiveStart, horizonYears);
    if (effectiveTarget <= effectiveStart) {
      setError("Целевая дата должна быть позже даты начала");
      return;
    }

    const finalMilestones = [...milestones];
    if (!isEditing && msTitle.trim()) {
      finalMilestones.push({
        title: msTitle.trim(),
        target_year: Number(msYear) || currentYear + 1,
        target_quarter: msQuarter || "Q4",
      });
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        id: goal?.id,
        title: trimmed,
        description: description.trim(),
        category,
        horizon_years: Number(horizonYears) || 1,
        start_date: effectiveStart,
        target_date: effectiveTarget,
        linked_habit_id: linkedHabitId ? Number(linkedHabitId) : null,
        check_in_cadence: checkInCadence,
        status,
        milestones: isEditing
          ? undefined
          : finalMilestones.map((m, idx) => ({
              title: m.title,
              target_year: Number(m.target_year) || currentYear + 1,
              target_quarter: m.target_quarter || "Q4",
              sort_order: idx,
            })),
      };
      await onSave(payload);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось сохранить цель");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!goal?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onDelete?.(goal.id);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось удалить цель");
    } finally {
      setSaving(false);
    }
  }

  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear + i);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редактировать цель" : "Новая цель"}
      footer={
        <div className="mt-stack mt-stack--sm">
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving
              ? "Сохраняем..."
              : isEditing
                ? "Сохранить изменения"
                : "Создать цель"}
          </button>
          {isEditing && (
            <button
              type="button"
              className="mt-btn mt-btn--danger mt-btn--wide"
              disabled={saving}
              onClick={handleDelete}
            >
              <Trash2 size={16} />
              <span>
                {confirmDelete ? "Подтвердить удаление" : "Удалить цель"}
              </span>
            </button>
          )}
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        {error ? <div className="mt-form-error">{error}</div> : null}

        {/* Starter Blueprints (only when creating) */}
        {!isEditing && (
          <div className="mt-field">
            <span className="mt-label">Готовые шаблоны</span>
            <div className="mt-chip-row">
              {GOAL_STARTER_BLUEPRINTS.map((bp) => (
                <Pill
                  key={bp.id}
                  tone="neutral"
                  icon={<Sparkles size={12} />}
                  onClick={() => handleApplyBlueprint(bp)}
                >
                  {bp.category} · {bp.horizon_years} г.
                </Pill>
              ))}
            </div>
          </div>
        )}

        {/* Title */}
        <div className="mt-field">
          <label className="mt-label" htmlFor="goal-title-input">
            Название цели
          </label>
          <input
            id="goal-title-input"
            type="text"
            className="mt-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
            placeholder="Например: свободный английский"
            autoComplete="off"
          />
        </div>

        {/* Description */}
        <div className="mt-field">
          <label className="mt-label" htmlFor="goal-desc-input">
            Описание
          </label>
          <textarea
            id="goal-desc-input"
            className="mt-textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Зачем это важно и что станет результатом"
          />
        </div>

        {/* Sphere / Category */}
        <div className="mt-field">
          <span className="mt-label">Сфера</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {GOAL_SPHERES.map((sphere) => (
              <Pill
                key={sphere.key}
                tone="neutral"
                active={category === sphere.key}
                onClick={() => setCategory(sphere.key)}
              >
                {sphere.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* Horizon Selector */}
        <div className="mt-field">
          <span className="mt-label">Горизонт</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {GOAL_HORIZONS.map((h) => (
              <Pill
                key={h.years}
                tone="neutral"
                active={horizonYears === h.years}
                onClick={() => handleSelectHorizon(h.years)}
              >
                {h.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* Target Date */}
        <div className="mt-field">
          <label className="mt-label" htmlFor="goal-target-date">
            Целевая дата
          </label>
          <input
            id="goal-target-date"
            type="date"
            className="mt-input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>

        {/* Linked Daily Habit */}
        <div className="mt-field">
          <label className="mt-label" htmlFor="goal-habit-select">
            Связанная привычка
          </label>
          <select
            id="goal-habit-select"
            className="mt-select"
            value={linkedHabitId}
            onChange={(e) => setLinkedHabitId(e.target.value)}
          >
            <option value="">Без привязки</option>
            {habits.map((h) => (
              <option key={h.id} value={String(h.id)}>
                {h.title}
              </option>
            ))}
          </select>
        </div>

        {/* Check-in Cadence */}
        <div className="mt-field">
          <span className="mt-label">Ритм чек-инов</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {GOAL_CHECKIN_CADENCES.map((c) => (
              <Pill
                key={c.key}
                tone="neutral"
                active={checkInCadence === c.key}
                onClick={() => setCheckInCadence(c.key)}
              >
                {c.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* Status selector when editing */}
        {isEditing && (
          <div className="mt-field">
            <span className="mt-label">Статус</span>
            <div className="mt-chip-row mt-chip-row--wrap">
              {[
                { key: "active", label: "Активна" },
                { key: "paused", label: "На паузе" },
                { key: "completed", label: "Достигнута" },
              ].map((st) => (
                <Pill
                  key={st.key}
                  tone={st.key === "completed" ? "success" : "neutral"}
                  active={status === st.key}
                  onClick={() => setStatus(st.key)}
                >
                  {st.label}
                </Pill>
              ))}
            </div>
          </div>
        )}

        {/* Initial Milestones Builder (when creating a goal) */}
        {!isEditing && (
          <div className="mt-field">
            <span className="mt-label">Вехи по кварталам</span>
            {milestones.length > 0 && (
              <GroupList>
                {milestones.map((ms) => (
                  <ListRow
                    key={ms.tempId}
                    title={ms.title}
                    meta={formatYearQuarterRu(ms.target_year, ms.target_quarter)}
                    trailing={
                      <button
                        type="button"
                        className="mt-icon-btn mt-icon-btn--danger"
                        aria-label="Удалить веху"
                        onClick={() => handleRemoveMilestoneDraft(ms.tempId)}
                      >
                        <Trash2 size={15} />
                      </button>
                    }
                  />
                ))}
              </GroupList>
            )}

            <div className="mt-card mt-card--compact" style={{ gap: "8px" }}>
              <input
                type="text"
                className="mt-input"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="Этап, например: разговорный клуб"
                aria-label="Название вехи"
              />
              <div className="mt-input-row">
                <select
                  className="mt-select"
                  value={msYear}
                  onChange={(e) => setMsYear(Number(e.target.value))}
                  aria-label="Год вехи"
                  style={{ flex: "1 1 92px" }}
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
                  style={{ flex: "0 0 92px" }}
                >
                  {QUARTER_OPTIONS.map((q) => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="mt-btn mt-btn--soft mt-btn--sm"
                  disabled={!msTitle.trim()}
                  onClick={handleAddMilestoneDraft}
                >
                  <Plus size={16} />
                  <span>Веха</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
