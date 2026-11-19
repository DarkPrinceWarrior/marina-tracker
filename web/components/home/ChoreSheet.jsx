import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Sheet from "../Sheet.jsx";
import { Pill } from "../UiPrimitives.jsx";
import { CHORE_FREQUENCIES, CHORE_ZONES } from "../../data/presets.js";

export default function ChoreSheet({
  open,
  chore = null,
  onClose,
  onSave,
  onDelete,
}) {
  const isEditing = Boolean(chore?.id);
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("Кухня");
  const [frequency, setFrequency] = useState("weekly");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(chore?.title || "");
    setZone(chore?.zone || "Кухня");
    setFrequency(chore?.frequency || "weekly");
    setSaving(false);
    setConfirmDelete(false);
    setError("");
  }, [open, chore]);

  async function handleSubmit(event) {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введите название дела");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave({
        id: chore?.id,
        title: trimmed,
        zone,
        frequency,
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось сохранить дело");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!chore?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onDelete?.(chore.id);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось удалить дело");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Дело по дому" : "Новое дело"}
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
                ? "Сохранить"
                : "Добавить дело"}
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
                {confirmDelete ? "Подтвердить удаление" : "Удалить дело"}
              </span>
            </button>
          )}
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        {error ? <div className="mt-form-error">{error}</div> : null}

        <div className="mt-field">
          <label className="mt-label" htmlFor="chore-title-input">
            Название
          </label>
          <input
            id="chore-title-input"
            type="text"
            className="mt-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
            placeholder="Например: протереть зеркала"
            autoComplete="off"
          />
        </div>

        <div className="mt-field">
          <span className="mt-label">Зона</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {CHORE_ZONES.map((z) => (
              <Pill
                key={z.key}
                tone="neutral"
                active={zone === z.key}
                onClick={() => setZone(z.key)}
              >
                {z.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="mt-field">
          <span className="mt-label">Периодичность</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {CHORE_FREQUENCIES.map((freq) => (
              <Pill
                key={freq.key}
                tone="neutral"
                active={frequency === freq.key}
                onClick={() => setFrequency(freq.key)}
              >
                {freq.label}
              </Pill>
            ))}
          </div>
        </div>
      </form>
    </Sheet>
  );
}
