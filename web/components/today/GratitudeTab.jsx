import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Heart, Plus, Trash2 } from "lucide-react";
import api from "../../api.js";
import Sheet from "../Sheet.jsx";
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

export default function GratitudeTab({
  selectedDate,
  todayDate = todayISO(),
  notify,
  onChanged,
}) {
  const activeDate = selectedDate || todayDate;

  const [items, setItems] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState("day");
  const [submitting, setSubmitting] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("day");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const reqSeqRef = useRef(0);

  const loadGratitudes = useCallback(
    async (dateStr = activeDate, { silent = false } = {}) => {
      const seq = ++reqSeqRef.current;
      if (!silent) setError("");
      try {
        const res = await api.getGratitudes(dateStr, 30);
        if (seq !== reqSeqRef.current) return;
        setItems(Array.isArray(res?.items) ? res.items : []);
        setRecent(Array.isArray(res?.recent) ? res.recent : []);
      } catch (err) {
        if (seq !== reqSeqRef.current) return;
        setError(err?.message || "Не удалось загрузить благодарности.");
      } finally {
        if (seq === reqSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [activeDate]
  );

  useEffect(() => {
    loadGratitudes(activeDate);
  }, [activeDate, loadGratitudes]);

  const recentOtherDays = useMemo(
    () => recent.filter((item) => item.log_date !== activeDate),
    [recent, activeDate]
  );

  const handleAdd = async (event) => {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await api.createGratitude({
        date: activeDate,
        content: trimmed,
        category,
      });
      setDraft("");
      await loadGratitudes(activeDate, { silent: true });
      onChanged?.();
      notify?.("Благодарность добавлена", "success");
    } catch (err) {
      notify?.(err?.message || "Не удалось сохранить запись", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditSheet = (item) => {
    setEditing(item);
    setEditContent(item.content || "");
    setEditCategory(item.category || "day");
    setEditError("");
  };

  const closeEditSheet = () => {
    setEditing(null);
    setEditError("");
  };

  const handleSaveEdit = async (event) => {
    event?.preventDefault();
    if (!editing?.id || savingEdit) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditError("Запись не может быть пустой.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      await api.updateGratitude(editing.id, {
        content: trimmed,
        category: editCategory,
      });
      closeEditSheet();
      await loadGratitudes(activeDate, { silent: true });
      onChanged?.();
      notify?.("Запись обновлена", "success");
    } catch (err) {
      setEditError(err?.message || "Не удалось обновить запись.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteEdit = async () => {
    if (!editing?.id || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.deleteGratitude(editing.id);
      closeEditSheet();
      await loadGratitudes(activeDate, { silent: true });
      onChanged?.();
      notify?.("Запись удалена", "info");
    } catch (err) {
      notify?.(err?.message || "Не удалось удалить запись", "error");
    } finally {
      setSavingEdit(false);
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
        onSubmit={handleAdd}
        aria-label="Добавить благодарность"
      >
        <div className="mt-field">
          <label className="mt-label" htmlFor="gratitude-new-input">
            Дневник благодарностей
          </label>
          <textarea
            id="gratitude-new-input"
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
          aria-label="Кому или чему благодарность"
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
            {formatRelativeDayRu(activeDate)}
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
          <button
            type="button"
            className="mt-btn mt-btn--secondary mt-btn--sm"
            onClick={() => loadGratitudes(activeDate)}
          >
            Повторить загрузку
          </button>
        </div>
      ) : null}

      <section className="mt-group-block" aria-label={dayHeaderTitle}>
        <GroupHeader
          title={dayHeaderTitle}
          meta={items.length > 0 ? String(items.length) : ""}
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
              description="Запишите даже одну тёплую мелочь — это помогает замечать хорошее."
            />
          </GroupList>
        ) : (
          <GroupList>
            {items.map((item) => (
              <ListRow
                key={item.id}
                title={item.content}
                meta={GRATITUDE_CATEGORY_MAP[item.category]?.label || "Дню"}
                trailing={
                  <ChevronRight
                    size={16}
                    className="muted"
                    aria-hidden="true"
                  />
                }
                onClick={() => openEditSheet(item)}
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
                  onClick={() => openEditSheet(item)}
                />
              );
            })}
          </GroupList>
        </section>
      ) : null}

      <Sheet
        open={Boolean(editing)}
        onClose={closeEditSheet}
        title="Редактировать запись"
        subtitle={
          editing?.log_date ? formatRelativeDayRu(editing.log_date) : ""
        }
        footer={
          <div className="mt-stack mt-stack--sm">
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--wide"
              disabled={savingEdit}
              onClick={handleSaveEdit}
            >
              {savingEdit ? "Сохраняем..." : "Сохранить изменения"}
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--danger mt-btn--wide"
              disabled={savingEdit}
              onClick={handleDeleteEdit}
            >
              <Trash2 size={15} />
              <span>Удалить запись</span>
            </button>
          </div>
        }
      >
        <form className="mt-stack" onSubmit={handleSaveEdit}>
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
    </div>
  );
}
