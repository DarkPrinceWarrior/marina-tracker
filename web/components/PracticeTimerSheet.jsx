import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Flower2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Wind,
} from "lucide-react";
import Sheet from "./Sheet.jsx";
import { Pill, ProgressRing } from "./UiPrimitives.jsx";
import api from "../api.js";
import { nowTimeHHMM, todayISO } from "../utils/date.js";
import {
  WORKOUT_PRESETS,
  WORKOUT_TYPE_MAP,
  formatCountRu,
} from "../data/presets.js";

const TYPE_ICONS = {
  breathing: Wind,
  pilates: Activity,
  qigong: Flower2,
  other: Sparkles,
};

const TYPE_COLORS = {
  breathing: "var(--water)",
  pilates: "var(--habits)",
  qigong: "var(--brand)",
  other: "var(--goals)",
};

const TYPE_SOFT_BG = {
  breathing: "var(--water-soft)",
  pilates: "var(--habits-soft)",
  qigong: "var(--brand-soft)",
  other: "var(--goals-soft)",
};

const TYPE_BORDER = {
  breathing: "var(--water-border)",
  pilates: "var(--habits-border)",
  qigong: "var(--brand-border)",
  other: "var(--goals-border)",
};

function formatMMSS(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getBreathingState(preset, elapsedSec) {
  const phases = preset?.phases || [
    { key: "inhale", label: "Вдох", seconds: 4, scale: 1 },
    { key: "exhale", label: "Выдох", seconds: 6, scale: 0.62 },
  ];
  const cycleSec = phases.reduce((sum, p) => sum + p.seconds, 0);
  const totalCycles = preset?.cycles || 10;
  const totalSec = cycleSec * totalCycles;
  const clamped = Math.min(elapsedSec, totalSec);
  const cycleIndex = Math.min(totalCycles - 1, Math.floor(clamped / cycleSec));
  let intoCycle = clamped % cycleSec;

  let activePhase = phases[0];
  let phaseRemaining = phases[0].seconds;
  for (const phase of phases) {
    if (intoCycle < phase.seconds) {
      activePhase = phase;
      phaseRemaining = phase.seconds - intoCycle;
      break;
    }
    intoCycle -= phase.seconds;
  }

  return {
    cycleNumber: cycleIndex + 1,
    totalCycles,
    totalSec,
    activePhase,
    phaseRemaining: Math.ceil(phaseRemaining),
    done: elapsedSec >= totalSec,
  };
}

function getStageProgress(preset, elapsedSec, totalSec) {
  const stages = preset?.stages || [];
  if (!stages.length) return { activeIndex: -1, items: [] };
  const rawTotal = stages.reduce((acc, s) => acc + s.durationMin, 0) * 60 || totalSec;
  const scaleFactor = totalSec / rawTotal;
  let cursor = 0;
  let activeIndex = stages.length - 1;
  const items = stages.map((stage, idx) => {
    const segLen = Math.max(1, Math.round(stage.durationMin * 60 * scaleFactor));
    const start = cursor;
    const end = idx === stages.length - 1 ? totalSec : cursor + segLen;
    cursor = end;
    const status =
      elapsedSec >= end ? "done" : elapsedSec >= start ? "active" : "upcoming";
    if (status === "active") activeIndex = idx;
    return { ...stage, start, end, status };
  });
  return { activeIndex, items };
}

export default function PracticeTimerSheet({
  open = false,
  onClose,
  initialType = "breathing",
  initialPresetId = null,
  selectedDate,
  onCompleted,
  notify,
}) {
  const [practiceType, setPracticeType] = useState(initialType || "breathing");
  const [presetId, setPresetId] = useState(null);
  const [customMinutes, setCustomMinutes] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedWorkout, setSavedWorkout] = useState(null);
  const autoLoggedRef = useRef(false);

  const availablePresets = useMemo(
    () => WORKOUT_PRESETS[practiceType] || WORKOUT_PRESETS.breathing,
    [practiceType],
  );

  const activePreset = useMemo(() => {
    return (
      availablePresets.find((item) => item.id === presetId) || availablePresets[0]
    );
  }, [availablePresets, presetId]);

  const isBreathing = practiceType === "breathing";
  const accentColor = TYPE_COLORS[practiceType] || "var(--brand)";
  const accentSoft = TYPE_SOFT_BG[practiceType] || "var(--brand-soft)";
  const accentBorder = TYPE_BORDER[practiceType] || "var(--brand-border)";

  const breathingInfo = useMemo(() => {
    if (!isBreathing) return null;
    return getBreathingState(activePreset, elapsedSec);
  }, [isBreathing, activePreset, elapsedSec]);

  const totalSec = useMemo(() => {
    if (isBreathing && breathingInfo) return breathingInfo.totalSec;
    const mins = customMinutes || activePreset?.durationMin || 15;
    return mins * 60;
  }, [isBreathing, breathingInfo, customMinutes, activePreset]);

  const stageInfo = useMemo(() => {
    if (isBreathing) return { activeIndex: -1, items: [] };
    return getStageProgress(activePreset, elapsedSec, totalSec);
  }, [isBreathing, activePreset, elapsedSec, totalSec]);

  // Reset state cleanly when sheet opens or initial props change
  useEffect(() => {
    if (!open) {
      setIsRunning(false);
      return;
    }
    const nextType = WORKOUT_PRESETS[initialType] ? initialType : "breathing";
    const list = WORKOUT_PRESETS[nextType] || WORKOUT_PRESETS.breathing;
    const picked =
      list.find((p) => p.id === initialPresetId)?.id || list[0]?.id || null;
    setPracticeType(nextType);
    setPresetId(picked);
    setCustomMinutes(null);
    setElapsedSec(0);
    setIsRunning(false);
    setSaving(false);
    setSavedWorkout(null);
    autoLoggedRef.current = false;
  }, [open, initialType, initialPresetId]);

  // Timer tick
  useEffect(() => {
    if (!open || !isRunning || savedWorkout) return undefined;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 1;
        if (next >= totalSec) {
          setIsRunning(false);
          return totalSec;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, isRunning, totalSec, savedWorkout]);

  // Auto-log when timer reaches 100%
  useEffect(() => {
    if (!open || savedWorkout || saving || autoLoggedRef.current) return;
    if (totalSec > 0 && elapsedSec >= totalSec) {
      autoLoggedRef.current = true;
      handleFinishAndSave(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSec, totalSec, open, savedWorkout, saving]);

  function handleSelectType(nextType) {
    setIsRunning(false);
    setElapsedSec(0);
    setSavedWorkout(null);
    autoLoggedRef.current = false;
    setPracticeType(nextType);
    const first = WORKOUT_PRESETS[nextType]?.[0];
    setPresetId(first?.id || null);
    setCustomMinutes(null);
  }

  function handleSelectPreset(nextPreset) {
    setIsRunning(false);
    setElapsedSec(0);
    setSavedWorkout(null);
    autoLoggedRef.current = false;
    setPresetId(nextPreset.id);
    setCustomMinutes(null);
  }

  function handleReset() {
    setIsRunning(false);
    setElapsedSec(0);
    setSavedWorkout(null);
    autoLoggedRef.current = false;
  }

  async function handleFinishAndSave(isFullCompletion = false) {
    if (saving || savedWorkout) return;
    setIsRunning(false);
    setSaving(true);

    const plannedMin = Math.max(1, Math.round(totalSec / 60));
    const loggedMin = isFullCompletion
      ? plannedMin
      : Math.max(1, Math.round(elapsedSec / 60) || plannedMin);

    const payload = {
      log_date: selectedDate || todayISO(),
      workout_type: practiceType,
      custom_label: practiceType === "other" ? activePreset?.title || "Своя практика" : "",
      duration_min: loggedMin,
      intensity: activePreset?.intensity || "light",
      mood: activePreset?.mood || "calm",
      note: activePreset?.title
        ? `Таймер: ${activePreset.title}${isFullCompletion ? " (полный цикл)" : ""}`
        : "Завершено с таймером",
      completed: true,
      logged_at: nowTimeHHMM(),
    };

    try {
      const created = await api.createWorkout(payload);
      setSavedWorkout(created);
      notify?.(
        `Практика «${activePreset?.title || WORKOUT_TYPE_MAP[practiceType]?.label}» сохранена (${loggedMin} мин)`,
        "success",
      );
      onCompleted?.(created);
    } catch (err) {
      autoLoggedRef.current = false;
      notify?.(err?.message || "Не удалось сохранить практику", "error");
    } finally {
      setSaving(false);
    }
  }

  const remainingSec = Math.max(0, totalSec - elapsedSec);
  const progressPct = totalSec > 0 ? Math.min(100, Math.round((elapsedSec / totalSec) * 100)) : 0;
  const TypeIcon = TYPE_ICONS[practiceType] || Wind;

  const orbStateClass = !isRunning || !breathingInfo
    ? ""
    : breathingInfo.activePhase.key === "inhale"
      ? "is-inhale"
      : breathingInfo.activePhase.key === "exhale"
        ? "is-exhale"
        : "is-hold";
  const orbTransitionSec =
    isRunning && breathingInfo ? Math.max(0.6, breathingInfo.activePhase.seconds) : 0.45;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Таймер практики"
      subtitle={
        activePreset
          ? `${WORKOUT_TYPE_MAP[practiceType]?.label || "Практика"} · ${activePreset.title}`
          : "Спокойный ритм"
      }
      footer={
        savedWorkout ? (
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            onClick={() => onClose?.()}
          >
            Готово
          </button>
        ) : (
          <div className="timer-controls">
            <button
              type="button"
              className="mt-btn mt-btn--secondary"
              style={{ minWidth: "46px", paddingInline: "12px", flexShrink: 0 }}
              onClick={handleReset}
              aria-label="Сбросить таймер"
              disabled={elapsedSec === 0 && !isRunning}
            >
              <RotateCcw size={18} />
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--primary"
              style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap" }}
              onClick={() => setIsRunning((prev) => !prev)}
            >
              {isRunning ? <Pause size={17} /> : <Play size={17} />}
              <span>
                {isRunning
                  ? "Пауза"
                  : elapsedSec > 0
                    ? "Продолжить"
                    : "Начать"}
              </span>
            </button>
            <button
              type="button"
              className="mt-btn mt-btn--soft"
              style={{ flexShrink: 0, whiteSpace: "nowrap" }}
              onClick={() => handleFinishAndSave(false)}
              disabled={saving}
              title="Завершить и записать в дневник"
            >
              <Check size={17} />
              <span>{saving ? "…" : "Записать"}</span>
            </button>
          </div>
        )
      }
    >
      <div className="mt-stack">
        {/* Practice type selector */}
        <div className="mt-chip-row" role="tablist" aria-label="Тип практики">
          {["breathing", "pilates", "qigong", "other"].map((key) => {
            const meta = WORKOUT_TYPE_MAP[key];
            const Icon = TYPE_ICONS[key];
            return (
              <Pill
                key={key}
                tone={meta.accent}
                active={practiceType === key}
                icon={<Icon size={14} />}
                onClick={() => handleSelectType(key)}
              >
                {meta.shortLabel}
              </Pill>
            );
          })}
        </div>

        {/* Preset selector chips */}
        {availablePresets.length > 1 ? (
          <div className="mt-chip-row" aria-label="Выбор программы">
            {availablePresets.map((preset) => (
              <Pill
                key={preset.id}
                tone={WORKOUT_TYPE_MAP[practiceType]?.accent || "brand"}
                active={activePreset?.id === preset.id}
                onClick={() => handleSelectPreset(preset)}
              >
                {preset.title}
              </Pill>
            ))}
          </div>
        ) : null}

        {/* Completion celebration card */}
        {savedWorkout ? (
          <div
            className="mt-card mt-card--tinted"
            data-accent={WORKOUT_TYPE_MAP[practiceType]?.accent || "habits"}
            style={{
              textAlign: "center",
              padding: "24px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "999px",
                background: accentSoft,
                border: `1px solid ${accentBorder}`,
                color: accentColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={28} />
            </div>
            <h3 className="mt-card-title" style={{ margin: 0 }}>
              Практика завершена и отмечена
            </h3>
            <p className="mt-card-sub" style={{ margin: 0 }}>
              {activePreset?.title} · {savedWorkout.duration_min} мин ·{" "}
              {savedWorkout.logged_at}
            </p>
            <p className="muted" style={{ fontSize: "13px", margin: 0 }}>
              Запись появилась в «Тренировках» и в ленте «Что сделано за день».
            </p>
          </div>
        ) : (
          <>
            {/* Main visual pacer or countdown ring */}
            <div className="mt-card timer-stage">
              {isBreathing && breathingInfo ? (
                <>
                  <div className="timer-orb-wrap" aria-live="polite">
                    <div
                      className={`timer-orb ${orbStateClass}`.trim()}
                      style={{
                        transitionDuration: `${orbTransitionSec}s`,
                      }}
                    />
                    <div
                      style={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: "0 12px",
                      }}
                    >
                      <span className="timer-clock">
                        {isRunning
                          ? breathingInfo.phaseRemaining
                          : activePreset?.patternLabel?.split("·")[0]?.trim() || "4"}
                      </span>
                      <span className="timer-phase">
                        {isRunning
                          ? breathingInfo.activePhase.label
                          : "Готовы начать"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-stack mt-stack--sm" style={{ alignItems: "center" }}>
                    <div className="mt-row mt-row--wrap" style={{ gap: "6px", justifyContent: "center" }}>
                      <Pill tone="water">{activePreset?.patternLabel}</Pill>
                      <Pill tone="neutral">
                        Цикл {breathingInfo.cycleNumber} из {breathingInfo.totalCycles}
                      </Pill>
                      <Pill tone="neutral">{formatMMSS(remainingSec)}</Pill>
                    </div>
                    {activePreset?.tip && (
                      <p className="mt-card-sub" style={{ margin: 0, maxWidth: "300px" }}>
                        {activePreset.tip}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <ProgressRing
                    percent={progressPct}
                    size={168}
                    strokeWidth={9}
                    color={accentColor}
                    label={formatMMSS(remainingSec)}
                    sublabel={
                      stageInfo.items[stageInfo.activeIndex]?.title
                        ? `этап ${stageInfo.activeIndex + 1}/${stageInfo.items.length}`
                        : `${Math.round(totalSec / 60)} мин`
                    }
                  />

                  <div className="mt-stack mt-stack--sm" style={{ alignItems: "center" }}>
                    <div className="mt-row" style={{ gap: "6px", justifyContent: "center" }}>
                      <TypeIcon size={15} color={accentColor} />
                      <strong style={{ fontSize: "15px", color: "var(--ink)" }}>
                        {activePreset?.title}
                      </strong>
                    </div>
                    <p className="mt-card-sub" style={{ margin: 0 }}>
                      {activePreset?.subtitle}
                    </p>
                  </div>

                  {/* Quick duration adjust before starting */}
                  {elapsedSec === 0 && (
                    <div className="mt-chip-row mt-chip-row--wrap" style={{ justifyContent: "center" }}>
                      {[10, 15, 20, 25, 30, 45].map((mins) => {
                        const selectedMin = customMinutes || activePreset?.durationMin;
                        return (
                          <Pill
                            key={mins}
                            tone={WORKOUT_TYPE_MAP[practiceType]?.accent || "habits"}
                            active={selectedMin === mins}
                            onClick={() => setCustomMinutes(mins)}
                          >
                            {mins} мин
                          </Pill>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Structured stages for Pilates / Qigong */}
            {!isBreathing && stageInfo.items.length > 0 && (
              <div className="mt-card mt-card--compact">
                <div className="mt-card-head">
                  <span className="mt-card-title">Этапы практики</span>
                  <span className="mt-card-sub tabular">
                    {formatCountRu(stageInfo.items.length, "этап", "этапа", "этапов")}
                  </span>
                </div>
                <div className="mt-stack mt-stack--sm">
                  {stageInfo.items.map((stage, idx) => {
                    const isActive = stage.status === "active" && (isRunning || elapsedSec > 0);
                    const isDone = stage.status === "done";
                    return (
                      <div
                        key={stage.title}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-control)",
                          background: isActive ? accentSoft : "transparent",
                          border: isActive
                            ? `1px solid ${accentBorder}`
                            : "1px solid transparent",
                          opacity: isDone ? 0.65 : 1,
                        }}
                      >
                        <span
                          className="tabular"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "999px",
                            flexShrink: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 700,
                            background: isDone || isActive ? accentColor : "var(--surface-subtle)",
                            color: isDone || isActive ? "#FFFFFF" : "var(--muted)",
                          }}
                        >
                          {isDone ? <Check size={13} /> : idx + 1}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="mt-row mt-row--between" style={{ gap: "8px" }}>
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "var(--ink)",
                              }}
                            >
                              {stage.title}
                            </span>
                            <span className="mt-card-sub tabular" style={{ flexShrink: 0 }}>
                              ~{stage.durationMin} мин
                            </span>
                          </div>
                          {stage.hint && (
                            <p
                              className="mt-card-sub"
                              style={{ margin: "2px 0 0", fontSize: "12.5px" }}
                            >
                              {stage.hint}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
