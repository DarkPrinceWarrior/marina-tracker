import React, { useMemo, useState } from "react";
import { ChevronRight, Heart, Plus } from "lucide-react";
import {
  EmptyState,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
} from "../UiPrimitives.jsx";
import {
  GRATITUDE_CATEGORIES,
  GRATITUDE_CATEGORY_MAP,
} from "../../data/presets.js";
import {
  formatDateShortRu,
  formatRelativeDayRu,
  todayISO,
} from "../../utils/date.js";

/**
 * Full Gratitude Journal panel rendered inside the «Дневник благодарностей» Sheet.
 * Supports category-tagged creation, viewing all entries for the selected day,
 * browsing recent entries across past days, and opening the shared edit/delete sheet.
 */
export default function GratitudeTab({
  items = [],
  recent = [],
  selectedDate,
  todayDate = todayISO(),
  loading = false,
  error = "",
  submitting = false,
  onRetry,
  onCreate,
  onSelectEdit,
}) {
  const activeDate = selectedDate || todayDate;
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState("day");

  const recentOtherDays = useMemo(
    () => recent.filter((item) => item.log_date !== activeDate),
    [recent, activeDate]
  );

  const handleSubmit = async (event) => {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    const ok = await onCreate?.({
      date: activeDate,
      content: trimmed,
      category,
    });
    if (ok !== false) {
      setDraft("");
    }
  };

  const dayHeaderTitle =
    activeDate === todayDate
      ? "Благодарности сегодня"
      : `Благодарности · ${formatDateShortRu(activeDate)}`;

  return (
    <div className="mt-stack">
      <form
        className="gratitude-composer"
        onSubmit={handleSubmit}
        aria-label="Добавить благодарность в дневник"
      >
        <div className="mt-field">
          <label className="mt-label" htmlFor="gratitude-sheet-input">
            Новая запись
          </label>
          <textarea
            id="gratitude-sheet-input"
            className="mt-textarea"
            rows={2}
            style={{ minHeight: 74 }}
            placeholder="За что хочется сказать спасибо сегодня?"
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>

        <div
          className="mt-chip-row"
          role="group"
          aria-label="Категория благодарности"
        >
          {GRATITUDE_CATEGORIES.map((cat) => (
            <Pill
              key={cat.key}
              tone="cobalt"
              active={category === cat.key}
              onClick={() => setCategory(cat.key)}
            >
              {cat.label}
            </Pill>
          ))}
        </div>

        <div className="mt-row mt-row--between">
          <span className="muted" style={{ fontSize: 12.5 }}>
            {formatRelativeDayRu(activeDate)} · {items.length} / 10
          </span>
          <button
            type="submit"
            className="mt-btn mt-btn--primary mt-btn--sm"
            disabled={submitting || !draft.trim()}
          >
            <Plus size={15} />
            <span>{submitting ? "Сохраняем..." : "Добавить"}</span>
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-form-error">{error}</p>
          {onRetry ? (
            <button
              type="button"
              className="mt-btn mt-btn--secondary mt-btn--sm"
              onClick={onRetry}
            >
              Повторить загрузку
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="mt-group-block" aria-label={dayHeaderTitle}>
        <GroupHeader
          title={dayHeaderTitle}
          meta={items.length > 0 ? `${items.length} / 10` : ""}
        />

        {loading && items.length === 0 ? (
          <div className="mt-card mt-card--compact">
            <p className="mt-card-sub">Загружаем записи...</p>
          </div>
        ) : items.length === 0 ? (
          <GroupList>
            <EmptyState
              icon={<Heart size={20} />}
              title="Пока нет записей за этот день"
              description="Запишите 5–10 тёплых мелочей — это бережно меняет фокус дня."
            />
          </GroupList>
        ) : (
          <GroupList>
            {items.map((item, idx) => (
              <ListRow
                key={item.id}
                title={`${idx + 1}. ${item.content}`}
                meta={GRATITUDE_CATEGORY_MAP[item.category]?.label || "Дню"}
                trailing={
                  <ChevronRight
                    size={16}
                    className="muted"
                    aria-hidden="true"
                  />
                }
                onClick={() => onSelectEdit?.(item)}
              />
            ))}
          </GroupList>
        )}
      </section>

      {recentOtherDays.length > 0 ? (
        <section className="mt-group-block" aria-label="Недавние записи">
          <GroupHeader
            title="Недавние записи"
            meta={String(recentOtherDays.length)}
          />
          <GroupList>
            {recentOtherDays.map((item) => {
              const catLabel =
                GRATITUDE_CATEGORY_MAP[item.category]?.label || "Дню";
              return (
                <ListRow
                  key={item.id}
                  title={item.content}
                  meta={`${formatDateShortRu(item.log_date)} · ${catLabel}`}
                  trailing={
                    <ChevronRight
                      size={16}
                      className="muted"
                      aria-hidden="true"
                    />
                  }
                  onClick={() => onSelectEdit?.(item)}
                />
              );
            })}
          </GroupList>
        </section>
      ) : null}
    </div>
  );
}
