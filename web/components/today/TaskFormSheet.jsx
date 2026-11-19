import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock, Target, Trash2 } from "lucide-react";
import Sheet from "../Sheet.jsx";
import { Pill, SelectField } from "../UiPrimitives.jsx";
import { TASK_PRIORITIES, TASK_SECTIONS } from "../../data/presets.js";
import { formatRelativeDayRu } from "../../utils/date.js";

const QUICK_TIMES = ["09:00", "11:00", "14:00", "18:00"];

export default function TaskFormSheet({
  open,
  onClose,
  task = null,
  selectedDate,
  goals = [],
  onSave,
  onReschedule,
  onDelete,
  saving = false,
}) {
  const isEditing = Boolean(task?.id);

  const [title, setTitle] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [priority, setPriority] = useState("medium");
  const [sectionTag, setSectionTag] = useState("personal");
  const [goalId, setGoalId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title || "");
      setTimeSlot(task.time_slot || "");
      setPriority(task.priority || "medium");
      setSectionTag(task.section_tag || "personal");
      setGoalId(task.goal_id ? String(task.goal_id) : "");
    } else {
      setTitle("");
      setTimeSlot("");
      setPriority("medium");
      setSectionTag("personal");
      setGoalId("");
    }
    setError("");
  }, [open, task]);

  const handleSubmit = async (event) => {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Напишите короткое название задачи.");
      return;
    }
    setError("");
    try {
      await onSave?.({
        id: task?.id,
        title: trimmed,
        task_date: task?.task_date || selectedDate,
        time_slot: timeSlot.trim(),
        priority,
        section_tag: sectionTag,
        goal_id: goalId ? Number(goalId) : null,
      });
    } catch (err) {
      setError(err?.message || "Не удалось сохранить задачу.");
    }
  };

  const dayLabel = formatRelativeDayRu(
    task?.task_date || selectedDate
  ).toLowerCase();

  const goalOptions = useMemo(
    () => [
      { value: "", label: "Без привязки к цели" },
      ...goals.map((g) => ({
        value: String(g.id),
        label: g.title,
        meta: `${g.progress_pct}%`,
      })),
    ],
    [goals]
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редактировать задачу" : "Новая задача"}
      subtitle={`План на ${dayLabel}`}
      footer={
        <div className="mt-stack mt-stack--sm">
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving
              ? "Сохраняем…"
              : isEditing
                ? "Сохранить изменения"
                : "Добавить задачу"}
          </button>
          {isEditing ? (
            <div className="mt-row">
              {!task.completed && onReschedule ? (
                <button
                  type="button"
                  className="mt-btn mt-btn--secondary mt-btn--wide"
                  disabled={saving}
                  onClick={() => onReschedule(task)}
                >
                  <span>На завтра</span>
                  <ArrowRight size={15} />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="mt-btn mt-btn--danger mt-btn--wide"
                  disabled={saving}
                  onClick={() => onDelete(task)}
                >
                  <Trash2 size={15} />
                  <span>Удалить</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        <div className="mt-field">
          <label className="mt-label" htmlFor="today-task-title">
            Что нужно сделать
          </label>
          <input
            id="today-task-title"
            type="text"
            className="mt-input"
            placeholder="Например: запись к врачу"
            value={title}
            maxLength={160}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
          />
          {error ? <p className="mt-form-error">{error}</p> : null}
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="today-task-time">
            Время (необязательно)
          </label>
          <div className="mt-input-row">
            <input
              id="today-task-time"
              type="time"
              className="mt-input tabular"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
            />
            {timeSlot ? (
              <button
                type="button"
                className="mt-btn mt-btn--ghost mt-btn--sm"
                onClick={() => setTimeSlot("")}
              >
                Очистить
              </button>
            ) : null}
          </div>
          <div className="mt-chip-row mt-chip-row--wrap">
            {QUICK_TIMES.map((slot) => (
              <Pill
                key={slot}
                tone="neutral"
                active={timeSlot === slot}
                icon={<Clock size={13} />}
                onClick={() => setTimeSlot(timeSlot === slot ? "" : slot)}
              >
                {slot}
              </Pill>
            ))}
          </div>
        </div>

        <div className="mt-field">
          <span className="mt-label">Приоритет</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {TASK_PRIORITIES.map((item) => (
              <Pill
                key={item.key}
                tone={item.key === "high" ? "coral" : "neutral"}
                active={priority === item.key}
                icon={
                  item.key === "high" ? (
                    <span
                      className="today-priority-dot today-priority-dot--high"
                      aria-hidden="true"
                    />
                  ) : null
                }
                onClick={() => setPriority(item.key)}
              >
                {item.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="mt-field">
          <span className="mt-label">Сфера жизни</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {TASK_SECTIONS.map((sec) => (
              <Pill
                key={sec.key}
                tone="neutral"
                active={sectionTag === sec.key}
                onClick={() => setSectionTag(sec.key)}
              >
                {sec.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="today-task-goal">
            <span className="mt-row" style={{ gap: 6 }}>
              <Target size={14} />
              <span>Привязать к цели</span>
            </span>
          </label>
          <SelectField
            id="today-task-goal"
            value={goalId}
            onChange={(val) => setGoalId(val)}
            options={goalOptions}
            placeholder="Без привязки к цели"
            ariaLabel="Привязать к цели"
          />
        </div>
      </form>
    </Sheet>
  );
}
