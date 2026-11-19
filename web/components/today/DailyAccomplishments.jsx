import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Award,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Droplets,
  Home,
  Pill as CapsuleIcon,
  Sparkles,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { EmptyState, Pill } from "../UiPrimitives.jsx";
import { DAY_MOODS, ENERGY_LEVELS, formatCountRu } from "../../data/presets.js";

const DOMAIN_META = {
  habit: { icon: CheckCircle2, tone: "habits", label: "Привычка" },
  vitamin: { icon: CapsuleIcon, tone: "brand", label: "Витамин" },
  water: { icon: Droplets, tone: "water", label: "Вода" },
  workout: { icon: Activity, tone: "habits", label: "Практика" },
  meal: { icon: UtensilsCrossed, tone: "nutrition", label: "Питание" },
  chore: { icon: Home, tone: "home", label: "Дом" },
  task: { icon: CheckSquare, tone: "brand", label: "Задача" },
};

function normalizeMood(rawMood) {
  if (!rawMood) return "";
  const trimmed = String(rawMood).trim();
  const lower = trimmed.toLowerCase();
  const matched = DAY_MOODS.find(
    (m) => m.key.toLowerCase() === lower || m.label.toLowerCase() === lower
  );
  return matched ? matched.key : trimmed;
}

const INITIAL_FEED_LIMIT = 4;

export default function DailyAccomplishments({
  feed = [],
  reflection = null,
  selectedDate,
  onSaveReflection,
  onOpenYearReview,
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [selectedDate]);

  useEffect(() => {
    setNote(reflection?.summary_note || "");
    setMood(normalizeMood(reflection?.mood));
    setEnergy(
      typeof reflection?.energy_level === "number"
        ? reflection.energy_level
        : null
    );
    setSavedNotice(false);
  }, [
    selectedDate,
    reflection?.log_date,
    reflection?.summary_note,
    reflection?.mood,
    reflection?.energy_level,
  ]);

  const visibleFeed = useMemo(
    () => (expanded ? feed : feed.slice(0, INITIAL_FEED_LIMIT)),
    [feed, expanded]
  );

  const hiddenCount = Math.max(0, feed.length - INITIAL_FEED_LIMIT);

  const commitReflection = async (nextValues, { silent = false } = {}) => {
    if (!onSaveReflection) return;
    setSaving(true);
    try {
      await onSaveReflection(
        {
          date: selectedDate,
          summary_note: nextValues.note,
          mood: nextValues.mood,
          energy_level: nextValues.energy,
        },
        { silent }
      );
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectMood = (moodKey) => {
    const nextMood = mood === moodKey ? "" : moodKey;
    setMood(nextMood);
    commitReflection({ note, mood: nextMood, energy }, { silent: true });
  };

  const handleSelectEnergy = (level) => {
    const nextEnergy = energy === level ? null : level;
    setEnergy(nextEnergy);
    commitReflection({ note, mood, energy: nextEnergy }, { silent: true });
  };

  const handleSaveNote = (event) => {
    event?.preventDefault();
    commitReflection({ note, mood, energy }, { silent: false });
  };

  const isDirty =
    note.trim() !== String(reflection?.summary_note || "").trim() ||
    mood !== normalizeMood(reflection?.mood) ||
    energy !==
      (typeof reflection?.energy_level === "number"
        ? reflection.energy_level
        : null);

  return (
    <div className="mt-stack">
      <section className="mt-card" aria-label="Что сделано за день">
        <div className="mt-card-head">
          <div>
            <h2 className="mt-card-title">Что сделано за день</h2>
            <p className="mt-card-sub">
              {feed.length > 0
                ? `${formatCountRu(feed.length, "выполненный шаг", "выполненных шага", "выполненных шагов")} по всем разделам`
                : "Каждое отмеченное действие появится здесь"}
            </p>
          </div>
          {onOpenYearReview ? (
            <Pill
              tone="goals"
              icon={<Award size={13} />}
              onClick={onOpenYearReview}
            >
              Итоги года
            </Pill>
          ) : feed.length > 0 ? (
            <Pill tone="success">{feed.length}</Pill>
          ) : null}
        </div>

        {feed.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={22} />}
            title="День только начинается"
            description="Отметьте стакан воды, привычку, приём пищи или задачу — всё соберётся в тёплую ленту дня."
          />
        ) : (
          <div className="mt-stack mt-stack--sm">
            <div className="today-done-feed">
              {visibleFeed.map((item) => {
                const meta = DOMAIN_META[item.domain] || DOMAIN_META.task;
                const Icon = meta.icon;
                return (
                  <div key={item.id} className="today-done-item">
                    <Pill tone={meta.tone} aria-label={meta.label}>
                      <Icon size={13} aria-hidden="true" />
                    </Pill>
                    <div
                      className="mt-stack mt-stack--xs"
                      style={{ flex: "1 1 auto", gap: 1 }}
                    >
                      <strong>{item.title}</strong>
                      {item.subtitle ? (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {item.subtitle}
                        </span>
                      ) : null}
                    </div>
                    {item.time ? <time>{item.time}</time> : null}
                  </div>
                );
              })}
            </div>

            {hiddenCount > 0 ? (
              <button
                type="button"
                className="mt-disclosure-btn"
                aria-expanded={expanded}
                onClick={() => setExpanded((prev) => !prev)}
              >
                <span>
                  {expanded ? "Свернуть ленту" : `Показать все ${feed.length}`}
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

      <section
        className="today-reflection-card"
        aria-label="Итог дня и самочувствие"
      >
        <div className="mt-card-head">
          <div>
            <h2 className="mt-card-title">Итог дня и заметка</h2>
            <p className="mt-card-sub">
              Коротко зафиксируйте настроение и главное за день
            </p>
          </div>
          {savedNotice && !isDirty ? (
            <Pill tone="success" icon={<Check size={12} />}>
              Сохранено
            </Pill>
          ) : null}
        </div>

        <div className="mt-field">
          <span className="mt-label">Настроение дня</span>
          <div className="today-mood-row" role="group" aria-label="Настроение дня">
            {DAY_MOODS.map((item) => (
              <Pill
                key={item.key}
                tone="brand"
                active={mood === item.key}
                onClick={() => handleSelectMood(item.key)}
              >
                {item.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="mt-field">
          <span className="mt-label">
            <span className="mt-row" style={{ gap: 5 }}>
              <Zap size={13} aria-hidden="true" />
              <span>
                Уровень энергии
                {energy
                  ? ` · ${ENERGY_LEVELS.find((e) => e.value === energy)?.label || energy}`
                  : ""}
              </span>
            </span>
          </span>
          <div
            role="group"
            aria-label="Уровень энергии"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            {ENERGY_LEVELS.map((lvl) => (
              <Pill
                key={lvl.value}
                tone="habits"
                active={energy === lvl.value}
                aria-label={`${lvl.value} — ${lvl.label}`}
                style={{ width: "100%", paddingInline: 0 }}
                onClick={() => handleSelectEnergy(lvl.value)}
              >
                {lvl.value}
              </Pill>
            ))}
          </div>
        </div>

        <form className="mt-stack mt-stack--sm" onSubmit={handleSaveNote}>
          <div className="mt-field">
            <label className="mt-label" htmlFor="today-reflection-note">
              Заметка о дне
            </label>
            <textarea
              id="today-reflection-note"
              className="mt-textarea"
              rows={4}
              style={{ minHeight: 108 }}
              placeholder="Что сегодня порадовало, за что хочется поблагодарить себя?"
              value={note}
              maxLength={2500}
              onChange={(e) => {
                setNote(e.target.value);
                if (savedNotice) setSavedNotice(false);
              }}
            />
          </div>
          <div className="mt-row mt-row--between">
            <span className="muted" style={{ fontSize: 12 }}>
              {isDirty ? "Есть несохранённые изменения" : "Все заметки сохранены"}
            </span>
            <button
              type="submit"
              className="mt-btn mt-btn--primary mt-btn--sm"
              disabled={saving}
            >
              {saving ? "Сохраняем..." : "Сохранить итог"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
