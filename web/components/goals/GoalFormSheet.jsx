import React, { useEffect, useState } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import Sheet from "../Sheet.jsx";
import { Pill } from "../UiPrimitives.jsx";
import {
  GOAL_SPHERES,
  GOAL_HORIZONS,
  GOAL_CHECKIN_CADENCES,
  GOAL_STARTER_BLUEPRINTS,
} from "../../data/presets.js";
import { todayISO, parseISODate, toISODate } from "../../utils/date.js";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

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
      setTargetDate(goal.target_date || addYearsISO(goal.start_date || baseDate, goal.horizon_years || 1));
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
    setMsYear(parseISODate(startDate || baseDate).getFullYear() + Math.min(years, 1));
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
    const effectiveTarget = targetDate || addYearsISO(effectiveStart, horizonYears);
    if (effectiveTarget <= effectiveStart) {
      setError("Целевая дата должна быть позже даты начала цели");
      return;
    }

    // If user typed a milestone draft without tapping +, include it automatically
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
        start_date: startDate || baseDate,
        target_date: targetDate || addYearsISO(startDate || baseDate, horizonYears),
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
      title={isEditing ? "Редактировать цель" : "Новая долгосрочная цель"}
      subtitle={
        isEditing
          ? "Настройте горизонт, привычку и ритм чек-инов"
          : "Цель будет следить за вашим темпом в течение 1–5 лет"
      }
      footer={
        <div className="mt-stack mt-stack--sm" data-accent="goals">
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            data-accent="goals"
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
                {confirmDelete ? "Точно удалить эту цель?" : "Удалить цель"}
              </span>
            </button>
          )}
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit} data-accent="goals">
        {error ? <div className="mt-form-error">{error}</div> : null}

        {/* Starter Blueprints (only when creating) */}
        {!isEditing && (
          <div className="mt-field">
            <span className="mt-label">Готовые идеи на 1–3 года (по желанию)</span>
            <div className="mt-chip-row">
              {GOAL_STARTER_BLUEPRINTS.map((bp) => (
                <Pill
                  key={bp.id}
                  tone="goals"
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
            Зачем это важно и как поймёте, что получилось
          </label>
          <textarea
            id="goal-desc-input"
            className="mt-textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Короткое описание для вдохновения и ясности"
          />
        </div>

        {/* Sphere / Category */}
        <div className="mt-field">
          <span className="mt-label">Сфера жизни</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {GOAL_SPHERES.map((sphere) => (
              <Pill
                key={sphere.key}
                tone="goals"
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
          <span className="mt-label">Горизонт планирования</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {GOAL_HORIZONS.map((h) => (
              <Pill
                key={h.years}
                tone="goals"
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
            Целевая дата (рассчитана автоматически, можно изменить)
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
            Связать с ежедневной привычкой (необязательно)
          </label>
          <select
            id="goal-habit-select"
            className="mt-select"
            value={linkedHabitId}
            onChange={(e) => setLinkedHabitId(e.target.value)}
          >
            <option value="">Без привязки к привычке</option>
            {habits.map((h) => (
              <option key={h.id} value={String(h.id)}>
                {h.title}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: "12px" }}>
            Цель автоматически подсчитает выполнения этой привычки за последние 30 дней.
          </span>
        </div>

        {/* Check-in Cadence */}
        <div className="mt-field">
          <span className="mt-label">Ритм чек-инов</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {GOAL_CHECKIN_CADENCES.map((c) => (
              <Pill
                key={c.key}
                tone="goals"
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
            <span className="mt-label">Статус цели</span>
            <div className="mt-chip-row mt-chip-row--wrap">
              {[
                { key: "active", label: "Активна" },
                { key: "paused", label: "На паузе" },
                { key: "completed", label: "Достигнута" },
              ].map((st) => (
                <Pill
                  key={st.key}
                  tone={st.key === "completed" ? "success" : "goals"}
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
            <span className="mt-label">Вехи по годам и кварталам</span>
            {milestones.length > 0 && (
              <div className="mt-stack mt-stack--xs">
                {milestones.map((ms) => (
                  <div key={ms.tempId} className="goal-milestone-row">
                    <Pill tone="goals">
                      {ms.target_year} {ms.target_quarter}
                    </Pill>
                    <span
                      style={{
                        flex: "1 1 auto",
                        fontSize: "13.5px",
                        minWidth: 0,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {ms.title}
                    </span>
                    <button
                      type="button"
                      className="mt-icon-btn mt-icon-btn--danger"
                      aria-label="Удалить веху"
                      onClick={() => handleRemoveMilestoneDraft(ms.tempId)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-card mt-card--compact" style={{ gap: "8px" }}>
              <input
                type="text"
                className="mt-input"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="Этап, например: уровень B1"
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
                  style={{ flex: "0 0 84px" }}
                >
                  {QUARTERS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="mt-btn mt-btn--soft mt-btn--sm"
                  data-accent="goals"
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
