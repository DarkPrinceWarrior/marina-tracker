import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Sheet from "../Sheet.jsx";
import { Pill } from "../UiPrimitives.jsx";
import { EVENT_CATEGORIES } from "../../data/presets.js";
import { todayISO } from "../../utils/date.js";

export default function EventFormSheet({
  open,
  event = null,
  defaultDate,
  onClose,
  onSave,
  onDelete,
}) {
  const isEditing = Boolean(event?.id);
  const fallbackDate = defaultDate || todayISO();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("doctor");
  const [eventDate, setEventDate] = useState(fallbackDate);
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (event?.id) {
      setTitle(event.title || "");
      setCategory(event.category || "event");
      setEventDate(event.event_date || fallbackDate);
      setEventTime(event.event_time || "");
      setLocation(event.location || "");
      setNote(event.note || "");
    } else {
      setTitle("");
      setCategory("doctor");
      setEventDate(fallbackDate);
      setEventTime("");
      setLocation("");
      setNote("");
    }
    setSaving(false);
    setConfirmDelete(false);
    setError("");
  }, [open, event, fallbackDate]);

  async function handleSubmit(e) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введите название события");
      return;
    }
    if (!eventDate) {
      setError("Выберите дату события");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        id: event?.id,
        title: trimmed,
        category,
        event_date: eventDate,
        event_time: eventTime.trim(),
        location: location.trim(),
        note: note.trim(),
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось сохранить событие");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onDelete?.(event.id);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Не удалось удалить событие");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Событие" : "Новое событие"}
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
                : "Добавить событие"}
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
                {confirmDelete ? "Подтвердить удаление" : "Удалить событие"}
              </span>
            </button>
          )}
        </div>
      }
    >
      <form className="mt-stack" onSubmit={handleSubmit}>
        {error ? <div className="mt-form-error">{error}</div> : null}

        <div className="mt-field">
          <label className="mt-label" htmlFor="event-title-input">
            Название
          </label>
          <input
            id="event-title-input"
            type="text"
            className="mt-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError("");
            }}
            placeholder="Например: запись к стоматологу"
            autoComplete="off"
          />
        </div>

        <div className="mt-field">
          <span className="mt-label">Категория</span>
          <div className="mt-chip-row mt-chip-row--wrap">
            {EVENT_CATEGORIES.map((cat) => (
              <Pill
                key={cat.key}
                tone="neutral"
                active={category === cat.key}
                onClick={() => setCategory(cat.key)}
              >
                {cat.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="mt-form-grid">
          <div className="mt-field">
            <label className="mt-label" htmlFor="event-date-input">
              Дата
            </label>
            <input
              id="event-date-input"
              type="date"
              className="mt-input"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>

          <div className="mt-field">
            <label className="mt-label" htmlFor="event-time-input">
              Время
            </label>
            <input
              id="event-time-input"
              type="time"
              className="mt-input"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="event-location-input">
            Место или адрес
          </label>
          <input
            id="event-location-input"
            type="text"
            className="mt-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Клиника, салон или адрес"
            autoComplete="off"
          />
        </div>

        <div className="mt-field">
          <label className="mt-label" htmlFor="event-note-input">
            Заметка
          </label>
          <textarea
            id="event-note-input"
            className="mt-textarea"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Подготовка, документы или детали"
          />
        </div>
      </form>
    </Sheet>
  );
}
