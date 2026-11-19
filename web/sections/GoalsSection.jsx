import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Target,
  Sparkles,
  AlertTriangle,
  Award,
} from "lucide-react";
import api from "../api.js";
import {
  SectionHeader,
  ProgressRing,
  Pill,
  EmptyState,
} from "../components/UiPrimitives.jsx";
import GoalCard from "../components/goals/GoalCard.jsx";
import GoalFormSheet from "../components/goals/GoalFormSheet.jsx";
import GoalCheckinSheet from "../components/goals/GoalCheckinSheet.jsx";
import { formatCountRu } from "../data/presets.js";
import { todayISO } from "../utils/date.js";

const HORIZON_FILTERS = [
  { key: "all", label: "Все" },
  { key: "1", label: "1 год" },
  { key: "2-3", label: "2–3 года" },
  { key: "5", label: "5 лет" },
  { key: "completed", label: "Достигнутые" },
];

function computeSummaryFromList(items) {
  const active = items.filter((g) => g.status === "active");
  const completed = items.filter((g) => g.status === "completed");
  const avg =
    active.length > 0
      ? Math.round(
          active.reduce((sum, g) => sum + (Number(g.progress_pct) || 0), 0) /
            active.length,
        )
      : completed.length > 0
        ? 100
        : 0;
  const needsAttention = active.filter(
    (g) => g.pace_status === "attention" || g.pace_status === "at_risk",
  ).length;
  const dueCheckin = active.filter((g) => g.checkin_overdue).length;
  return {
    active_count: active.length,
    completed_count: completed.length,
    avg_progress_pct: avg,
    needs_attention_count: needsAttention,
    due_checkin_count: dueCheckin,
  };
}

export default function GoalsSection({
  todayDate,
  notify,
  onOpenYearReview,
  onDataChanged,
}) {
  const activeToday = todayDate || todayISO();
  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState({
    active_count: 0,
    completed_count: 0,
    avg_progress_pct: 0,
    needs_attention_count: 0,
    due_checkin_count: 0,
  });
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  // Sheets
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [checkinGoal, setCheckinGoal] = useState(null);

  const loadGoals = useCallback(async () => {
    try {
      const data = await api.getGoals({ status: "all", horizon: "all" });
      const list = Array.isArray(data?.items) ? data.items : [];
      setGoals(list);
      setSummary(data?.summary || computeSummaryFromList(list));
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить цели", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadHabits = useCallback(async () => {
    try {
      const data = await api.getHabits(activeToday);
      setHabits(Array.isArray(data?.items) ? data.items : []);
    } catch {
      // Optional enrichment for linked habit selector
    }
  }, [activeToday]);

  useEffect(() => {
    setLoading(true);
    loadGoals();
    loadHabits();
  }, [loadGoals, loadHabits]);

  const filteredGoals = useMemo(() => {
    return goals.filter((goal) => {
      if (filter === "all") return true;
      if (filter === "completed") return goal.status === "completed";
      if (goal.status === "completed") return false;
      const years = Number(goal.horizon_years) || 1;
      if (filter === "1") return years === 1;
      if (filter === "2-3") return years >= 2 && years <= 3;
      if (filter === "5") return years >= 4;
      return true;
    });
  }, [goals, filter]);

  function replaceGoalInState(updatedGoal) {
    if (!updatedGoal?.id) return;
    setGoals((prev) => {
      const next = prev.map((g) => (g.id === updatedGoal.id ? updatedGoal : g));
      setSummary(computeSummaryFromList(next));
      return next;
    });
  }

  async function handleSaveGoal(payload) {
    if (payload.id) {
      const { id, milestones, ...patchBody } = payload;
      const updated = await api.updateGoal(id, patchBody);
      replaceGoalInState(updated);
      notify?.("Цель обновлена", "success");
    } else {
      const { id, ...createBody } = payload;
      const created = await api.createGoal(createBody);
      setGoals((prev) => {
        const next = [created, ...prev];
        setSummary(computeSummaryFromList(next));
        return next;
      });
      notify?.("Долгосрочная цель создана", "success");
    }
    onDataChanged?.();
  }

  async function handleDeleteGoal(goalId) {
    await api.deleteGoal(goalId);
    setGoals((prev) => {
      const next = prev.filter((g) => g.id !== goalId);
      setSummary(computeSummaryFromList(next));
      return next;
    });
    notify?.("Цель удалена", "info");
    onDataChanged?.();
  }

  async function handleSubmitCheckin(goalId, payload) {
    const res = await api.createGoalCheckin(goalId, payload);
    if (res?.goal) {
      replaceGoalInState(res.goal);
    } else {
      await loadGoals();
    }
    notify?.("Чек-ин сохранён — прогресс цели обновлён", "success");
    onDataChanged?.();
  }

  async function handleToggleMilestone(goalId, milestone) {
    try {
      const res = await api.updateMilestone(goalId, milestone.id, {
        completed: !milestone.completed,
        sync_progress: true,
      });
      if (res?.goal) {
        replaceGoalInState(res.goal);
      } else {
        await loadGoals();
      }
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось обновить веху", "error");
    }
  }

  async function handleAddMilestone(goalId, payload) {
    try {
      const res = await api.createMilestone(goalId, payload);
      if (res?.goal) {
        replaceGoalInState(res.goal);
      } else {
        await loadGoals();
      }
      notify?.("Веха добавлена", "success");
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить веху", "error");
      throw err;
    }
  }

  async function handleDeleteMilestone(goalId, milestoneId) {
    try {
      const res = await api.deleteMilestone(goalId, milestoneId);
      if (res?.goal) {
        replaceGoalInState(res.goal);
      } else {
        await loadGoals();
      }
      notify?.("Веха удалена", "info");
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось удалить веху", "error");
    }
  }

  const attentionCount = Math.max(
    summary.due_checkin_count || 0,
    summary.needs_attention_count || 0,
  );

  return (
    <section className="mt-section" data-accent="goals" aria-label="Цели">
      <SectionHeader
        eyebrow="Личный рост · 1–5 лет"
        title="Цели"
        subtitle="Цели следят за прогрессом и напоминают о шагах"
        action={
          <div className="mt-row" style={{ gap: "6px" }}>
            {typeof onOpenYearReview === "function" ? (
              <button
                type="button"
                className="mt-btn mt-btn--soft mt-btn--sm"
                data-accent="goals"
                onClick={() => onOpenYearReview()}
              >
                <Award size={15} />
                <span>Итоги</span>
              </button>
            ) : null}
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              data-accent="goals"
              aria-label="Новая цель"
              onClick={() => {
                setEditingGoal(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Цель</span>
            </button>
          </div>
        }
      />

      {/* Summary Banner: Цели следят за прогрессом */}
      <div className="goals-banner" data-accent="goals">
        <div className="mt-row" style={{ gap: "14px" }}>
          <ProgressRing
            percent={summary.avg_progress_pct}
            size={70}
            strokeWidth={6}
            color="var(--goals)"
            label={`${Math.round(summary.avg_progress_pct || 0)}%`}
            sublabel="среднее"
          />
          <div className="mt-stack mt-stack--xs" style={{ flex: "1 1 auto" }}>
            <div className="mt-row mt-row--between" style={{ gap: "6px" }}>
              <h2 className="mt-card-title">Цели следят за прогрессом</h2>
            </div>
            <p className="mt-card-sub" style={{ marginTop: 0 }}>
              {summary.active_count > 0
                ? `${formatCountRu(summary.active_count, "активная цель", "активные цели", "активных целей")} в работе`
                : "Поставьте первую долгосрочную цель на 1–5 лет"}
              {summary.completed_count > 0
                ? ` · достигнуто ${summary.completed_count}`
                : ""}
            </p>
            <div className="mt-row mt-row--wrap" style={{ gap: "6px" }}>
              {attentionCount > 0 ? (
                <Pill tone="warning" icon={<AlertTriangle size={12} />}>
                  Ждут внимания: {attentionCount}
                </Pill>
              ) : summary.active_count > 0 ? (
                <Pill tone="success" icon={<Sparkles size={12} />}>
                  Все цели в спокойном темпе
                </Pill>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Horizon & Status Filter Pills */}
      <div
        className="mt-chip-row"
        role="group"
        aria-label="Фильтр целей по горизонту"
      >
        {HORIZON_FILTERS.map((opt) => (
          <Pill
            key={opt.key}
            tone="goals"
            active={filter === opt.key}
            onClick={() => setFilter(opt.key)}
          >
            {opt.label}
          </Pill>
        ))}
      </div>

      {/* Goals List */}
      {loading ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-card-sub">Загружаем ваши долгосрочные цели...</p>
        </div>
      ) : filteredGoals.length === 0 ? (
        <EmptyState
          icon={<Target size={24} />}
          title={
            filter === "completed"
              ? "Пока нет завершённых целей"
              : "В этом горизонте пока нет целей"
          }
          description={
            filter === "completed"
              ? "Когда цель дойдёт до 100%, она появится здесь как повод для гордости."
              : "Поставьте цель на 1, 2, 3 или 5 лет — она будет мягко следить за вашим темпом и привычками."
          }
          action={
            filter !== "completed" ? (
              <button
                type="button"
                className="mt-btn mt-btn--primary"
                data-accent="goals"
                onClick={() => {
                  setEditingGoal(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={18} />
                <span>Новая цель</span>
              </button>
            ) : (
              <button
                type="button"
                className="mt-btn mt-btn--soft"
                data-accent="goals"
                onClick={() => setFilter("all")}
              >
                Показать все цели
              </button>
            )
          }
        />
      ) : (
        <div className="mt-stack">
          {filteredGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              defaultMilestonesOpen={filteredGoals.length === 1}
              onOpenCheckin={(g) => setCheckinGoal(g)}
              onEditGoal={(g) => {
                setEditingGoal(g);
                setFormOpen(true);
              }}
              onToggleMilestone={handleToggleMilestone}
              onAddMilestone={handleAddMilestone}
              onDeleteMilestone={handleDeleteMilestone}
            />
          ))}
        </div>
      )}

      <GoalFormSheet
        open={formOpen}
        goal={editingGoal}
        habits={habits}
        todayDate={activeToday}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
      />

      <GoalCheckinSheet
        open={Boolean(checkinGoal)}
        goal={checkinGoal}
        todayDate={activeToday}
        onClose={() => setCheckinGoal(null)}
        onSubmit={handleSubmitCheckin}
      />
    </section>
  );
}
