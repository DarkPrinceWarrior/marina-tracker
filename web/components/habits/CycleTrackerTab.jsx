import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Settings2,
  Trash2,
} from "lucide-react";
import api from "../../api.js";
import Sheet from "../Sheet.jsx";
import {
  CheckRow,
  EmptyState,
  Pill,
  StepperPill,
} from "../UiPrimitives.jsx";
import { CYCLE_PHASES } from "../../data/presets.js";
import {
  WEEKDAY_SHORT_RU,
  formatCountRu,
  formatDateShortRu,
  formatDateWithYearRu,
  formatMonthYearRu,
  formatShortRangeRu,
  getLastNMonths,
  getMonthMatrix,
  parseISODate,
  shiftMonth,
  todayISO,
} from "../../utils/date.js";

const SYMPTOM_OPTIONS = [
  { key: "cramps", label: "Тянет живот" },
  { key: "fatigue", label: "Усталость" },
  { key: "headache", label: "Головная боль" },
  { key: "bloating", label: "Отёки" },
  { key: "high_energy", label: "Энергия" },
  { key: "calm_sleep", label: "Спокойствие" },
  { key: "mood_swings", label: "ПМС" },
  { key: "tender_breasts", label: "Чувствительность груди" },
];

const SYMPTOM_LABEL_MAP = Object.fromEntries(
  SYMPTOM_OPTIONS.map((s) => [s.key, s.label]),
);
const SYMPTOM_KEY_BY_LABEL = Object.fromEntries(
  SYMPTOM_OPTIONS.map((s) => [s.label.toLowerCase(), s.key]),
);

const MOOD_OPTIONS = [
  { key: "calm", label: "Спокойствие" },
  { key: "energized", label: "Вдохновение" },
  { key: "balanced", label: "Ровно" },
  { key: "tired", label: "Усталость" },
  { key: "sensitive", label: "Чувствительность" },
  { key: "focused", label: "Собранность" },
];

const MOOD_LABEL_MAP = Object.fromEntries(
  MOOD_OPTIONS.map((m) => [m.key, m.label]),
);
const MOOD_KEY_BY_LABEL = Object.fromEntries(
  MOOD_OPTIONS.map((m) => [m.label.toLowerCase(), m.key]),
);

const FLOW_LEVELS = [
  { key: "light", label: "Лёгкие" },
  { key: "medium", label: "Средние" },
  { key: "heavy", label: "Обильные" },
];

function normalizeSymptomKey(raw) {
  if (!raw) return "";
  const str = String(raw).trim();
  if (SYMPTOM_LABEL_MAP[str]) return str;
  const byLabel = SYMPTOM_KEY_BY_LABEL[str.toLowerCase()];
  return byLabel || str;
}

function formatSymptomRu(raw) {
  const key = normalizeSymptomKey(raw);
  return SYMPTOM_LABEL_MAP[key] || raw;
}

function normalizeMoodKey(raw) {
  if (!raw) return "";
  const str = String(raw).trim();
  if (MOOD_LABEL_MAP[str]) return str;
  return MOOD_KEY_BY_LABEL[str.toLowerCase()] || str;
}

export default function CycleTrackerTab({
  todayDate,
  notify,
  onDataChanged,
}) {
  const effectiveToday = todayDate || todayISO();
  const initialDateObj = useMemo(() => parseISODate(effectiveToday), [effectiveToday]);

  const [viewYear, setViewYear] = useState(initialDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDateObj.getMonth() + 1);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCalDate, setSelectedCalDate] = useState(null);

  // Day editor sheet state
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [dayForm, setDayForm] = useState({
    date: "",
    is_period: false,
    flow: "medium",
    symptoms: [],
    mood: "",
    note: "",
    hasExisting: false,
  });
  const [savingDay, setSavingDay] = useState(false);

  // Month/year quick picker sheet
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  // Cycle settings sheet
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    avg_cycle_length: 28,
    avg_period_length: 5,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const calendarRef = useRef(null);

  const loadOverview = useCallback(async (y, m) => {
    setError("");
    try {
      const res = await api.getCycleOverview(y, m);
      setOverview(res);
    } catch (err) {
      setError(err?.message || "Не удалось загрузить календарь цикла.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(viewYear, viewMonth);
  }, [viewYear, viewMonth, loadOverview]);

  // Combined map of recorded cycle days (400d archive + current requested month)
  const daysMap = useMemo(() => {
    const map = {};
    if (overview?.days_map_400d) {
      Object.entries(overview.days_map_400d).forEach(([iso, rec]) => {
        map[iso] = rec;
      });
    }
    if (Array.isArray(overview?.month_days)) {
      overview.month_days.forEach((rec) => {
        if (rec?.log_date) map[rec.log_date] = rec;
      });
    }
    return map;
  }, [overview]);

  const predictedSet = useMemo(
    () => new Set(overview?.predicted_period_dates || []),
    [overview],
  );
  const fertileSet = useMemo(
    () => new Set(overview?.predicted_fertile_dates || []),
    [overview],
  );
  const ovulationSet = useMemo(
    () => new Set(overview?.predicted_ovulation_dates || []),
    [overview],
  );

  const monthMatrix = useMemo(
    () => getMonthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  // 18 past months + 2 future months for effortless 12+ month navigation
  const monthPickerOptions = useMemo(() => {
    const base = parseISODate(effectiveToday);
    const curY = base.getFullYear();
    const curM = base.getMonth() + 1;
    const future = [2, 1].map((delta) => {
      const { year, month } = shiftMonth(curY, curM, delta);
      return {
        year,
        month,
        key: `${year}-${String(month).padStart(2, "0")}`,
        label: formatMonthYearRu(year, month),
        isFuture: true,
      };
    });
    const pastAndNow = getLastNMonths(18, effectiveToday);
    return [...future, ...pastAndNow];
  }, [effectiveToday]);

  const isViewingCurrentMonth =
    viewYear === initialDateObj.getFullYear() &&
    viewMonth === initialDateObj.getMonth() + 1;

  const goPrevMonth = () => {
    const next = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(next.year);
    setViewMonth(next.month);
  };

  const goNextMonth = () => {
    const next = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(next.year);
    setViewMonth(next.month);
  };

  const goTodayMonth = () => {
    setViewYear(initialDateObj.getFullYear());
    setViewMonth(initialDateObj.getMonth() + 1);
  };

  const openDayEditor = (iso) => {
    setSelectedCalDate(iso);
    const rec = daysMap[iso];
    const existingSymptoms = Array.isArray(rec?.symptoms)
      ? Array.from(new Set(rec.symptoms.map(normalizeSymptomKey).filter(Boolean)))
      : [];
    setDayForm({
      date: iso,
      is_period: Boolean(rec?.is_period),
      flow: rec?.flow && rec.flow !== "none" ? rec.flow : "medium",
      symptoms: existingSymptoms,
      mood: normalizeMoodKey(rec?.mood || ""),
      note: rec?.note || "",
      hasExisting: Boolean(rec),
    });
    setDaySheetOpen(true);
  };

  const toggleSymptom = (symKey) => {
    setDayForm((prev) => {
      const exists = prev.symptoms.includes(symKey);
      return {
        ...prev,
        symptoms: exists
          ? prev.symptoms.filter((s) => s !== symKey)
          : [...prev.symptoms, symKey],
      };
    });
  };

  const handleSaveDay = async (e) => {
    e?.preventDefault();
    if (!dayForm.date || savingDay) return;
    setSavingDay(true);
    try {
      await api.saveCycleDay(dayForm.date, {
        is_period: dayForm.is_period,
        flow: dayForm.is_period ? dayForm.flow || "medium" : "none",
        symptoms: dayForm.symptoms,
        mood: dayForm.mood || "",
        note: dayForm.note.trim(),
      });
      setDaySheetOpen(false);
      await loadOverview(viewYear, viewMonth);
      onDataChanged?.();
      notify?.(`День ${formatDateShortRu(dayForm.date)} сохранён`, "success");
    } catch (err) {
      notify?.(err?.message || "Не удалось сохранить день цикла", "error");
    } finally {
      setSavingDay(false);
    }
  };

  const handleClearDay = async () => {
    if (!dayForm.date || savingDay) return;
    setSavingDay(true);
    try {
      await api.deleteCycleDay(dayForm.date);
      setDaySheetOpen(false);
      await loadOverview(viewYear, viewMonth);
      onDataChanged?.();
      notify?.(`Запись за ${formatDateShortRu(dayForm.date)} очищена`, "info");
    } catch (err) {
      notify?.(err?.message || "Не удалось очистить день", "error");
    } finally {
      setSavingDay(false);
    }
  };

  const openSettings = () => {
    setSettingsForm({
      avg_cycle_length: Number(overview?.settings?.avg_cycle_length) || 28,
      avg_period_length: Number(overview?.settings?.avg_period_length) || 5,
    });
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      await api.updateCycleSettings({
        avg_cycle_length: Number(settingsForm.avg_cycle_length) || 28,
        avg_period_length: Number(settingsForm.avg_period_length) || 5,
      });
      setSettingsOpen(false);
      await loadOverview(viewYear, viewMonth);
      onDataChanged?.();
      notify?.("Настройки цикла обновлены", "success");
    } catch (err) {
      notify?.(err?.message || "Не удалось сохранить настройки", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const jumpToCycle = (cycle) => {
    if (!cycle?.start_date) return;
    const dt = parseISODate(cycle.start_date);
    setViewYear(dt.getFullYear());
    setViewMonth(dt.getMonth() + 1);
    setSelectedCalDate(cycle.start_date);
    calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stats = overview?.stats || {};
  const phaseKey = stats.current_phase || "follicular";
  const phaseMeta = CYCLE_PHASES[phaseKey] || CYCLE_PHASES.follicular;
  const phaseLabel = stats.current_phase_label || phaseMeta.label;
  const avgCycleLen =
    stats.computed_avg_cycle_length || overview?.settings?.avg_cycle_length || 28;
  const avgPeriodLen =
    stats.computed_avg_period_length || overview?.settings?.avg_period_length || 5;
  const history12m = Array.isArray(overview?.history_12m) ? overview.history_12m : [];

  const nextPeriodCopy = (() => {
    if (phaseKey === "menstruation") {
      return { main: "Идёт период менструации", date: "" };
    }
    const daysLeft = stats.days_until_period;
    if (typeof daysLeft === "number") {
      if (daysLeft > 0) {
        return {
          main: `До цикла: ${formatCountRu(daysLeft, "день", "дня", "дней")}`,
          date: stats.next_period_start ? formatDateShortRu(stats.next_period_start) : "",
        };
      }
      if (daysLeft === 0) return { main: "Прогноз начала цикла — сегодня", date: "" };
      return { main: `Ожидание начала цикла (${Math.abs(daysLeft)} дн.)`, date: "" };
    }
    return { main: "Отметьте начало цикла для прогноза", date: "" };
  })();

  // Extra custom symptoms stored on this day that aren't in SYMPTOM_OPTIONS
  const extraDaySymptoms = useMemo(() => {
    const known = new Set(SYMPTOM_OPTIONS.map((s) => s.key));
    return dayForm.symptoms.filter((s) => !known.has(s));
  }, [dayForm.symptoms]);

  return (
    <div className="mt-stack">
      {/* 1. Cycle Summary Hero Card */}
      <section className="cycle-hero" data-accent="cycle" aria-label="Сводка женского цикла">
        <div className="mt-card-head">
          <div className="mt-row mt-row--wrap" style={{ gap: "8px" }}>
            <Pill tone={phaseMeta.tone || "cycle"} icon={<Droplet size={12} />}>
              {phaseLabel}
            </Pill>
            {stats.current_cycle_day ? (
              <span className="mt-pill mt-pill--neutral tabular">
                День {stats.current_cycle_day}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Настройки длительности цикла"
            onClick={openSettings}
          >
            <Settings2 size={18} />
          </button>
        </div>

        <div className="mt-stack mt-stack--xs" style={{ gap: "4px" }}>
          <strong
            className="tabular"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "19px",
              lineHeight: "25px",
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {nextPeriodCopy.main}
            {nextPeriodCopy.date ? (
              <span style={{ whiteSpace: "nowrap", color: "var(--cycle-ink)" }}>
                {" · "}
                {nextPeriodCopy.date}
              </span>
            ) : null}
          </strong>
          <p className="mt-card-sub">{phaseMeta.guidance}</p>
        </div>

        <div className="cycle-stats-grid">
          <div className="cycle-stat-box">
            <span>Средний цикл</span>
            <strong>{avgCycleLen} дн.</strong>
          </div>
          <div className="cycle-stat-box">
            <span>Длительность</span>
            <strong>{avgPeriodLen} дн.</strong>
          </div>
          <div className="cycle-stat-box">
            <span>Циклов</span>
            <strong>{stats.tracked_cycles_count || history12m.length}</strong>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-form-error">{error}</p>
        </div>
      ) : null}

      {/* 2. Interactive 12+ Month Calendar */}
      <section
        ref={calendarRef}
        className="mt-card"
        aria-label="Интерактивный календарь цикла"
      >
        <div className="cycle-cal-header">
          <button
            type="button"
            className="mt-icon-btn mt-icon-btn--bordered"
            aria-label="Предыдущий месяц"
            onClick={goPrevMonth}
          >
            <ChevronLeft size={19} />
          </button>

          <button
            type="button"
            className="mt-pill mt-pill--cycle"
            style={{ minHeight: "38px", paddingInline: "14px", fontSize: "14px" }}
            aria-label="Выбрать месяц и год"
            onClick={() => setMonthPickerOpen(true)}
          >
            <Calendar size={14} />
            <span>{formatMonthYearRu(viewYear, viewMonth)}</span>
            <ChevronDown size={14} />
          </button>

          <button
            type="button"
            className="mt-icon-btn mt-icon-btn--bordered"
            aria-label="Следующий месяц"
            onClick={goNextMonth}
          >
            <ChevronRight size={19} />
          </button>
        </div>

        {!isViewingCurrentMonth ? (
          <div className="mt-row mt-row--between" style={{ gap: "8px" }}>
            <span className="mt-card-sub">Архив / просмотр месяца</span>
            <Pill tone="cycle" onClick={goTodayMonth}>
              К текущему месяцу
            </Pill>
          </div>
        ) : null}

        <div className="cycle-cal-weekdays" aria-hidden="true">
          {WEEKDAY_SHORT_RU.map((wd) => (
            <span key={wd}>{wd}</span>
          ))}
        </div>

        <div className="cycle-cal-grid" role="grid" aria-label={formatMonthYearRu(viewYear, viewMonth)}>
          {monthMatrix.flat().map((cell) => {
            const rec = daysMap[cell.iso];
            const isPeriod = Boolean(rec?.is_period);
            const flow = rec?.flow || "medium";
            const isPredicted = !isPeriod && predictedSet.has(cell.iso);
            const isOvulation = !isPeriod && !isPredicted && ovulationSet.has(cell.iso);
            const isFertile =
              !isPeriod && !isPredicted && !isOvulation && fertileSet.has(cell.iso);
            const hasDetails = Boolean(
              rec &&
                ((Array.isArray(rec.symptoms) && rec.symptoms.length > 0) ||
                  (rec.note && rec.note.trim().length > 0)),
            );

            const flowClass = isPeriod
              ? flow === "light"
                ? "is-period-light"
                : flow === "heavy"
                  ? "is-period-heavy"
                  : "is-period-medium"
              : "";

            const classNames = [
              "cycle-day",
              !cell.inMonth ? "is-outside" : "",
              cell.isToday ? "is-today" : "",
              selectedCalDate === cell.iso ? "is-selected" : "",
              isPeriod ? "is-period" : "",
              flowClass,
              isPredicted ? "is-predicted" : "",
              isOvulation ? "is-ovulation" : "",
              isFertile ? "is-fertile" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={cell.iso}
                type="button"
                className={classNames}
                aria-label={`${formatDateWithYearRu(cell.iso)}${isPeriod ? ", менструация" : isPredicted ? ", прогноз" : isOvulation ? ", овуляция" : isFertile ? ", фертильное окно" : ""}`}
                onClick={() => openDayEditor(cell.iso)}
              >
                <span>{cell.day}</span>
                {hasDetails ? (
                  <span className="cycle-day-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>

        <p className="mt-card-sub" style={{ fontSize: "12px", textAlign: "center" }}>
          Нажмите на любую дату, чтобы отметить цикл, симптомы или заметку
        </p>

        {/* Visual Legend */}
        <div className="cycle-legend" aria-label="Обозначения календаря">
          <span className="cycle-legend-item">
            <span className="cycle-legend-swatch cycle-legend-swatch--period" />
            Менструация
          </span>
          <span className="cycle-legend-item">
            <span className="cycle-legend-swatch cycle-legend-swatch--predicted" />
            Прогноз
          </span>
          <span className="cycle-legend-item">
            <span className="cycle-legend-swatch cycle-legend-swatch--fertile" />
            Фертильное окно
          </span>
          <span className="cycle-legend-item">
            <span
              className="cycle-day-dot"
              style={{ width: "6px", height: "6px", background: "var(--ink)" }}
            />
            Симптомы / заметка
          </span>
          <span className="cycle-legend-item">
            <span
              className="cycle-legend-swatch"
              style={{
                border: "1.5px solid var(--ink)",
                background: "transparent",
              }}
            />
            Сегодня
          </span>
        </div>
      </section>

      {/* 3. 12+ Month Cycle History Archive */}
      <section className="mt-card" aria-label="История циклов за последний год">
        <div className="mt-card-head">
          <div>
            <h2 className="mt-card-title">История циклов за последний год</h2>
            <p className="mt-card-sub">
              Нажмите на любой цикл, чтобы перейти к его месяцу в календаре
            </p>
          </div>
          <Pill tone="cycle" className="tabular">
            {history12m.length}
          </Pill>
        </div>

        {loading && !overview ? (
          <p className="mt-card-sub">Загружаем историю за год…</p>
        ) : history12m.length === 0 ? (
          <EmptyState
            icon={<Droplet size={22} />}
            title="История циклов пока пуста"
            description="Отметьте дни цикла в календаре выше — здесь появится хронология за год."
          />
        ) : (
          <div className="cycle-history-list">
            {history12m.map((cycle, idx) => {
              const startDt = parseISODate(cycle.start_date);
              const rangeLabel = formatShortRangeRu(cycle.start_date, cycle.end_date);
              const yearLabel = startDt.getFullYear();
              const symptomLabels = (cycle.dominant_symptoms || [])
                .slice(0, 3)
                .map(formatSymptomRu);

              return (
                <button
                  key={`${cycle.start_date}-${idx}`}
                  type="button"
                  className="cycle-history-card"
                  onClick={() => jumpToCycle(cycle)}
                >
                  <div className="mt-stack mt-stack--xs" style={{ minWidth: 0, flex: "1 1 auto", gap: "4px" }}>
                    <div className="mt-row mt-row--wrap" style={{ gap: "6px" }}>
                      <strong
                        className="tabular"
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: "14.5px",
                          color: "var(--ink)",
                        }}
                      >
                        {rangeLabel} {yearLabel}
                      </strong>
                      <Pill tone="cycle" className="tabular">
                        {cycle.period_length} дн.
                      </Pill>
                    </div>

                    {symptomLabels.length > 0 ? (
                      <p className="mt-card-sub" style={{ fontSize: "12.5px" }}>
                        {symptomLabels.join(" · ")}
                      </p>
                    ) : null}

                    {cycle.notes ? (
                      <p
                        className="mt-card-sub"
                        style={{
                          fontSize: "12px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cycle.notes}
                      </p>
                    ) : null}
                  </div>

                  <div
                    className="mt-row"
                    style={{ alignItems: "center", flexShrink: 0, gap: "6px" }}
                  >
                    <span
                      className="mt-pill mt-pill--neutral tabular"
                      style={{ fontSize: "11.5px" }}
                    >
                      {cycle.cycle_length
                        ? `Цикл ${cycle.cycle_length} дн.`
                        : "Текущий"}
                    </span>
                    <ChevronRight
                      size={16}
                      style={{ color: "var(--subtle)", flexShrink: 0 }}
                      aria-hidden="true"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Day Editor Bottom Sheet */}
      <Sheet
        open={daySheetOpen}
        onClose={() => setDaySheetOpen(false)}
        title={dayForm.date ? formatDateWithYearRu(dayForm.date) : "Запись дня"}
        subtitle="Отметка цикла, симптомы, настроение и личная заметка"
        footer={
          <div className="mt-row" style={{ gap: "10px" }}>
            {dayForm.hasExisting ? (
              <button
                type="button"
                className="mt-btn mt-btn--danger"
                disabled={savingDay}
                onClick={handleClearDay}
              >
                <Trash2 size={16} />
                <span>Очистить</span>
              </button>
            ) : null}
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--wide"
              data-accent="cycle"
              disabled={savingDay}
              onClick={handleSaveDay}
            >
              {savingDay ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        }
      >
        <form className="mt-stack" onSubmit={handleSaveDay}>
          <CheckRow
            checked={dayForm.is_period}
            onToggle={() =>
              setDayForm((prev) => ({
                ...prev,
                is_period: !prev.is_period,
                flow: !prev.is_period ? prev.flow || "medium" : prev.flow,
              }))
            }
            accent="cycle"
            title="Менструация"
            subtitle={
              dayForm.is_period
                ? "День отмечен в календаре цикла"
                : "Нажмите, чтобы отметить день менструации"
            }
          />

          {dayForm.is_period ? (
            <div className="mt-field">
              <span className="mt-label">Интенсивность</span>
              <div className="mt-chip-row mt-chip-row--wrap">
                {FLOW_LEVELS.map((lvl) => (
                  <Pill
                    key={lvl.key}
                    tone="cycle"
                    active={dayForm.flow === lvl.key}
                    onClick={() =>
                      setDayForm((prev) => ({ ...prev, flow: lvl.key }))
                    }
                  >
                    {lvl.label}
                  </Pill>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-field">
            <span className="mt-label">Симптомы и ощущения</span>
            <div className="mt-chip-row mt-chip-row--wrap">
              {SYMPTOM_OPTIONS.map((sym) => (
                <Pill
                  key={sym.key}
                  tone="cycle"
                  active={dayForm.symptoms.includes(sym.key)}
                  onClick={() => toggleSymptom(sym.key)}
                >
                  {sym.label}
                </Pill>
              ))}
              {extraDaySymptoms.map((sym) => (
                <Pill
                  key={sym}
                  tone="cycle"
                  active
                  onClick={() => toggleSymptom(sym)}
                >
                  {sym}
                </Pill>
              ))}
            </div>
          </div>

          <div className="mt-field">
            <span className="mt-label">Настроение</span>
            <div className="mt-chip-row mt-chip-row--wrap">
              {MOOD_OPTIONS.map((m) => (
                <Pill
                  key={m.key}
                  tone="neutral"
                  active={dayForm.mood === m.key}
                  onClick={() =>
                    setDayForm((prev) => ({
                      ...prev,
                      mood: prev.mood === m.key ? "" : m.key,
                    }))
                  }
                >
                  {m.label}
                </Pill>
              ))}
            </div>
          </div>

          <div className="mt-field">
            <label className="mt-label" htmlFor="cycle-day-note">
              Личная заметка
            </label>
            <textarea
              id="cycle-day-note"
              rows={3}
              className="mt-textarea"
              placeholder="Самочувствие, сон, практики, тёплые напоминания себе…"
              value={dayForm.note}
              onChange={(e) =>
                setDayForm((prev) => ({ ...prev, note: e.target.value }))
              }
            />
          </div>
        </form>
      </Sheet>

      {/* Quick Month / Year Picker Sheet (18+ months) */}
      <Sheet
        open={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        title="Выберите месяц"
        subtitle="Быстрый переход по истории цикла за последний год и ранее"
      >
        <div
          className="mt-grid-2"
          style={{ gap: "8px" }}
        >
          {monthPickerOptions.map((item) => {
            const isActive = item.year === viewYear && item.month === viewMonth;
            return (
              <button
                key={item.key}
                type="button"
                className={`mt-btn ${isActive ? "mt-btn--primary" : "mt-btn--secondary"} mt-btn--sm`}
                data-accent="cycle"
                style={{ justifyContent: "space-between" }}
                onClick={() => {
                  setViewYear(item.year);
                  setViewMonth(item.month);
                  setMonthPickerOpen(false);
                }}
              >
                <span>{item.label}</span>
                {item.isFuture ? (
                  <span style={{ fontSize: "11px", opacity: 0.75 }}>прогноз</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* Baseline Cycle Settings Sheet */}
      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Настройки цикла"
        subtitle="Базовые значения для расчёта прогноза (уточняются автоматически по вашей истории)"
        footer={
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            data-accent="cycle"
            disabled={savingSettings}
            onClick={handleSaveSettings}
          >
            {savingSettings ? "Сохраняем…" : "Сохранить настройки"}
          </button>
        }
      >
        <div className="mt-stack">
          <div className="mt-row mt-row--between">
            <div>
              <strong style={{ fontSize: "15px" }}>Длина цикла</strong>
              <p className="mt-card-sub">Обычно 24–35 дней</p>
            </div>
            <StepperPill
              value={settingsForm.avg_cycle_length}
              min={20}
              max={45}
              unit="дн."
              label="Средняя длина цикла"
              onDecrement={() =>
                setSettingsForm((prev) => ({
                  ...prev,
                  avg_cycle_length: Math.max(20, prev.avg_cycle_length - 1),
                }))
              }
              onIncrement={() =>
                setSettingsForm((prev) => ({
                  ...prev,
                  avg_cycle_length: Math.min(45, prev.avg_cycle_length + 1),
                }))
              }
            />
          </div>

          <div className="mt-divider" />

          <div className="mt-row mt-row--between">
            <div>
              <strong style={{ fontSize: "15px" }}>Длительность менструации</strong>
              <p className="mt-card-sub">Обычно 3–7 дней</p>
            </div>
            <StepperPill
              value={settingsForm.avg_period_length}
              min={2}
              max={10}
              unit="дн."
              label="Длительность менструации"
              onDecrement={() =>
                setSettingsForm((prev) => ({
                  ...prev,
                  avg_period_length: Math.max(2, prev.avg_period_length - 1),
                }))
              }
              onIncrement={() =>
                setSettingsForm((prev) => ({
                  ...prev,
                  avg_period_length: Math.min(10, prev.avg_period_length + 1),
                }))
              }
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
