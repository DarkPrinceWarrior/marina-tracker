import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Sparkles, Zap } from "lucide-react";
import Sheet from "../Sheet.jsx";
import {
  EmptyState,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
} from "../UiPrimitives.jsx";
import { DAY_MOODS, ENERGY_LEVELS, formatCountRu } from "../../data/presets.js";

const DOMAIN_LABELS = {
  habit: "Привычка",
  vitamin: "Витамин",
  water: "Вода",
  workout: "Практика",
  meal: "Питание",
  chore: "Дом",
  task: "Задача",
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

export default function DailyAccomplishments({
  feed = [],
  reflection = null,
  selectedDate,
  onSaveReflection,
  doneSheetOpen = false,
  onOpenDoneSheet,
  onCloseDoneSheet,
  reflectionSheetOpen = false,
  onOpenReflectionSheet,
  onCloseReflectionSheet,
}) {
  const [note, setNote] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(reflection?.summary_note || "");
    setMood(normalizeMood(reflection?.mood));
    setEnergy(
      typeof reflection?.energy_level === "number"
        ? reflection.energy_level
        : null
    );
  }, [
    selectedDate,
    reflection?.log_date,
    reflection?.summary_note,
    reflection?.mood,
    reflection?.energy_level,
  ]);

  const moodLabel = useMemo(() => {
    if (!mood) return "";
    return DAY_MOODS.find((m) => m.key === mood)?.label || mood;
  }, [mood]);

  const reflectionMeta = useMemo(() => {
    const parts = [];
    if (moodLabel) parts.push(moodLabel);
    if (energy) parts.push(`энергия ${energy}/5`);
    const trimmedNote = String(reflection?.summary_note || "").trim();
    if (trimmedNote) {
      parts.push(
        trimmedNote.length > 36 ? `${trimmedNote.slice(0, 35)}…` : trimmedNote
      );
    }
    return parts.length > 0 ? parts.join(" · ") : "Настроение, энергия и заметка";
  }, [moodLabel, energy, reflection?.summary_note]);

  const commitReflection = async (nextValues, { silent = false, close = false } = {}) => {
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
      if (close) onCloseReflectionSheet?.();
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
    commitReflection({ note, mood, energy }, { silent: false, close: true });
  };

  return (
    <section className="mt-group-block" aria-label="Итоги дня">
      <GroupHeader title="Итоги дня" />

      <GroupList>
        <ListRow
          title="Выполнено за день"
          meta={
            feed.length > 0
              ? formatCountRu(
                  feed.length,
                  "шаг по всем разделам",
                  "шага по всем разделам",
                  "шагов по всем разделам"
                )
              : "Отмеченные дела появятся здесь"
          }
          trailing={
            <span className="mt-row" style={{ gap: 4 }}>
              <span
                className="muted tabular"
                style={{ fontSize: 13.5, fontWeight: 600 }}
              >
                {feed.length}
              </span>
              <ChevronRight size={16} className="muted" aria-hidden="true" />
            </span>
          }
          onClick={onOpenDoneSheet}
        />

        <ListRow
          title="Итог дня и заметка"
          meta={reflectionMeta}
          trailing={
            <ChevronRight size={16} className="muted" aria-hidden="true" />
          }
          onClick={onOpenReflectionSheet}
        />
      </GroupList>

      {/* Bottom Sheet: «Выполнено за день» */}
      <Sheet
        open={doneSheetOpen}
        onClose={onCloseDoneSheet}
        title="Выполнено за день"
        subtitle={
          feed.length > 0
            ? formatCountRu(feed.length, "выполненный шаг", "выполненных шага", "выполненных шагов")
            : "Лента выполненных дел"
        }
      >
        {feed.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={20} />}
            title="Пока нет отмеченных шагов"
            description="Отметьте воду, привычку, приём пищи или задачу — всё соберётся здесь."
          />
        ) : (
          <GroupList>
            {feed.map((item) => {
              const domainLabel = DOMAIN_LABELS[item.domain] || "Дело";
              const meta = [domainLabel, item.subtitle]
                .filter(Boolean)
                .join(" · ");
              return (
                <ListRow
                  key={item.id}
                  title={item.title}
                  meta={meta}
                  trailing={
                    item.time ? (
                      <span
                        className="muted tabular"
                        style={{ fontSize: 12.5, fontWeight: 500 }}
                      >
                        {item.time}
                      </span>
                    ) : null
                  }
                />
              );
            })}
          </GroupList>
        )}
      </Sheet>

      {/* Bottom Sheet: «Итог дня и заметка» */}
      <Sheet
        open={reflectionSheetOpen}
        onClose={onCloseReflectionSheet}
        title="Итог дня и заметка"
        subtitle="Настроение, энергия и главные мысли"
        footer={
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            disabled={saving}
            onClick={handleSaveNote}
          >
            {saving ? "Сохраняем..." : "Сохранить итог"}
          </button>
        }
      >
        <form className="mt-stack" onSubmit={handleSaveNote}>
          <div className="mt-field">
            <span className="mt-label">Настроение дня</span>
            <div
              className="today-mood-row"
              role="group"
              aria-label="Настроение дня"
            >
              {DAY_MOODS.map((item) => (
                <Pill
                  key={item.key}
                  tone="cobalt"
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
                  tone="cobalt"
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

          <div className="mt-field">
            <label className="mt-label" htmlFor="today-reflection-note">
              Заметка о дне
            </label>
            <textarea
              id="today-reflection-note"
              className="mt-textarea"
              rows={4}
              style={{ minHeight: 112 }}
              placeholder="Что сегодня порадовало, за что хочется поблагодарить себя?"
              value={note}
              maxLength={2500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </form>
      </Sheet>
    </section>
  );
}
