import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
} from "lucide-react";
import api from "../../api.js";
import {
  GroupHeader,
  GroupList,
  ListRow,
  EmptyState,
} from "../UiPrimitives.jsx";
import EventFormSheet from "./EventFormSheet.jsx";
import { EVENT_CATEGORY_MAP } from "../../data/presets.js";
import {
  WEEKDAY_SHORT_RU,
  todayISO,
  parseISODate,
  shiftMonth,
  getMonthMatrix,
  formatMonthYearRu,
  formatDateRu,
  formatDateShortRu,
  formatRelativeDayRu,
} from "../../utils/date.js";

function buildEventMeta(ev, includeDate = false) {
  const parts = [];
  if (includeDate && ev.event_date) {
    const rel = formatRelativeDayRu(ev.event_date);
    parts.push(
      rel === "Сегодня" || rel === "Завтра" || rel === "Вчера"
        ? rel
        : formatDateShortRu(ev.event_date),
    );
  }
  if (ev.event_time) parts.push(ev.event_time);
  const catLabel = EVENT_CATEGORY_MAP[ev.category]?.label;
  if (catLabel) parts.push(catLabel);
  if (ev.location) parts.push(ev.location);
  return parts.join(" · ");
}

export default function EventsCalendarTab({
  todayDate,
  notify,
  onDataChanged,
  createSignal = 0,
}) {
  const activeToday = todayDate || todayISO();
  const initialDateObj = parseISODate(activeToday);

  const [viewYear, setViewYear] = useState(initialDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDateObj.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(activeToday);

  const [monthItems, setMonthItems] = useState([]);
  const [monthDaysMap, setMonthDaysMap] = useState({});
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  const loadEvents = useCallback(async () => {
    try {
      const data = await api.getEvents({ year: viewYear, month: viewMonth });
      setMonthItems(Array.isArray(data?.items) ? data.items : []);
      setMonthDaysMap(
        data?.month_days_map && typeof data.month_days_map === "object"
          ? data.month_days_map
          : {},
      );
      setUpcoming(Array.isArray(data?.upcoming) ? data.upcoming : []);
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить календарь событий", "error");
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth, notify]);

  useEffect(() => {
    setLoading(true);
    loadEvents();
  }, [loadEvents]);

  // Open new event sheet when header "+ Событие" button is pressed
  useEffect(() => {
    if (createSignal > 0) {
      setEditingEvent(null);
      setSheetOpen(true);
    }
  }, [createSignal]);

  const weeks = useMemo(
    () => getMonthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const selectedDayEvents = useMemo(() => {
    const fromMap = monthDaysMap[selectedDate];
    if (Array.isArray(fromMap)) return fromMap;
    return monthItems.filter((ev) => ev.event_date === selectedDate);
  }, [monthDaysMap, monthItems, selectedDate]);

  function handleShiftMonth(delta) {
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  function handleSelectCell(cell) {
    setSelectedDate(cell.iso);
    if (cell.year !== viewYear || cell.month !== viewMonth) {
      setViewYear(cell.year);
      setViewMonth(cell.month);
    }
  }

  async function handleToggleEvent(ev) {
    const nextCompleted = !ev.completed;
    try {
      await api.toggleEvent(ev.id, nextCompleted);
      await loadEvents();
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось обновить событие", "error");
    }
  }

  async function handleSaveEvent(payload) {
    if (payload.id) {
      const { id, ...body } = payload;
      await api.updateEvent(id, body);
      notify?.("Событие обновлено", "success");
    } else {
      const { id, ...body } = payload;
      await api.createEvent(body);
      notify?.("Событие добавлено", "success");
    }
    if (payload.event_date) {
      const dt = parseISODate(payload.event_date);
      setSelectedDate(payload.event_date);
      setViewYear(dt.getFullYear());
      setViewMonth(dt.getMonth() + 1);
    }
    await loadEvents();
    onDataChanged?.();
  }

  async function handleDeleteEvent(eventId) {
    await api.deleteEvent(eventId);
    notify?.("Событие удалено", "info");
    await loadEvents();
    onDataChanged?.();
  }

  const selectedDateTitle = useMemo(() => {
    const rel = formatRelativeDayRu(selectedDate);
    if (rel === "Сегодня" || rel === "Завтра" || rel === "Вчера") {
      return `${rel}, ${formatDateRu(selectedDate)}`;
    }
    return formatDateRu(selectedDate);
  }, [selectedDate]);

  return (
    <div className="mt-stack">
      {/* Monthly Calendar Card */}
      <div className="events-cal-card">
        <div className="events-cal-header">
          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Предыдущий месяц"
            onClick={() => handleShiftMonth(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <h3>{formatMonthYearRu(viewYear, viewMonth)}</h3>
          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Следующий месяц"
            onClick={() => handleShiftMonth(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="events-cal-weekdays" aria-hidden="true">
          {WEEKDAY_SHORT_RU.map((wd) => (
            <span key={wd}>{wd}</span>
          ))}
        </div>

        <div className="events-cal-grid" role="grid" aria-label="Календарь событий">
          {weeks.flat().map((cell) => {
            const dayEvents = monthDaysMap[cell.iso] || [];
            const hasEvents = dayEvents.length > 0;
            const isSelected = cell.iso === selectedDate;
            const dotsCount = Math.min(3, dayEvents.length);

            return (
              <button
                key={cell.iso}
                type="button"
                className={[
                  "events-cal-day",
                  !cell.inMonth ? "is-outside" : "",
                  hasEvents ? "has-events" : "",
                  cell.isToday ? "is-today" : "",
                  isSelected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`${formatDateRu(cell.iso)}${hasEvents ? `, событий: ${dayEvents.length}` : ""}`}
                aria-pressed={isSelected}
                onClick={() => handleSelectCell(cell)}
              >
                <span>{cell.day}</span>
                <span className="events-cal-dots" aria-hidden="true">
                  {Array.from({ length: dotsCount }, (_, idx) => (
                    <span key={idx} className="events-cal-dot" />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Events */}
      <div className="mt-stack mt-stack--xs">
        <GroupHeader
          title={selectedDateTitle}
          meta={selectedDayEvents.length > 0 ? String(selectedDayEvents.length) : undefined}
          action={
            <button
              type="button"
              className="mt-btn mt-btn--ghost mt-btn--sm"
              onClick={() => {
                setEditingEvent(null);
                setSheetOpen(true);
              }}
            >
              <Plus size={15} />
              <span>Событие</span>
            </button>
          }
        />

        {loading ? (
          <div className="mt-card mt-card--compact">
            <p className="mt-card-sub">Загружаем события…</p>
          </div>
        ) : selectedDayEvents.length > 0 ? (
          <GroupList>
            {selectedDayEvents.map((ev) => (
              <ListRow
                key={ev.id}
                checked={Boolean(ev.completed)}
                onToggle={() => handleToggleEvent(ev)}
                onClick={() => {
                  setEditingEvent(ev);
                  setSheetOpen(true);
                }}
                strikethrough={true}
                accent="cobalt"
                title={ev.title}
                meta={buildEventMeta(ev, false)}
                trailing={
                  <ChevronRight size={16} className="muted" aria-hidden="true" />
                }
              />
            ))}
          </GroupList>
        ) : (
          <GroupList>
            <button
              type="button"
              className="nutrition-empty-row"
              onClick={() => {
                setEditingEvent(null);
                setSheetOpen(true);
              }}
            >
              <span>Добавить событие на этот день</span>
              <Plus size={16} aria-hidden="true" />
            </button>
          </GroupList>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="mt-stack mt-stack--xs">
        <GroupHeader
          title="Ближайшие события"
          meta={upcoming.length > 0 ? String(upcoming.length) : undefined}
        />

        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={22} />}
            title="Ближайших записей нет"
            description="Добавьте врача, косметолога, встречу или важное событие."
          />
        ) : (
          <GroupList>
            {upcoming.map((ev) => (
              <ListRow
                key={ev.id}
                checked={Boolean(ev.completed)}
                onToggle={() => handleToggleEvent(ev)}
                onClick={() => {
                  if (ev.event_date) {
                    const dt = parseISODate(ev.event_date);
                    setSelectedDate(ev.event_date);
                    setViewYear(dt.getFullYear());
                    setViewMonth(dt.getMonth() + 1);
                  }
                  setEditingEvent(ev);
                  setSheetOpen(true);
                }}
                strikethrough={true}
                accent="cobalt"
                title={ev.title}
                meta={buildEventMeta(ev, true)}
                trailing={
                  <ChevronRight size={16} className="muted" aria-hidden="true" />
                }
              />
            ))}
          </GroupList>
        )}
      </div>

      <EventFormSheet
        open={sheetOpen}
        event={editingEvent}
        defaultDate={selectedDate}
        onClose={() => {
          setSheetOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
      />
    </div>
  );
}
