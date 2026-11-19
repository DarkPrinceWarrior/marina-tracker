import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  Clock,
  Flame,
  Flower2,
  Play,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wind,
} from "lucide-react";
import api from "../../api.js";
import PracticeTimerSheet from "../PracticeTimerSheet.jsx";
import { CheckRow, EmptyState, Pill } from "../UiPrimitives.jsx";
import {
  WORKOUT_DURATIONS,
  WORKOUT_INTENSITIES,
  WORKOUT_MOODS,
  WORKOUT_PRESETS,
  WORKOUT_TYPES,
  WORKOUT_TYPE_MAP,
} from "../../data/presets.js";
import {
  formatCountRu,
  formatDateShortRu,
  formatRelativeDayRu,
  getWeekDays,
  nowTimeHHMM,
} from "../../utils/date.js";

const TYPE_ICONS = {
  breathing: Wind,
  pilates: Activity,
  qigong: Flower2,
  other: Sparkles,
};

const INTENSITY_LABELS = {
  light: "Мягко",
  medium: "Средне",
  intense: "Интенсивно",
};

const MOOD_LABELS = {
  calm: "Спокойствие",
  energized: "Бодрость",
  balanced: "Баланс",
  strong: "Сила и тонус",
  lightness: "Лёгкость в теле",
  relaxed: "Расслабление",
  focused: "Ясная голова",
};

function formatMoodRu(mood) {
  if (!mood) return "";
  return MOOD_LABELS[mood] || mood;
}

export default function WorkoutsTab({
  selectedDate,
  todayDate,
  notify,
  onDataChanged,
  onTodayCountChange,
}) {
  const [data, setData] = useState({
    date: selectedDate,
    day_items: [],
    recent_items: [],
    weekly_summary: {
      total_sessions: 0,
      total_minutes: 0,
      by_type: { breathing: 0, pilates: 0, qigong: 0, other: 0 },
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Quick-log form state
  const [selectedType, setSelectedType] = useState("pilates");
  const [customLabel, setCustomLabel] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [intensity, setIntensity] = useState("medium");
  const [mood, setMood] = useState("energized");
  const [loggedAt, setLoggedAt] = useState(() => nowTimeHHMM());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Guided timer sheet & minimalist disclosures
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerPresetId, setTimerPresetId] = useState(null);
  const [showExtras, setShowExtras] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const loadWorkouts = useCallback(async () => {
    setError("");
    try {
      const res = await api.getWorkouts(selectedDate, 30);
      const dayItems = Array.isArray(res?.day_items) ? res.day_items : [];
      const recentItems = Array.isArray(res?.recent_items) ? res.recent_items : [];
      setData({
        date: res?.date || selectedDate,
        day_items: dayItems,
        recent_items: recentItems,
        weekly_summary: res?.weekly_summary || {
          total_sessions: 0,
          total_minutes: 0,
          by_type: { breathing: 0, pilates: 0, qigong: 0, other: 0 },
        },
      });
      onTodayCountChange?.(dayItems.filter((w) => w.completed !== false).length);
    } catch (err) {
      setError(err?.message || "Не удалось загрузить тренировки.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, onTodayCountChange]);

  useEffect(() => {
    setLoading(true);
    loadWorkouts();
  }, [loadWorkouts]);

  const handleSelectType = (typeKey) => {
    setSelectedType(typeKey);
    const meta = WORKOUT_TYPE_MAP[typeKey];
    if (meta) {
      const nearest =
        WORKOUT_DURATIONS.find((d) => d >= meta.defaultDuration) || 20;
      setDurationMin(nearest);
    }
    if (typeKey === "breathing" || typeKey === "qigong") {
      setIntensity("light");
      setMood("calm");
    } else if (typeKey === "pilates") {
      setIntensity("medium");
      setMood("energized");
    }
  };

  const applyPreset = (preset) => {
    if (!preset) return;
    setDurationMin(preset.durationMin || 20);
    if (preset.intensity) setIntensity(preset.intensity);
    if (preset.mood) setMood(preset.mood);
    setNote(preset.title);
  };

  const handleLogWorkout = async (e) => {
    e?.preventDefault();
    if (submitting) return;
    if (selectedType === "other" && !customLabel.trim()) {
      notify?.("Напишите название своей практики", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        log_date: selectedDate,
        workout_type: selectedType,
        custom_label: selectedType === "other" ? customLabel.trim() : "",
        duration_min: Number(durationMin) || 20,
        intensity,
        mood,
        note: note.trim(),
        completed: true,
        logged_at: loggedAt || nowTimeHHMM(),
      };
      await api.createWorkout(payload);
      setNote("");
      if (selectedType === "other") setCustomLabel("");
      setLoggedAt(nowTimeHHMM());
      await loadWorkouts();
      onDataChanged?.();
      const label =
        selectedType === "other"
          ? payload.custom_label
          : WORKOUT_TYPE_MAP[selectedType]?.label || "Тренировка";
      notify?.(`Тренировка «${label}» (${payload.duration_min} мин) отмечена!`, "success");
    } catch (err) {
      notify?.(err?.message || "Не удалось сохранить тренировку", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleWorkout = async (item) => {
    const nextCompleted = !item.completed;
    const prev = data;
    const patchList = (list) =>
      list.map((w) => (w.id === item.id ? { ...w, completed: nextCompleted } : w));
    setData({
      ...prev,
      day_items: patchList(prev.day_items),
      recent_items: patchList(prev.recent_items),
    });

    try {
      await api.updateWorkout(item.id, { completed: nextCompleted });
      await loadWorkouts();
      onDataChanged?.();
    } catch (err) {
      setData(prev);
      notify?.(err?.message || "Не удалось обновить тренировку", "error");
    }
  };

  const handleDeleteWorkout = async (item) => {
    const prev = data;
    setData({
      ...prev,
      day_items: prev.day_items.filter((w) => w.id !== item.id),
      recent_items: prev.recent_items.filter((w) => w.id !== item.id),
    });
    try {
      await api.deleteWorkout(item.id);
      await loadWorkouts();
      onDataChanged?.();
      notify?.("Тренировка удалена", "info");
    } catch (err) {
      setData(prev);
      notify?.(err?.message || "Не удалось удалить тренировку", "error");
    }
  };

  // Current week activity strip (Mon..Sun)
  const weekDays = useMemo(() => {
    const days = getWeekDays(selectedDate || todayDate);
    const byDate = new Map();
    for (const item of data.recent_items) {
      if (item.completed === false) continue;
      const key = item.log_date;
      const existing = byDate.get(key) || { count: 0, minutes: 0 };
      existing.count += 1;
      existing.minutes += Number(item.duration_min) || 0;
      byDate.set(key, existing);
    }
    return days.map((d) => ({
      ...d,
      activity: byDate.get(d.iso) || { count: 0, minutes: 0 },
    }));
  }, [data.recent_items, selectedDate, todayDate]);

  // 30-day totals & breakdown by practice type
  const totals30d = useMemo(() => {
    const completed = data.recent_items.filter((w) => w.completed !== false);
    const breakdown = {
      breathing: { sessions: 0, minutes: 0 },
      pilates: { sessions: 0, minutes: 0 },
      qigong: { sessions: 0, minutes: 0 },
      other: { sessions: 0, minutes: 0 },
    };
    let totalMinutes = 0;
    for (const item of completed) {
      const t = breakdown[item.workout_type] ? item.workout_type : "other";
      const mins = Number(item.duration_min) || 0;
      breakdown[t].sessions += 1;
      breakdown[t].minutes += mins;
      totalMinutes += mins;
    }
    return {
      totalSessions: completed.length,
      totalMinutes,
      breakdown,
    };
  }, [data.recent_items]);

  const activeTypeMeta = WORKOUT_TYPE_MAP[selectedType] || WORKOUT_TYPES[0];
  const presetsForType = WORKOUT_PRESETS[selectedType] || [];
  const activeWeekDaysCount = weekDays.filter((d) => d.activity.count > 0).length;

  return (
    <div className="mt-stack">
      {/* 1. Practice Picker & Quick Log Card */}
      <section className="mt-card" aria-label="Отметить тренировку или практику">
        <div className="mt-card-head">
          <div>
            <h2 className="mt-card-title">Выберите практику</h2>
            <p className="mt-card-sub">
              Дыхание, пилатес, цигун или своя активность
            </p>
          </div>
          <button
            type="button"
            className="mt-btn mt-btn--soft mt-btn--sm"
            data-accent={activeTypeMeta.accent}
            onClick={() => {
              const matchedPreset =
                presetsForType.find((p) => p.title === note) || presetsForType[0];
              setTimerPresetId(matchedPreset?.id || null);
              setTimerOpen(true);
            }}
          >
            <Play size={14} />
            <span>Таймер</span>
          </button>
        </div>

        {/* 2x2 Tactile Practice Grid (clean on 393px iPhone) */}
        <div
          className="workout-type-grid"
          style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
          role="radiogroup"
          aria-label="Тип практики"
        >
          {WORKOUT_TYPES.map((wType) => {
            const Icon = TYPE_ICONS[wType.key] || Sparkles;
            const isSelected = selectedType === wType.key;
            return (
              <button
                key={wType.key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`workout-type-card${isSelected ? " is-selected" : ""}`}
                data-accent={wType.accent}
                onClick={() => handleSelectType(wType.key)}
              >
                <span className="workout-type-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div className="mt-stack mt-stack--xs" style={{ gap: "2px" }}>
                  <strong>{wType.label}</strong>
                  <small className="tabular">от {wType.defaultDuration} мин</small>
                </div>
              </button>
            );
          })}
        </div>

        {/* Guided presets strip for selected type */}
        {presetsForType.length > 0 ? (
          <div className="mt-field">
            <span className="mt-label">Готовые сценарии ({activeTypeMeta.shortLabel})</span>
            <div className="mt-chip-row">
              {presetsForType.map((preset) => (
                <Pill
                  key={preset.id}
                  tone={activeTypeMeta.accent}
                  active={note === preset.title}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.title} · {preset.durationMin}м
                </Pill>
              ))}
            </div>
          </div>
        ) : null}

        {/* Form controls for selected practice */}
        <form className="mt-stack" onSubmit={handleLogWorkout}>
          {selectedType === "other" ? (
            <div className="mt-field">
              <label className="mt-label" htmlFor="workout-custom-label">
                Название практики
              </label>
              <input
                id="workout-custom-label"
                type="text"
                className="mt-input"
                placeholder="Например: йога, прогулка, растяжка"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            </div>
          ) : null}

          <div className="mt-field">
            <span className="mt-label">Длительность</span>
            <div className="mt-chip-row mt-chip-row--wrap">
              {WORKOUT_DURATIONS.map((mins) => (
                <Pill
                  key={mins}
                  tone="habits"
                  active={durationMin === mins}
                  onClick={() => setDurationMin(mins)}
                  className="tabular"
                >
                  {mins} мин
                </Pill>
              ))}
            </div>
          </div>

          {/* Collapsible secondary details (Intensity, Mood, Time, Note) */}
          <button
            type="button"
            className="mt-disclosure-btn"
            aria-expanded={showExtras}
            onClick={() => setShowExtras((v) => !v)}
          >
            <span className="mt-row" style={{ gap: "7px", minWidth: 0 }}>
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                Дополнительно
              </span>
              {!showExtras ? (
                <span
                  className="mt-card-sub tabular"
                  style={{
                    fontSize: "12px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {INTENSITY_LABELS[intensity] || intensity} · {formatMoodRu(mood)} · {loggedAt}
                  {note ? " · заметка" : ""}
                </span>
              ) : null}
            </span>
            <ChevronDown size={16} className="mt-disclosure-chevron" aria-hidden="true" />
          </button>

          {showExtras ? (
            <div className="mt-disclosure-panel">
              <div className="mt-field">
                <span className="mt-label">Интенсивность</span>
                <div className="mt-chip-row mt-chip-row--wrap">
                  {WORKOUT_INTENSITIES.map((item) => (
                    <Pill
                      key={item.key}
                      tone="habits"
                      active={intensity === item.key}
                      onClick={() => setIntensity(item.key)}
                    >
                      {item.label}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="mt-field">
                <span className="mt-label">Самочувствие после</span>
                <div className="mt-chip-row">
                  {WORKOUT_MOODS.map((m) => (
                    <Pill
                      key={m.key}
                      tone="neutral"
                      active={mood === m.key || mood === m.label}
                      onClick={() => setMood(m.key)}
                    >
                      {m.label}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="mt-form-grid">
                <div className="mt-field">
                  <label className="mt-label" htmlFor="workout-time-input">
                    Время
                  </label>
                  <input
                    id="workout-time-input"
                    type="time"
                    className="mt-input tabular"
                    value={loggedAt}
                    onChange={(e) => setLoggedAt(e.target.value)}
                  />
                </div>
                <div className="mt-field">
                  <label className="mt-label" htmlFor="workout-note-input">
                    Заметка
                  </label>
                  <input
                    id="workout-note-input"
                    type="text"
                    className="mt-input"
                    placeholder="Ощущения, фокус…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            className="mt-btn mt-btn--primary mt-btn--wide"
            data-accent="habits"
            disabled={submitting}
          >
            <Check size={18} strokeWidth={2.5} />
            <span>
              {submitting ? "Сохраняем…" : "Отметить тренировку сделанной"}
            </span>
          </button>
        </form>
      </section>

      {error ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-form-error">{error}</p>
        </div>
      ) : null}

      {/* 2. Today's Completed Workouts */}
      <section className="mt-card" aria-label="Тренировки выбранного дня">
        <div className="mt-card-head">
          <div>
            <h2 className="mt-card-title">
              Практики · {formatRelativeDayRu(selectedDate)}
            </h2>
            <p className="mt-card-sub tabular">
              {data.day_items.length > 0
                ? `${formatCountRu(data.day_items.length, "занятие", "занятия", "занятий")} · ${data.day_items.reduce((s, w) => s + (Number(w.duration_min) || 0), 0)} мин`
                : "Ещё нет отмеченных практик за этот день"}
            </p>
          </div>
          {data.day_items.length > 0 ? (
            <Pill tone="success" className="tabular">
              {data.day_items.filter((w) => w.completed !== false).length} выполн.
            </Pill>
          ) : null}
        </div>

        {loading && data.day_items.length === 0 ? (
          <p className="mt-card-sub">Загружаем тренировки…</p>
        ) : data.day_items.length === 0 ? (
          <EmptyState
            icon={<Flower2 size={22} />}
            title="Тихий день для тела"
            description="Выберите практику выше или запустите спокойный таймер дыхания, пилатеса или цигуна."
          />
        ) : (
          <div className="mt-stack mt-stack--sm">
            {data.day_items.map((w) => {
              const typeMeta = WORKOUT_TYPE_MAP[w.workout_type] || WORKOUT_TYPES[3];
              const metaParts = [
                `${w.duration_min} мин`,
                INTENSITY_LABELS[w.intensity] || w.intensity,
                w.logged_at ? w.logged_at : null,
                w.mood ? formatMoodRu(w.mood) : null,
              ].filter(Boolean);
              const subtitle = w.note
                ? `${metaParts.join(" · ")} — ${w.note}`
                : metaParts.join(" · ");

              return (
                <CheckRow
                  key={w.id}
                  checked={w.completed !== false}
                  onToggle={() => handleToggleWorkout(w)}
                  accent={typeMeta.accent}
                  title={w.label || typeMeta.label}
                  subtitle={subtitle}
                  badge={
                    <Pill tone={typeMeta.accent} className="tabular">
                      {w.duration_min} мин
                    </Pill>
                  }
                  trailing={
                    <button
                      type="button"
                      className="mt-icon-btn mt-icon-btn--danger"
                      aria-label={`Удалить тренировку «${w.label || typeMeta.label}»`}
                      onClick={() => handleDeleteWorkout(w)}
                    >
                      <Trash2 size={15} />
                    </button>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Compact Weekly Activity Strip */}
      <section className="mt-card" aria-label="Активность за неделю">
        <div className="mt-card-head">
          <div>
            <h2 className="mt-card-title">Ритм недели</h2>
            <p className="mt-card-sub tabular">
              {formatCountRu(activeWeekDaysCount, "активный день", "активных дня", "активных дней")} ·{" "}
              {data.weekly_summary?.total_minutes || 0} мин
            </p>
          </div>
          <Pill tone="habits" icon={<Flame size={12} />} className="tabular">
            {data.weekly_summary?.total_sessions || 0} за 7 дн.
          </Pill>
        </div>

        <div className="workout-week-strip">
          {weekDays.map((d) => {
            const isActive = d.activity.count > 0;
            return (
              <div
                key={d.iso}
                className={`workout-week-day${isActive ? " is-active" : ""}`}
                title={
                  isActive
                    ? `${d.weekdayFull}: ${d.activity.minutes} мин`
                    : `${d.weekdayFull}: без тренировок`
                }
              >
                <span>{d.weekdayShort}</span>
                <span className="tabular" style={{ fontSize: "12.5px", fontWeight: 700 }}>
                  {isActive ? `${d.activity.minutes}м` : d.day}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. 30-Day Totals & History */}
      <section className="mt-card" aria-label="История тренировок за 30 дней">
        <div className="mt-card-head">
          <div>
            <h2 className="mt-card-title">История за 30 дней</h2>
            <p className="mt-card-sub tabular">
              Всего: {formatCountRu(totals30d.totalSessions, "тренировка", "тренировки", "тренировок")} ·{" "}
              {totals30d.totalMinutes} мин
            </p>
          </div>
        </div>

        {/* Breakdown by Breathing / Pilates / Qigong */}
        <div className="cycle-stats-grid">
          {["breathing", "pilates", "qigong"].map((key) => {
            const meta = WORKOUT_TYPE_MAP[key];
            const stat = totals30d.breakdown[key];
            return (
              <div key={key} className="cycle-stat-box">
                <span>{meta.shortLabel}</span>
                <strong>{stat.sessions} зан.</strong>
                <span className="tabular">{stat.minutes} мин</span>
              </div>
            );
          })}
        </div>
        {totals30d.breakdown.other.sessions > 0 ? (
          <p className="mt-card-sub tabular">
            Свои практики: {totals30d.breakdown.other.sessions} зан. ·{" "}
            {totals30d.breakdown.other.minutes} мин
          </p>
        ) : null}

        {data.recent_items.length === 0 ? (
          <p className="mt-card-sub">За последние 30 дней записей пока нет.</p>
        ) : (
          <div className="mt-stack mt-stack--sm">
            {(showAllHistory ? data.recent_items : data.recent_items.slice(0, 5)).map((item) => {
              const typeMeta = WORKOUT_TYPE_MAP[item.workout_type] || WORKOUT_TYPES[3];
              const Icon = TYPE_ICONS[item.workout_type] || Sparkles;
              return (
                <div
                  key={item.id}
                  className="mt-row mt-row--between"
                  style={{
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: "var(--canvas)",
                    border: "1px solid var(--border-subtle)",
                    gap: "10px",
                  }}
                >
                  <div className="mt-row" style={{ gap: "10px", minWidth: 0, flex: "1 1 auto" }}>
                    <span
                      className="workout-type-icon"
                      style={{ width: "32px", height: "32px" }}
                      aria-hidden="true"
                    >
                      <Icon size={16} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="mt-row mt-row--wrap" style={{ gap: "6px" }}>
                        <strong style={{ fontSize: "14px", color: "var(--ink)" }}>
                          {item.label || typeMeta.label}
                        </strong>
                        <span className="mt-card-sub tabular" style={{ fontSize: "12px" }}>
                          {formatDateShortRu(item.log_date)}
                          {item.logged_at ? ` · ${item.logged_at}` : ""}
                        </span>
                      </div>
                      <p className="mt-card-sub" style={{ fontSize: "12.5px" }}>
                        <Clock
                          size={11}
                          style={{ display: "inline", verticalAlign: "-1px", marginRight: "4px" }}
                        />
                        <span className="tabular">{item.duration_min} мин</span>
                        {item.intensity ? ` · ${INTENSITY_LABELS[item.intensity] || item.intensity}` : ""}
                        {item.mood ? ` · ${formatMoodRu(item.mood)}` : ""}
                        {item.note ? ` — ${item.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-icon-btn"
                    aria-label={`Удалить запись ${item.label || typeMeta.label}`}
                    onClick={() => handleDeleteWorkout(item)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}

            {data.recent_items.length > 5 ? (
              <button
                type="button"
                className="mt-disclosure-btn"
                aria-expanded={showAllHistory}
                onClick={() => setShowAllHistory((v) => !v)}
              >
                <span className="tabular">
                  {showAllHistory
                    ? "Свернуть историю"
                    : `Показать все ${data.recent_items.length} за 30 дней`}
                </span>
                <ChevronDown size={16} className="mt-disclosure-chevron" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* Guided Breathing & Practice Timer Sheet */}
      <PracticeTimerSheet
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        initialType={selectedType}
        initialPresetId={timerPresetId}
        selectedDate={selectedDate}
        onCompleted={() => {
          loadWorkouts();
          onDataChanged?.();
        }}
        notify={notify}
      />
    </div>
  );
}
