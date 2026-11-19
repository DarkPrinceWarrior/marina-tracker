import React, { useEffect, useState } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import Sheet from "../Sheet.jsx";
import { Pill } from "../UiPrimitives.jsx";
import { todayISO } from "../../utils/date.js";

export const CHECKIN_FEELINGS = [
  { key: "inspired", label: "Вдохновляет", tone: "cobalt" },
  { key: "calm", label: "Ровный ритм", tone: "neutral" },
  { key: "focused", label: "Собранность", tone: "cobalt" },
  { key: "happy", label: "Радость", tone: "success" },
  { key: "proud", label: "Горжусь шагом", tone: "success" },
  { key: "thoughtful", label: "Надо подумать", tone: "warning" },
  { key: "tired", label: "Усталость", tone: "warning" },
];

const EXTRA_FEELING_LABELS = {
  needs_focus: { key: "needs_focus", label: "Нужен фокус", tone: "neutral" },
  energized: { key: "energized", label: "Прилив энергии", tone: "cobalt" },
  balanced: { key: "balanced", label: "Баланс", tone: "neutral" },
  strong: { key: "strong", label: "Уверенность", tone: "cobalt" },
};

export const CHECKIN_FEELING_MAP = {
  ...EXTRA_FEELING_LABELS,
  ...Object.fromEntries(CHECKIN_FEELINGS.map((f) => [f.key, f])),
};

export default function GoalCheckinSheet({
  open,
  goal,
  todayDate,
  onClose,
  onSubmit,
}) {
  const [progressPct, setProgressPct] = useState(0);
  const [feeling, setFeeling] = useState("calm");
  const [note, setNote] = useState("");
  const [checkinDate, setCheckinDate] = useState(todayDate || todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !goal) return;
    setProgressPct(Number(goal.progress_pct) || 0);
    setFeeling("calm");
    setNote("");
    setCheckinDate(todayDate || todayISO());
    setSaving(false);
    setError("");
  }, [open, goal, todayDate]);

  if (!goal) return null;

  const expected = Number(goal.expected_progress_pct) || 0;
  const previewPace =
    progressPct >= 100 || progressPct >= expected + 8
      ? { label: "Опережаю", tone: "cobalt", Icon: TrendingUp }
      : progressPct <= expected - 10
        ? { label: "Внимание", tone: "warning", Icon: AlertTriangle }
        : { label: "В графике", tone: "success", Icon: CheckCircle2 };

  async function handleSave(event) {
    event?.preventDefault();
    const clamped = Math.max(
      0,
      Math.min(100, Math.round(Number(progressPct) || 0)),
    );
    setSaving(true);
    setError("");
    try {
      await onSubmit(goal.id, {
        progress_pct: clamped,
        feeling,
        note: note.trim(),
        checkin_date: checkinDate || todayDate || todayISO(),
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось сохранить чек-ин");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Чек-ин по цели"
      subtitle={goal.title}
      footer={
        <button
          type="button"
          className="mt-btn mt-btn--primary mt-btn--wide"
          disabled={saving}
          onClick={handleSave}
        >
          <Sparkles size={16} />
          <span>{saving ? "Сохраняем..." : "Сохранить чек-ин"}</span>
        </button>
      }
    >
      <form className="mt-stack" onSubmit={handleSave}>
        {error ? <div className="mt-form-error">{error}</div> : null}

        {/* Progress Slider + Live Pace Comparison */}
        <div className="mt-field">
          <div className="mt-row mt-row--between">
            <label className="mt-label" htmlFor="checkin-progress-range">
              Текущий прогресс
            </label>
            <span
              className="mt-card-title tabular"
              style={{ color: "var(--cobalt)" }}
            >
              {progressPct}%
            </span>
          </div>

          <input
            id="checkin-progress-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={progressPct}
            onChange={(e) => setProgressPct(Number(e.target.value))}
            style={{
              width: "100%",
              minHeight: "44px",
              accentColor: "var(--cobalt)",
              cursor: "pointer",
            }}
          />

          <div
            className="mt-row mt-row--between mt-row--wrap"
            style={{ gap: "6px" }}
          >
            <span className="muted tabular" style={{ fontSize: "12.5px" }}>
              План по времени: {expected}%
            </span>
            <Pill
              tone={previewPace.tone}
              icon={<previewPace.Icon size={12} />}
            >
              {previewPace.label}
            </Pill>
          </div>

          <div
            className="mt-chip-row mt-chip-row--wrap"
            style={{ marginTop: "4px" }}
          >
            {[5, 10, 15].map((delta) => (
              <Pill
                key={delta}
                tone="neutral"
                onClick={() =>
                  setProgressPct((prev) => Math.min(100, prev + delta))
                }
              >
                +{delta}%
              </Pill>
            ))}
            <Pill
              tone="success"
              active={progressPct === 100}
              onClick={() => setProgressPct(100)}
            >
              100% · Готово
            </Pill>
          </div>
        </div>

        {/* Feeling Pills */}
        <div className="mt-field">
          <span className="mt-label">Ощущение от темпа</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {CHECKIN_FEELINGS.map((item) => (
              <Pill
                key={item.key}
                tone="neutral"
                active={feeling === item.key}
                onClick={() => setFeeling(item.key)}
              >
                {item.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="mt-field">
          <label className="mt-label" htmlFor="checkin-note-input">
            Заметка и следующий шаг
          </label>
          <textarea
            id="checkin-note-input"
            className="mt-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Что получилось и какой шаг дальше?"
          />
        </div>

        {/* Check-in Date */}
        <div className="mt-field">
          <label className="mt-label" htmlFor="checkin-date-input">
            Дата чек-ина
          </label>
          <input
            id="checkin-date-input"
            type="date"
            className="mt-input"
            value={checkinDate}
            onChange={(e) => setCheckinDate(e.target.value)}
          />
        </div>
      </form>
    </Sheet>
  );
}
