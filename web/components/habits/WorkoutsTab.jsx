import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Flower2,
  Play,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wind,
} from "lucide-react";
import api from "../../api.js";
import Sheet from "../Sheet.jsx";
import PracticeTimerSheet from "../PracticeTimerSheet.jsx";
import {
  GroupHeader,
  GroupList,
  ListRow,
  MetricStrip,
  Pill,
} from "../UiPrimitives.jsx";
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

  // Guided timer, disclosures & inspect sheet
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerPresetId, setTimerPresetId] = useState(null);
  const [showExtras, setShowExtras] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [inspectItem, setInspectItem] = useState(null);

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
      notify?.(
        `Тренировка «${label}» (${payload.duration_min} мин) отмечена!`,
        "success",
      );
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
    if (!item) return;
    const prev = data;
    setInspectItem(null);
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

  const presetsForType = WORKOUT_PRESETS[selectedType] || [];
  const activeWeekDaysCount = weekDays.filter((d) => d.activity.count > 0).length;
  const visibleHistory = showAllHistory
    ? data.recent_items
    : data.recent_items.slice(0, 5);

  const openTimer = () => {
    const matchedPreset =
      presetsForType.find((p) => p.title === note) || presetsForType[0];
    setTimerPresetId(matchedPreset?.id || null);
    setTimerOpen(true);
  };

  return (
    <div className="mt-stack">
      {/* 1. Clean Minimalist Workout Logger Card */}
      <section className="mt-card" aria-label="Отметить тренировку">
        <form className="mt-stack" onSubmit={handleLogWorkout}>
          {/* 4 Compact Equal Practice Buttons */}
          <div
            className="workout-type-grid"
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
                  onClick={() => handleSelectType(wType.key)}
                >
                  <span className="workout-type-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <strong>{wType.shortLabel}</strong>
                </button>
              );
            })}
          </div>

          {selectedType === "other" ? (
            <input
              id="workout-custom-label"
              type="text"
              className="mt-input"
              aria-label="Название своей практики"
              placeholder="Например: йога, прогулка, растяжка"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
            />
          ) : null}

          {/* Single Row of Duration Pills */}
          <div
            className="mt-chip-row"
            role="group"
            aria-label="Длительность тренировки"
          >
            {WORKOUT_DURATIONS.map((mins) => (
              <Pill
                key={mins}
                tone="cobalt"
                active={durationMin === mins}
                onClick={() => setDurationMin(mins)}
                className="tabular"
              >
                {mins} мин
              </Pill>
            ))}
          </div>

          {/* 2 Balanced Action Buttons: Отметить + Таймер */}
          <div className="mt-grid-2">
            <button
              type="submit"
              className="mt-btn mt-btn--primary"
              disabled={submitting}
            >
              <Check size={16} strokeWidth={2.5} />
              <span>{submitting ? "Сохраняем…" : "Отметить"}</span>
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--soft"
              onClick={openTimer}
            >
              <Play size={15} />
              <span>Таймер</span>
            </button>
          </div>

          {/* Quiet Collapsible Disclosure: Presets, Intensity, Mood, Time, Note */}
          <button
            type="button"
            className="mt-disclosure-btn"
            aria-expanded={showExtras}
            onClick={() => setShowExtras((v) => !v)}
          >
            <span className="mt-row" style={{ gap: "7px", minWidth: 0 }}>
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                Сценарий и параметры
              </span>
            </span>
            <ChevronDown
              size={16}
              className="mt-disclosure-chevron"
              aria-hidden="true"
            />
          </button>

          {showExtras ? (
            <div className="mt-disclosure-panel">
              {presetsForType.length > 0 ? (
                <div className="mt-field">
                  <span className="mt-label">Готовые сценарии</span>
                  <div className="mt-chip-row">
                    {presetsForType.map((preset) => (
                      <Pill
                        key={preset.id}
                        tone="cobalt"
                        active={note === preset.title}
                        onClick={() => applyPreset(preset)}
                      >
                        {preset.title} · {preset.durationMin}м
                      </Pill>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-field">
                <span className="mt-label">Интенсивность</span>
                <div className="mt-chip-row mt-chip-row--wrap">
                  {WORKOUT_INTENSITIES.map((item) => (
                    <Pill
                      key={item.key}
                      tone="cobalt"
                      active={intensity === item.key}
                      onClick={() => setIntensity(item.key)}
                    >
                      {item.label}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="mt-field">
                <span className="mt-label">Самочувствие</span>
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
        </form>
      </section>

      {error ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-form-error">{error}</p>
        </div>
      ) : null}

      {/* 2. Slim 7-Day Weekly Dots Strip */}
      <section className="mt-stack mt-stack--xs" aria-label="Активность за неделю">
        <GroupHeader
          title="Неделя"
          meta={`${formatCountRu(activeWeekDaysCount, "день", "дня", "дней")} · ${data.weekly_summary?.total_minutes || 0} мин`}
        />
        <div className="mt-card mt-card--compact">
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
                  <span
                    className={`workout-week-dot${isActive ? " is-active" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="workout-week-val tabular">
                    {isActive ? `${d.activity.minutes}м` : d.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Selected Day Workouts (Grouped List) */}
      {data.day_items.length > 0 ? (
        <section className="mt-stack mt-stack--xs" aria-label="Тренировки выбранного дня">
          <GroupHeader
            title={formatRelativeDayRu(selectedDate)}
            meta={`${data.day_items.reduce((s, w) => s + (Number(w.duration_min) || 0), 0)} мин`}
          />
          <GroupList>
            {data.day_items.map((w) => {
              const typeMeta = WORKOUT_TYPE_MAP[w.workout_type] || WORKOUT_TYPES[3];
              const metaParts = [
                `${w.duration_min} мин`,
                INTENSITY_LABELS[w.intensity] || w.intensity,
                w.logged_at || null,
              ].filter(Boolean);

              return (
                <ListRow
                  key={w.id}
                  checked={w.completed !== false}
                  onToggle={() => handleToggleWorkout(w)}
                  onClick={() => setInspectItem(w)}
                  accent="cobalt"
                  title={w.label || typeMeta.label}
                  meta={metaParts.join(" · ")}
                  trailing={
                    <ChevronRight
                      size={16}
                      style={{ color: "var(--subtle)" }}
                      aria-hidden="true"
                    />
                  }
                />
              );
            })}
          </GroupList>
        </section>
      ) : null}

      {/* 4. 30-Day Totals & Grouped History */}
      <section className="mt-stack mt-stack--xs" aria-label="История тренировок за 30 дней">
        <GroupHeader
          title="За 30 дней"
          meta={`${formatCountRu(totals30d.totalSessions, "практика", "практики", "практик")} · ${totals30d.totalMinutes} мин`}
        />

        <MetricStrip
          items={["breathing", "pilates", "qigong"].map((key) => {
            const meta = WORKOUT_TYPE_MAP[key];
            const stat = totals30d.breakdown[key];
            return {
              key,
              value: `${stat.sessions} · ${stat.minutes}м`,
              label: meta.shortLabel,
            };
          })}
        />

        {loading && data.recent_items.length === 0 ? (
          <div className="mt-card mt-card--compact">
            <p className="mt-card-sub">Загружаем историю…</p>
          </div>
        ) : data.recent_items.length === 0 ? (
          <div className="mt-card mt-card--compact">
            <p className="mt-card-sub">За последние 30 дней записей пока нет.</p>
          </div>
        ) : (
          <div className="mt-stack mt-stack--xs">
            <GroupList>
              {visibleHistory.map((item) => {
                const typeMeta = WORKOUT_TYPE_MAP[item.workout_type] || WORKOUT_TYPES[3];
                const metaParts = [
                  formatDateShortRu(item.log_date),
                  `${item.duration_min} мин`,
                  item.intensity ? INTENSITY_LABELS[item.intensity] || item.intensity : null,
                ].filter(Boolean);

                return (
                  <ListRow
                    key={item.id}
                    title={item.label || typeMeta.label}
                    meta={metaParts.join(" · ")}
                    onClick={() => setInspectItem(item)}
                    trailing={
                      <ChevronRight
                        size={16}
                        style={{ color: "var(--subtle)" }}
                        aria-hidden="true"
                      />
                    }
                  />
                );
              })}
            </GroupList>

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
                <ChevronDown
                  size={16}
                  className="mt-disclosure-chevron"
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* Workout Detail / Delete Sheet */}
      <Sheet
        open={Boolean(inspectItem)}
        onClose={() => setInspectItem(null)}
        title={
          inspectItem
            ? inspectItem.label ||
              WORKOUT_TYPE_MAP[inspectItem.workout_type]?.label ||
              "Тренировка"
            : ""
        }
        subtitle={
          inspectItem
            ? `${formatDateShortRu(inspectItem.log_date)}${inspectItem.logged_at ? ` · ${inspectItem.logged_at}` : ""}`
            : ""
        }
        footer={
          inspectItem ? (
            <div className="mt-row" style={{ gap: "10px" }}>
              <button
                type="button"
                className="mt-btn mt-btn--danger"
                onClick={() => handleDeleteWorkout(inspectItem)}
              >
                <Trash2 size={16} />
                <span>Удалить</span>
              </button>
              <button
                type="button"
                className="mt-btn mt-btn--primary mt-btn--wide"
                onClick={() => setInspectItem(null)}
              >
                Готово
              </button>
            </div>
          ) : null
        }
      >
        {inspectItem ? (
          <div className="mt-stack">
            <MetricStrip
              items={[
                { value: `${inspectItem.duration_min} мин`, label: "Время" },
                {
                  value:
                    INTENSITY_LABELS[inspectItem.intensity] ||
                    inspectItem.intensity ||
                    "—",
                  label: "Нагрузка",
                },
                {
                  value: formatMoodRu(inspectItem.mood) || "—",
                  label: "Состояние",
                },
              ]}
            />
            {inspectItem.note ? (
              <div className="mt-card mt-card--compact">
                <span className="mt-label">Заметка</span>
                <p style={{ marginTop: "4px", fontSize: "14.5px", color: "var(--ink)" }}>
                  {inspectItem.note}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>

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
