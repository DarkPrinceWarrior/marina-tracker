import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import api from "../../api.js";
import Sheet from "../Sheet.jsx";
import {
  EmptyState,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
} from "../UiPrimitives.jsx";
import GratitudeTab from "./GratitudeTab.jsx";
import {
  DAY_MOODS,
  ENERGY_LEVELS,
  GRATITUDE_CATEGORIES,
  formatCountRu,
} from "../../data/presets.js";
import { formatRelativeDayRu, todayISO } from "../../utils/date.js";

const DOMAIN_LABELS = {
  habit: "Привычка",
  vitamin: "Витамин",
  water: "Вода",
  workout: "Практика",
  meal: "Питание",
  chore: "Дом",
  task: "Задача",
};

const DAILY_GRATITUDE_MAX = 10;
const DAILY_GRATITUDE_MIN_TARGET = 5;

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
  gratitudesCountHint = 0,
  selectedDate,
  todayDate = todayISO(),
  notify,
  onSaveReflection,
  onGratitudeChanged,
  doneSheetOpen = false,
  onOpenDoneSheet,
  onCloseDoneSheet,
  reflectionSheetOpen = false,
  onOpenReflectionSheet,
  onCloseReflectionSheet,
  gratitudeSheetOpen = false,
  onOpenGratitudeSheet,
  onCloseGratitudeSheet,
}) {
  const activeDate = selectedDate || todayDate;

  // Reflection state
  const [note, setNote] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState(null);
  const [savingReflection, setSavingReflection] = useState(false);

  // Gratitudes state (shared between inline 5–10 block and full journal sheet)
  const [gratitudeItems, setGratitudeItems] = useState([]);
  const [recentGratitudes, setRecentGratitudes] = useState([]);
  const [gratitudesLoaded, setGratitudesLoaded] = useState(false);
  const [gratitudesError, setGratitudesError] = useState("");
  const [quickDraft, setQuickDraft] = useState("");
  const [submittingGratitude, setSubmittingGratitude] = useState(false);

  // Edit/Delete Gratitude Sheet state
  const [editingGratitude, setEditingGratitude] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("day");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const gratReqSeqRef = useRef(0);

  useEffect(() => {
    setNote(reflection?.summary_note || "");
    setMood(normalizeMood(reflection?.mood));
    setEnergy(
      typeof reflection?.energy_level === "number"
        ? reflection.energy_level
        : null
    );
  }, [
    activeDate,
    reflection?.log_date,
    reflection?.summary_note,
    reflection?.mood,
    reflection?.energy_level,
  ]);

  const loadGratitudes = useCallback(
    async (dateStr = activeDate, { silent = false } = {}) => {
      const seq = ++gratReqSeqRef.current;
      if (!silent) setGratitudesError("");
      try {
        const res = await api.getGratitudes(dateStr, 30);
        if (seq !== gratReqSeqRef.current) return;
        const rawItems = Array.isArray(res?.items) ? res.items : [];
        // Keep chronological order (1., 2., 3., ...) so newly added entries append cleanly
        const ordered = [...rawItems].sort((a, b) => (a.id || 0) - (b.id || 0));
        setGratitudeItems(ordered);
        setRecentGratitudes(Array.isArray(res?.recent) ? res.recent : []);
      } catch (err) {
        if (seq !== gratReqSeqRef.current) return;
        setGratitudesError(err?.message || "Не удалось загрузить благодарности.");
      } finally {
        if (seq === gratReqSeqRef.current) {
          setGratitudesLoaded(true);
        }
      }
    },
    [activeDate]
  );

  useEffect(() => {
    setGratitudesLoaded(false);
    loadGratitudes(activeDate);
  }, [activeDate, loadGratitudes]);

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

  const displayedGratitudeCount = gratitudesLoaded
    ? gratitudeItems.length
    : gratitudesCountHint;

  const commitReflection = async (
    nextValues,
    { silent = false, close = false } = {}
  ) => {
    if (!onSaveReflection) return;
    setSavingReflection(true);
    try {
      await onSaveReflection(
        {
          date: activeDate,
          summary_note: nextValues.note,
          mood: nextValues.mood,
          energy_level: nextValues.energy,
        },
        { silent }
      );
      if (close) onCloseReflectionSheet?.();
    } finally {
      setSavingReflection(false);
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

  const handleCreateGratitude = async ({ date, content, category = "day" }) => {
    const trimmed = String(content || "").trim();
    if (!trimmed || submittingGratitude) return false;
    setSubmittingGratitude(true);
    try {
      await api.createGratitude({
        date: date || activeDate,
        content: trimmed,
        category,
      });
      await loadGratitudes(activeDate, { silent: true });
      onGratitudeChanged?.();
      notify?.("Благодарность добавлена", "success");
      return true;
    } catch (err) {
      notify?.(err?.message || "Не удалось сохранить благодарность", "error");
      return false;
    } finally {
      setSubmittingGratitude(false);
    }
  };

  const handleQuickAddSubmit = async (event) => {
    event?.preventDefault();
    const ok = await handleCreateGratitude({
      date: activeDate,
      content: quickDraft,
      category: "day",
    });
    if (ok) {
      setQuickDraft("");
    }
  };

  const openEditGratitude = (item) => {
    setEditingGratitude(item);
    setEditContent(item.content || "");
    setEditCategory(item.category || "day");
    setEditError("");
  };

  const closeEditGratitude = () => {
    setEditingGratitude(null);
    setEditError("");
  };

  const handleSaveEditGratitude = async (event) => {
    event?.preventDefault();
    if (!editingGratitude?.id || savingEdit) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditError("Запись не может быть пустой.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      await api.updateGratitude(editingGratitude.id, {
        content: trimmed,
        category: editCategory,
      });
      closeEditGratitude();
      await loadGratitudes(activeDate, { silent: true });
      onGratitudeChanged?.();
      notify?.("Запись обновлена", "success");
    } catch (err) {
      setEditError(err?.message || "Не удалось обновить запись.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteEditGratitude = async () => {
    if (!editingGratitude?.id || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.deleteGratitude(editingGratitude.id);
      closeEditGratitude();
      await loadGratitudes(activeDate, { silent: true });
      onGratitudeChanged?.();
      notify?.("Запись удалена", "info");
    } catch (err) {
      notify?.(err?.message || "Не удалось удалить запись", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const visibleInlineItems = gratitudeItems.slice(0, DAILY_GRATITUDE_MAX);
  const nextNumber = gratitudeItems.length + 1;
  const reachedMinTarget = displayedGratitudeCount >= DAILY_GRATITUDE_MIN_TARGET;

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

        <ListRow
          title="Дневник благодарностей"
          meta={`${displayedGratitudeCount} из ${DAILY_GRATITUDE_MAX} за день`}
          trailing={
            <span className="mt-row" style={{ gap: 4 }}>
              <span
                className="muted tabular"
                style={{ fontSize: 13.5, fontWeight: 600 }}
              >
                {displayedGratitudeCount}
              </span>
              <ChevronRight size={16} className="muted" aria-hidden="true" />
            </span>
          }
          onClick={onOpenGratitudeSheet}
        />
      </GroupList>

      {/* Inline «Благодарности за день» (5–10 numbered items right inside «Итоги дня») */}
      <div
        className="gratitude-inline-card"
        style={{ marginTop: 4 }}
        aria-label="Благодарности за день"
      >
        <div className="gratitude-inline-head">
          <span className="gratitude-inline-title">Благодарности за день</span>
          <span
            className={`gratitude-progress-pill${reachedMinTarget ? " is-reached" : ""}`}
          >
            {displayedGratitudeCount} / {DAILY_GRATITUDE_MAX}
          </span>
        </div>

        {visibleInlineItems.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            className="gratitude-inline-row"
            onClick={() => openEditGratitude(item)}
          >
            <span className="gratitude-num">{idx + 1}.</span>
            <span className="gratitude-inline-text">{item.content}</span>
            <ChevronRight
              size={15}
              className="muted"
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            />
          </button>
        ))}

        {gratitudeItems.length < DAILY_GRATITUDE_MAX ? (
          <form className="gratitude-quick-add" onSubmit={handleQuickAddSubmit}>
            <span className="gratitude-num">{nextNumber}.</span>
            <input
              type="text"
              className="gratitude-quick-input"
              placeholder="Напишите благодарность…"
              aria-label={`Благодарность №${nextNumber}`}
              value={quickDraft}
              maxLength={500}
              onChange={(e) => setQuickDraft(e.target.value)}
            />
            <button
              type="submit"
              className="mt-btn mt-btn--primary mt-btn--sm"
              style={{ minWidth: 44, minHeight: 40, padding: "0 12px" }}
              disabled={submittingGratitude || !quickDraft.trim()}
              aria-label="Добавить благодарность"
            >
              <Plus size={16} />
            </button>
          </form>
        ) : null}

        {!reachedMinTarget ? (
          <p className="gratitude-hint">Цель дня: 5–10 благодарностей</p>
        ) : gratitudeItems.length >= DAILY_GRATITUDE_MAX ? (
          <p className="gratitude-hint">
            Записано{" "}
            {formatCountRu(
              gratitudeItems.length,
              "благодарность",
              "благодарности",
              "благодарностей"
            )}{" "}
            за день — тёплый итог
          </p>
        ) : null}
      </div>

      {/* Bottom Sheet: «Выполнено за день» */}
      <Sheet
        open={doneSheetOpen}
        onClose={onCloseDoneSheet}
        title="Выполнено за день"
        subtitle={
          feed.length > 0
            ? formatCountRu(
                feed.length,
                "выполненный шаг",
                "выполненных шага",
                "выполненных шагов"
              )
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
              const subtitleClean = String(item.subtitle || "").trim();
              const meta =
                subtitleClean &&
                subtitleClean.toLowerCase() !== domainLabel.toLowerCase()
                  ? `${domainLabel} · ${subtitleClean}`
                  : domainLabel;
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
            disabled={savingReflection}
            onClick={handleSaveNote}
          >
            {savingReflection ? "Сохраняем…" : "Сохранить итог"}
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

      {/* Bottom Sheet: Full «Дневник благодарностей» */}
      <Sheet
        open={gratitudeSheetOpen && !editingGratitude}
        onClose={onCloseGratitudeSheet}
        title="Дневник благодарностей"
        subtitle={`${displayedGratitudeCount} из ${DAILY_GRATITUDE_MAX} за день`}
      >
        <GratitudeTab
          items={gratitudeItems}
          recent={recentGratitudes}
          selectedDate={activeDate}
          todayDate={todayDate}
          loading={!gratitudesLoaded}
          error={gratitudesError}
          submitting={submittingGratitude}
          onRetry={() => loadGratitudes(activeDate)}
          onCreate={handleCreateGratitude}
          onSelectEdit={openEditGratitude}
        />
      </Sheet>

      {/* Bottom Sheet: Edit / Delete Gratitude */}
      <Sheet
        open={Boolean(editingGratitude)}
        onClose={closeEditGratitude}
        title="Редактировать запись"
        subtitle={
          editingGratitude?.log_date
            ? formatRelativeDayRu(editingGratitude.log_date)
            : ""
        }
        footer={
          <div className="mt-stack mt-stack--sm">
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--wide"
              disabled={savingEdit}
              onClick={handleSaveEditGratitude}
            >
              {savingEdit ? "Сохраняем…" : "Сохранить изменения"}
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--danger mt-btn--wide"
              disabled={savingEdit}
              onClick={handleDeleteEditGratitude}
            >
              <Trash2 size={15} />
              <span>Удалить запись</span>
            </button>
          </div>
        }
      >
        <form className="mt-stack" onSubmit={handleSaveEditGratitude}>
          <div className="mt-field">
            <label className="mt-label" htmlFor="gratitude-edit-input">
              Текст благодарности
            </label>
            <textarea
              id="gratitude-edit-input"
              className="mt-textarea"
              rows={4}
              style={{ minHeight: 108 }}
              value={editContent}
              maxLength={500}
              onChange={(e) => {
                setEditContent(e.target.value);
                if (editError) setEditError("");
              }}
            />
            {editError ? <p className="mt-form-error">{editError}</p> : null}
          </div>

          <div className="mt-field">
            <span className="mt-label">Категория</span>
            <div className="mt-chip-row mt-chip-row--wrap">
              {GRATITUDE_CATEGORIES.map((cat) => (
                <Pill
                  key={cat.key}
                  tone="cobalt"
                  active={editCategory === cat.key}
                  onClick={() => setEditCategory(cat.key)}
                >
                  {cat.label}
                </Pill>
              ))}
            </div>
          </div>
        </form>
      </Sheet>
    </section>
  );
}
