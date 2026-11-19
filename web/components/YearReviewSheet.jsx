import React, { useEffect, useMemo, useState } from "react";
import { Award, ChevronRight } from "lucide-react";
import Sheet from "./Sheet.jsx";
import {
  CompactProgress,
  EmptyState,
  GroupHeader,
  GroupList,
  ListRow,
  MetricStrip,
} from "./UiPrimitives.jsx";
import api from "../api.js";
import { parseISODate, todayISO } from "../utils/date.js";
import {
  GOAL_PACE_META,
  WORKOUT_TYPE_MAP,
  formatCountRu,
  formatGoalHorizonRu,
} from "../data/presets.js";

const WORKOUT_ROW_ORDER = ["breathing", "pilates", "qigong", "other"];

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
          setError("Не удалось загрузить итоги года. Попробуйте ещё раз.");
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

    const recentWorkouts = data.workouts?.recent_items || [];
    const completedWorkouts = recentWorkouts.filter(
      (w) => w.completed !== false,
    );
    const workoutsByType = {
      breathing: { count: 0, minutes: 0 },
      pilates: { count: 0, minutes: 0 },
      qigong: { count: 0, minutes: 0 },
      other: { count: 0, minutes: 0 },
    };
    let totalWorkoutMinutes = 0;
    completedWorkouts.forEach((item) => {
      const key = workoutsByType[item.workout_type]
        ? item.workout_type
        : "other";
      const mins = Number(item.duration_min) || 0;
      workoutsByType[key].count += 1;
      workoutsByType[key].minutes += mins;
      totalWorkoutMinutes += mins;
    });

    const habitItems = data.habits?.items || [];
    const bestHabit = habitItems.reduce(
      (best, item) =>
        (Number(item.streak_days) || 0) > (Number(best?.streak_days) || 0)
          ? item
          : best,
      null,
    );
    const waterSummary = data.water || data.today?.summary?.water || {};

    const cycleStats = data.cycle?.stats || {};
    const cycleHistory = data.cycle?.history_12m || [];

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
      waterMl: waterSummary.total_ml || 0,
      waterGoal: waterSummary.goal_ml || 2000,
      trackedCycles:
        cycleStats.tracked_cycles_count || cycleHistory.length || 0,
      avgCycleLen:
        cycleStats.computed_avg_cycle_length ||
        data.cycle?.settings?.avg_cycle_length ||
        28,
      avgPeriodLen:
        cycleStats.computed_avg_period_length ||
        data.cycle?.settings?.avg_period_length ||
        5,
      goalItems,
      avgGoalPct: goalsSummary.avg_progress_pct || 0,
      totalMilestones,
      doneMilestones,
      totalCheckins,
      tasksDone: tasksSummary.done || 0,
      tasksTotal: tasksSummary.total || 0,
      choresDone: choresSummary.done_today ?? choresSummary.done ?? 0,
      choresTotal: choresSummary.total_active ?? choresSummary.total ?? 0,
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
      title={`Итоги ${activeYear} года`}
      subtitle="Спокойный обзор практик, цикла и целей"
      footer={
        <button
          type="button"
          className="mt-btn mt-btn--primary mt-btn--wide"
          onClick={() => onClose?.()}
        >
          Готово
        </button>
      }
    >
      {loading && !metrics ? (
        <div
          className="mt-card"
          style={{ textAlign: "center", padding: "28px 16px" }}
          aria-busy="true"
        >
          <p className="mt-card-sub" style={{ margin: 0 }}>
            Собираем ваши итоги за год…
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
          {/* Unified 4-metric Carbon & Cobalt strip */}
          <MetricStrip
            items={[
              {
                key: "workouts",
                label: "Практики",
                value: String(metrics.totalSessions),
                tone: "cobalt",
                onClick: onNavigate ? () => jumpTo("habits", "workouts") : undefined,
              },
              {
                key: "streak",
                label: "Серия",
                value: `${metrics.bestHabit?.streak_days || 0} дн.`,
              },
              {
                key: "cycles",
                label: "Циклы",
                value: String(metrics.trackedCycles),
                tone: "coral",
                onClick: onNavigate ? () => jumpTo("habits", "cycle") : undefined,
              },
              {
                key: "milestones",
                label: "Вехи",
                value: `${metrics.doneMilestones}/${metrics.totalMilestones}`,
                onClick: onNavigate ? () => jumpTo("goals") : undefined,
              },
            ]}
          />

          {/* Compact overall goals progress */}
          <div className="mt-card mt-card--compact">
            <CompactProgress
              value={metrics.avgGoalPct}
              max={100}
              label="Средний прогресс целей"
              meta={`${metrics.avgGoalPct}% · ${formatCountRu(metrics.totalCheckins, "чек-ин", "чек-ина", "чек-инов")}`}
              tone="cobalt"
            />
          </div>

          {/* Workouts breakdown by type */}
          <div className="mt-stack mt-stack--xs">
            <GroupHeader
              title="Практики за год"
              meta={`${metrics.totalWorkoutMinutes} мин`}
              action={
                onNavigate ? (
                  <button
                    type="button"
                    className="mt-btn mt-btn--ghost mt-btn--sm"
                    onClick={() => jumpTo("habits", "workouts")}
                  >
                    Открыть
                  </button>
                ) : null
              }
            />
            <GroupList>
              {WORKOUT_ROW_ORDER.filter(
                (key) =>
                  key !== "other" || metrics.workoutsByType.other.count > 0,
              ).map((key) => {
                const stat = metrics.workoutsByType[key];
                const meta = WORKOUT_TYPE_MAP[key];
                return (
                  <ListRow
                    key={key}
                    title={meta?.label || key}
                    meta={`${stat.minutes} мин`}
                    trailing={
                      <span
                        className="tabular"
                        style={{
                          fontSize: "13.5px",
                          fontWeight: 600,
                          color: "var(--ink)",
                        }}
                      >
                        {formatCountRu(stat.count, "раз", "раза", "раз")}
                      </span>
                    }
                    onClick={
                      onNavigate ? () => jumpTo("habits", "workouts") : undefined
                    }
                  />
                );
              })}
            </GroupList>
          </div>

          {/* Goals (monthly mini-goals & multi-year goals) */}
          {metrics.goalItems.length > 0 ? (
            <div className="mt-stack mt-stack--xs">
              <GroupHeader
                title="Цели"
                meta={String(metrics.goalItems.length)}
                action={
                  onNavigate ? (
                    <button
                      type="button"
                      className="mt-btn mt-btn--ghost mt-btn--sm"
                      onClick={() => jumpTo("goals")}
                    >
                      Все цели
                    </button>
                  ) : null
                }
              />
              <GroupList>
                {metrics.goalItems.slice(0, 4).map((goal) => {
                  const pace =
                    GOAL_PACE_META[goal.pace_status] || GOAL_PACE_META.on_track;
                  const msDone = (goal.milestones || []).filter(
                    (m) => m.completed,
                  ).length;
                  const msTotal = (goal.milestones || []).length;
                  const metaParts = [
                    formatGoalHorizonRu(goal),
                    msTotal > 0 ? `вехи ${msDone}/${msTotal}` : null,
                    pace.shortLabel || pace.label,
                  ].filter(Boolean);

                  return (
                    <ListRow
                      key={goal.id}
                      title={goal.title}
                      meta={metaParts.join(" · ")}
                      trailing={
                        <span
                          className="mt-row tabular"
                          style={{
                            gap: "4px",
                            fontSize: "13.5px",
                            fontWeight: 600,
                            color: "var(--cobalt)",
                          }}
                        >
                          <span>{goal.progress_pct}%</span>
                          {onNavigate ? (
                            <ChevronRight size={15} color="var(--subtle)" />
                          ) : null}
                        </span>
                      }
                      onClick={onNavigate ? () => jumpTo("goals") : undefined}
                    />
                  );
                })}
              </GroupList>
            </div>
          ) : null}

          {/* Cycle & daily rhythm */}
          <div className="mt-stack mt-stack--xs">
            <GroupHeader title="Ритм и архив" />
            <GroupList>
              <ListRow
                title="Архив цикла"
                meta={`Цикл ${metrics.avgCycleLen} дн. · менструация ${metrics.avgPeriodLen} дн.`}
                trailing={
                  <span
                    className="mt-row tabular"
                    style={{ gap: "4px", fontSize: "13.5px", fontWeight: 600 }}
                  >
                    <span>
                      {formatCountRu(
                        metrics.trackedCycles,
                        "цикл",
                        "цикла",
                        "циклов",
                      )}
                    </span>
                    {onNavigate ? (
                      <ChevronRight size={15} color="var(--subtle)" />
                    ) : null}
                  </span>
                }
                onClick={
                  onNavigate ? () => jumpTo("habits", "cycle") : undefined
                }
              />
              {metrics.bestHabit ? (
                <ListRow
                  title="Лучшая серия привычки"
                  meta={metrics.bestHabit.title}
                  trailing={
                    <span
                      className="tabular"
                      style={{ fontSize: "13.5px", fontWeight: 600 }}
                    >
                      {metrics.bestHabit.streak_days} дн.
                    </span>
                  }
                  onClick={
                    onNavigate ? () => jumpTo("habits", "habits") : undefined
                  }
                />
              ) : null}
              <ListRow
                title="Водный баланс сегодня"
                meta={`Цель ${metrics.waterGoal} мл`}
                trailing={
                  <span
                    className="tabular"
                    style={{ fontSize: "13.5px", fontWeight: 600 }}
                  >
                    {metrics.waterMl} мл
                  </span>
                }
              />
              <ListRow
                title="Задачи и дом сегодня"
                meta={`Задачи ${metrics.tasksDone}/${metrics.tasksTotal} · Дом ${metrics.choresDone}/${metrics.choresTotal}`}
              />
            </GroupList>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
