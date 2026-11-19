import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Sheet from "../Sheet.jsx";
import { GroupList, ListRow, SelectField } from "../UiPrimitives.jsx";
import { GOAL_SPHERES } from "../../data/presets.js";

export default function WishFormSheet({
  open,
  wish = null,
  defaultYear,
  defaultCategory = "Развлечения и отдых",
  onClose,
  onSave,
  onDelete,
}) {
  const isEditing = Boolean(wish?.id);
  const currentYear = defaultYear || new Date().getFullYear();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [targetYear, setTargetYear] = useState(currentYear);
  const [note, setNote] = useState("");
  const [fulfilled, setFulfilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (wish?.id) {
      setTitle(wish.title || "");
      setCategory(wish.category || "Развлечения и отдых");
      setTargetYear(Number(wish.target_year) || currentYear);
      setNote(wish.note || "");
      setFulfilled(Boolean(wish.fulfilled));
    } else {
      setTitle("");
      setCategory(defaultCategory || "Развлечения и отдых");
      setTargetYear(currentYear);
      setNote("");
      setFulfilled(false);
    }
    setSaving(false);
    setConfirmDelete(false);
    setError("");
  }, [open, wish, currentYear, defaultCategory]);

  const categoryOptions = GOAL_SPHERES.map((s) => ({
    value: s.key,
    label: s.label,
  }));

  const baseYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => {
    const y = String(baseYear - 1 + i);
    return { value: y, label: `${y} год` };
  });

  async function handleSubmit(event) {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введите желание");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        id: wish?.id,
        title: trimmed,
        category,
        target_year: Number(targetYear) || currentYear,
        note: note.trim(),
        fulfilled,
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось сохранить желание");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!wish?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onDelete?.(wish.id);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось удалить желание");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Желание" : "Новое желание"}
      footer={
        <div className="mt-stack mt-stack--sm">
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving
              ? "Сохраняем..."
              : isEditing
                ? "Сохранить изменения"
                : "Добавить желание"}
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
                {confirmDelete ? "Подтвердить удаление" : "Удалить желание"}
              </span>
            </button>
          )}
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        {error ? <div className="mt-form-error">{error}</div> : null}

        <div className="mt-field">
          <label className="mt-label" htmlFor="wish-title-input">
            Желание
          </label>
          <input
            id="wish-title-input"
            type="text"
            className="mt-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
            placeholder="Например: поездка к морю осенью"
            autoComplete="off"
          />
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="wish-category-select">
            Категория
          </label>
          <SelectField
            id="wish-category-select"
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            ariaLabel="Категория желания"
          />
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="wish-year-select">
            Год
          </label>
          <SelectField
            id="wish-year-select"
            value={String(targetYear)}
            onChange={(val) => setTargetYear(Number(val))}
            options={yearOptions}
            ariaLabel="Год желания"
            compact
          />
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="wish-note-input">
            Заметка
          </label>
          <textarea
            id="wish-note-input"
            className="mt-textarea"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Подробности, место или вдохновение"
          />
        </div>

        {isEditing && (
          <GroupList>
            <ListRow
              checked={fulfilled}
              onToggle={() => setFulfilled((prev) => !prev)}
              accent="cobalt"
              title="Желание исполнено"
              meta={fulfilled ? "Отмечено как исполненное" : "Пока в списке мечт"}
            />
          </GroupList>
        )}
      </form>
    </Sheet>
  );
}
