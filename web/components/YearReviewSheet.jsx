import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Award,
  CalendarHeart,
  CheckCircle2,
  Droplets,
  Flame,
  Flower2,
  Home,
  Sparkles,
  Target,
  Wind,
} from "lucide-react";
import Sheet from "./Sheet.jsx";
import { EmptyState, Pill, ProgressRing } from "./UiPrimitives.jsx";
import api from "../api.js";
import { parseISODate, todayISO } from "../utils/date.js";
import {
  GOAL_PACE_META,
  WORKOUT_TYPE_MAP,
  formatCountRu,
} from "../data/presets.js";

const WORKOUT_ROW_ORDER = [
  { key: "breathing", icon: Wind, tone: "water" },
  { key: "pilates", icon: Activity, tone: "habits" },
  { key: "qigong", icon: Flower2, tone: "brand" },
  { key: "other", icon: Sparkles, tone: "goals" },
];

export default function YearReviewSheet({
  open = false,
  onClose,
  selectedDate,
  onNavigate,
}) {
  const effectiveDate = selectedDate || todayISO();
  const activeYear = useMemo(
    () => parseISODate(effectiveDate).getFullYear(),
    [effectiveDate],
  );
  const activeMonth = useMemo(
    () => parseISODate(effectiveDate).getMonth() + 1,
    [effectiveDate],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    async function loadReview() {
      setLoading(true);
      setError(null);
      try {
        const [
          todayRes,
          workoutsRes,
          habitsRes,
          waterRes,
          cycleRes,
          goalsRes,
          choresRes,
        ] = await Promise.allSettled([
          api.getToday(effectiveDate),
          api.getWorkouts(effectiveDate, 365),
          api.getHabits(effectiveDate),
          api.getWater(effectiveDate),
          api.getCycleOverview(activeYear, activeMonth),
          api.getGoals({ status: "all", horizon: "all" }),
          api.getChores(effectiveDate),
        ]);

        if (cancelled) return;

        const unwrap = (res) => (res.status === "fulfilled" ? res.value : null);
        const payload = {
          today: unwrap(todayRes),
          workouts: unwrap(workoutsRes),
          habits: unwrap(habitsRes),
          water: unwrap(waterRes),
          cycle: unwrap(cycleRes),
          goals: unwrap(goalsRes),
          chores: unwrap(choresRes),
        };

        const anyLoaded = Object.values(payload).some(Boolean);
        if (!anyLoaded) {
          setError("Не удалось загрузить статистику года. Попробуйте ещё раз.");
        } else {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Ошибка загрузки итогов");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReview();
    return () => {
      cancelled = true;
    };
  }, [open, effectiveDate, activeYear, activeMonth]);

  const metrics = useMemo(() => {
    if (!data) return null;

    // Workouts across up to 365 days
    const recentWorkouts = data.workouts?.recent_items || [];
    const completedWorkouts = recentWorkouts.filter((w) => w.completed !== false);
    const workoutsByType = {
      breathing: { count: 0, minutes: 0 },
      pilates: { count: 0, minutes: 0 },
      qigong: { count: 0, minutes: 0 },
      other: { count: 0, minutes: 0 },
    };
    let totalWorkoutMinutes = 0;
    completedWorkouts.forEach((item) => {
      const key = workoutsByType[item.workout_type] ? item.workout_type : "other";
      const mins = Number(item.duration_min) || 0;
      workoutsByType[key].count += 1;
      workoutsByType[key].minutes += mins;
      totalWorkoutMinutes += mins;
    });

    // Habits & water streak highlight
    const habitItems = data.habits?.items || [];
    const bestHabit = habitItems.reduce(
      (best, item) =>
        (Number(item.streak_days) || 0) > (Number(best?.streak_days) || 0)
          ? item
          : best,
      null,
    );
    const habitsSummary = data.habits?.summary || data.today?.summary?.habits || {};
    const waterSummary = data.water || data.today?.summary?.water || {};

    // Cycle 12+ months archive
    const cycleStats = data.cycle?.stats || {};
    const cycleHistory = data.cycle?.history_12m || [];

    // Multi-year goals & milestones
    const goalItems = data.goals?.items || [];
    const goalsSummary = data.goals?.summary || data.today?.summary?.goals || {};
    let totalMilestones = 0;
    let doneMilestones = 0;
    let totalCheckins = 0;
    goalItems.forEach((g) => {
      const ms = g.milestones || [];
      totalMilestones += ms.length;
      doneMilestones += ms.filter((m) => m.completed).length;
      totalCheckins += (g.checkins || []).length;
    });

    // Tasks & home chores
    const tasksSummary = data.today?.summary?.tasks || { done: 0, total: 0 };
    const choresSummary = data.chores?.summary || {
      done_today: data.today?.summary?.chores?.done || 0,
      total_active: data.today?.summary?.chores?.total || 0,
    };

    return {
      totalSessions: completedWorkouts.length,
      totalWorkoutMinutes,
      workoutsByType,
      bestHabit,
      habitsDone: habitsSummary.done || 0,
      habitsTotal: habitsSummary.total || 0,
      waterMl: waterSummary.total_ml || 0,
      waterGoal: waterSummary.goal_ml || 2000,
      waterPercent: waterSummary.percent || 0,
      trackedCycles: cycleStats.tracked_cycles_count || cycleHistory.length || 0,
      avgCycleLen: cycleStats.computed_avg_cycle_length || data.cycle?.settings?.avg_cycle_length || 28,
      avgPeriodLen: cycleStats.computed_avg_period_length || data.cycle?.settings?.avg_period_length || 5,
      goalItems,
      avgGoalPct: goalsSummary.avg_progress_pct || 0,
      activeGoals: goalsSummary.active_count || goalItems.filter((g) => g.status === "active").length,
      totalMilestones,
      doneMilestones,
      totalCheckins,
      tasksDone: tasksSummary.done || 0,
      tasksTotal: tasksSummary.total || 0,
      choresDone: choresSummary.done_today ?? choresSummary.done ?? 0,
      choresTotal: choresSummary.total_active ?? choresSummary.total ?? 0,
      completedFeedCount: (data.today?.completed_feed || []).length,
    };
  }, [data]);

  function jumpTo(tab, subTab) {
    onClose?.();
    onNavigate?.(tab, subTab);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Личный рост · ${activeYear}`}
      subtitle="Достижения, ритм и опора за последний год"
      footer={
        <button
          type="button"
          className="mt-btn mt-btn--primary mt-btn--wide"
          onClick={() => onClose?.()}
        >
          Закрыть обзор
        </button>
      }
    >
      {loading && !metrics ? (
        <div className="mt-card" style={{ textAlign: "center", padding: "28px 16px" }}>
          <p className="mt-card-sub" style={{ margin: 0 }}>
            Собираем ваши достижения за год…
          </p>
        </div>
      ) : error && !metrics ? (
        <EmptyState
          icon={<Award size={22} />}
          title="Обзор временно недоступен"
          description={error}
        />
      ) : metrics ? (
        <div className="mt-stack">
          {/* Hero retrospective card */}
          <div className="mt-card mt-card--tinted" data-accent="goals">
            <div className="mt-row" style={{ gap: "14px", alignItems: "center" }}>
              <ProgressRing
                percent={metrics.avgGoalPct}
                size={76}
                strokeWidth={7}
                color="var(--goals)"
                label={`${metrics.avgGoalPct}%`}
                sublabel="цели"
              />
              <div className="mt-stack mt-stack--xs" style={{ minWidth: 0, flex: 1 }}>
                <span className="mt-eyebrow" style={{ color: "var(--goals-ink)" }}>
                  Ретроспектива года
                </span>
                <h3 className="mt-card-title" style={{ margin: 0 }}>
                  {formatCountRu(metrics.totalSessions, "практика", "практики", "практик")} и{" "}
                  {formatCountRu(metrics.doneMilestones, "веха", "вехи", "вех")}
                </h3>
                <p className="mt-card-sub" style={{ margin: 0 }}>
                  Ведите ритм спокойно: в фокусе{" "}
                  {formatCountRu(metrics.activeGoals, "долгосрочная цель", "долгосрочные цели", "долгосрочных целей")}.
                </p>
              </div>
            </div>
          </div>

          {/* 2x2 Key Year Stats */}
          <div className="year-review-grid">
            <div className="year-review-stat">
              <span className="mt-row" style={{ gap: "5px" }}>
                <Activity size={13} color="var(--habits)" aria-hidden="true" />
                <span>Практики тела</span>
              </span>
              <strong>{metrics.totalSessions}</strong>
              <span className="tabular">
                {metrics.totalWorkoutMinutes} мин за год
              </span>
            </div>

            <div className="year-review-stat">
              <span className="mt-row" style={{ gap: "5px" }}>
                <Flame size={13} color="var(--water)" aria-hidden="true" />
                <span>Серия привычек</span>
              </span>
              <strong>
                {metrics.bestHabit?.streak_days || 0}{" "}
                <small style={{ fontSize: "13px", fontWeight: 600 }}>дн.</small>
              </strong>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {metrics.bestHabit?.title || `Вода: ${metrics.waterPercent}%`}
              </span>
            </div>

            <div className="year-review-stat">
              <span className="mt-row" style={{ gap: "5px" }}>
                <CalendarHeart size={13} color="var(--cycle)" aria-hidden="true" />
                <span>Архив цикла</span>
              </span>
              <strong>{metrics.trackedCycles}</strong>
              <span className="tabular">
                ср. {metrics.avgCycleLen} дн. · менстр. {metrics.avgPeriodLen} дн.
              </span>
            </div>

            <div className="year-review-stat">
              <span className="mt-row" style={{ gap: "5px" }}>
                <Target size={13} color="var(--goals)" aria-hidden="true" />
                <span>Вехи целей</span>
              </span>
              <strong className="tabular">
                {metrics.doneMilestones}/{metrics.totalMilestones}
              </strong>
              <span className="tabular">
                {formatCountRu(metrics.totalCheckins, "чек-ин", "чек-ина", "чек-инов")}
              </span>
            </div>
          </div>

          {/* Workouts breakdown by type */}
          <div className="mt-card mt-card--compact">
            <div className="mt-card-head">
              <span className="mt-card-title">Практики за год</span>
              {onNavigate && (
                <button
                  type="button"
                  className="mt-btn mt-btn--ghost mt-btn--sm"
                  onClick={() => jumpTo("habits", "workouts")}
                >
                  К практикам
                </button>
              )}
            </div>
            <div className="mt-stack mt-stack--sm">
              {WORKOUT_ROW_ORDER.filter(
                (row) => row.key !== "other" || metrics.workoutsByType.other.count > 0,
              ).map((row) => {
                const stat = metrics.workoutsByType[row.key];
                const meta = WORKOUT_TYPE_MAP[row.key];
                const Icon = row.icon;
                return (
                  <div key={row.key} className="year-review-row">
                    <span className="mt-row" style={{ gap: "8px", minWidth: 0 }}>
                      <Pill tone={row.tone} icon={<Icon size={13} />}>
                        {meta?.shortLabel || row.key}
                      </Pill>
                    </span>
                    <span className="tabular" style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {formatCountRu(stat.count, "раз", "раза", "раз")} · {stat.minutes} мин
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multi-year goals progress */}
          {metrics.goalItems.length > 0 && (
            <div className="mt-card mt-card--compact">
              <div className="mt-card-head">
                <span className="mt-card-title">Долгосрочные цели</span>
                {onNavigate && (
                  <button
                    type="button"
                    className="mt-btn mt-btn--ghost mt-btn--sm"
                    onClick={() => jumpTo("goals")}
                  >
                    Открыть цели
                  </button>
                )}
              </div>
              <div className="mt-stack mt-stack--sm">
                {metrics.goalItems.slice(0, 4).map((goal) => {
                  const pace =
                    GOAL_PACE_META[goal.pace_status] || GOAL_PACE_META.on_track;
                  const msDone = (goal.milestones || []).filter((m) => m.completed).length;
                  const msTotal = (goal.milestones || []).length;
                  return (
                    <div
                      key={goal.id}
                      className="year-review-row"
                      style={{ flexDirection: "column", alignItems: "stretch", gap: "6px" }}
                    >
                      <div className="mt-row mt-row--between" style={{ gap: "8px" }}>
                        <strong
                          style={{
                            fontSize: "13.5px",
                            color: "var(--ink)",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {goal.title}
                        </strong>
                        <span
                          className="tabular"
                          style={{ fontWeight: 700, color: "var(--goals-ink)", flexShrink: 0 }}
                        >
                          {goal.progress_pct}%
                        </span>
                      </div>
                      <div className="mt-row mt-row--between" style={{ gap: "6px" }}>
                        <span className="mt-card-sub tabular" style={{ fontSize: "12px" }}>
                          Горизонт {formatCountRu(goal.horizon_years || 1, "год", "года", "лет")}
                          {msTotal > 0 ? ` · вехи ${msDone}/${msTotal}` : ""}
                        </span>
                        <Pill tone={pace.tone}>{pace.label}</Pill>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily rhythm snapshot (Water, Tasks, Home Chores) */}
          <div className="mt-card mt-card--compact">
            <div className="mt-card-head">
              <span className="mt-card-title">Ритм дня и дома</span>
              <span className="mt-card-sub tabular">
                {formatCountRu(metrics.completedFeedCount, "действие", "действия", "действий")}
              </span>
            </div>
            <div className="mt-stack mt-stack--sm">
              <div className="year-review-row">
                <span className="mt-row" style={{ gap: "8px" }}>
                  <Droplets size={15} color="var(--water)" />
                  <span>Водный баланс сегодня</span>
                </span>
                <strong className="tabular">
                  {metrics.waterMl} / {metrics.waterGoal} мл
                </strong>
              </div>
              <div className="year-review-row">
                <span className="mt-row" style={{ gap: "8px" }}>
                  <CheckCircle2 size={15} color="var(--brand)" />
                  <span>Задачи дня</span>
                </span>
                <strong className="tabular">
                  {metrics.tasksDone} из {metrics.tasksTotal}
                </strong>
              </div>
              <div className="year-review-row">
                <span className="mt-row" style={{ gap: "8px" }}>
                  <Home size={15} color="var(--home)" />
                  <span>Дела по дому</span>
                </span>
                <strong className="tabular">
                  {metrics.choresDone} из {metrics.choresTotal}
                </strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
