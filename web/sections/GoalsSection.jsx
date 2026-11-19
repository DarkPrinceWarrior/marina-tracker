import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Target, Award } from "lucide-react";
import api from "../api.js";
import { PageHeader, Pill, EmptyState } from "../components/UiPrimitives.jsx";
import GoalCard from "../components/goals/GoalCard.jsx";
import GoalDetailSheet from "../components/goals/GoalDetailSheet.jsx";
import GoalFormSheet from "../components/goals/GoalFormSheet.jsx";
import GoalCheckinSheet from "../components/goals/GoalCheckinSheet.jsx";
import { todayISO } from "../utils/date.js";

const HORIZON_FILTERS = [
  { key: "all", label: "Все" },
  { key: "1", label: "1 год" },
  { key: "2-3", label: "2–3 года" },
  { key: "5", label: "5 лет" },
  { key: "completed", label: "Готово" },
];

export default function GoalsSection({
  todayDate,
  notify,
  onOpenYearReview,
  onDataChanged,
}) {
  const activeToday = todayDate || todayISO();
  const [goals, setGoals] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  // Sheets
  const [detailGoalId, setDetailGoalId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [checkinGoalId, setCheckinGoalId] = useState(null);

  const loadGoals = useCallback(async () => {
    try {
      const data = await api.getGoals({ status: "all", horizon: "all" });
      const list = Array.isArray(data?.items) ? data.items : [];
      setGoals(list);
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

  const detailGoal = useMemo(
    () => goals.find((g) => g.id === detailGoalId) || null,
    [goals, detailGoalId],
  );

  const checkinGoal = useMemo(
    () => goals.find((g) => g.id === checkinGoalId) || null,
    [goals, checkinGoalId],
  );

  function replaceGoalInState(updatedGoal) {
    if (!updatedGoal?.id) return;
    setGoals((prev) =>
      prev.map((g) => (g.id === updatedGoal.id ? updatedGoal : g)),
    );
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
      setGoals((prev) => [created, ...prev]);
      notify?.("Цель создана", "success");
    }
    onDataChanged?.();
  }

  async function handleDeleteGoal(goalId) {
    await api.deleteGoal(goalId);
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
    if (detailGoalId === goalId) setDetailGoalId(null);
    if (checkinGoalId === goalId) setCheckinGoalId(null);
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
    notify?.("Чек-ин сохранён", "success");
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

  return (
    <section className="mt-section" aria-label="Цели">
      <PageHeader
        title="Цели"
        secondaryAction={
          typeof onOpenYearReview === "function" ? (
            <button
              type="button"
              className="mt-icon-btn"
              aria-label="Итоги года"
              onClick={() => onOpenYearReview()}
            >
              <Award size={19} />
            </button>
          ) : null
        }
        action={
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--sm"
            aria-label="Новая цель"
            onClick={() => {
              setEditingGoal(null);
              setFormOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Цель</span>
          </button>
        }
      />

      {/* Horizon & Status Filter Row */}
      <div
        className="mt-chip-row"
        role="group"
        aria-label="Фильтр целей по горизонту"
      >
        {HORIZON_FILTERS.map((opt) => (
          <Pill
            key={opt.key}
            tone="neutral"
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
          <p className="mt-card-sub">Загружаем цели...</p>
        </div>
      ) : filteredGoals.length === 0 ? (
        <EmptyState
          icon={<Target size={22} />}
          title={
            filter === "completed"
              ? "Пока нет достигнутых целей"
              : "В этом горизонте нет целей"
          }
          description={
            filter === "completed"
              ? "Завершённые цели появятся здесь."
              : "Поставьте цель на 1–5 лет — она будет мягко следить за вашим темпом."
          }
          action={
            filter !== "completed" ? (
              <button
                type="button"
                className="mt-btn mt-btn--primary"
                onClick={() => {
                  setEditingGoal(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={17} />
                <span>Новая цель</span>
              </button>
            ) : (
              <button
                type="button"
                className="mt-btn mt-btn--soft"
                onClick={() => setFilter("all")}
              >
                Показать все
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
              onOpenDetail={(g) => setDetailGoalId(g.id)}
              onOpenCheckin={(g) => setCheckinGoalId(g.id)}
            />
          ))}
        </div>
      )}

      <GoalDetailSheet
        open={Boolean(detailGoal)}
        goal={detailGoal}
        onClose={() => setDetailGoalId(null)}
        onOpenCheckin={(g) => setCheckinGoalId(g.id)}
        onEditGoal={(g) => {
          setEditingGoal(g);
          setFormOpen(true);
        }}
        onDeleteGoal={handleDeleteGoal}
        onToggleMilestone={handleToggleMilestone}
        onAddMilestone={handleAddMilestone}
        onDeleteMilestone={handleDeleteMilestone}
      />

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
        onClose={() => setCheckinGoalId(null)}
        onSubmit={handleSubmitCheckin}
      />
    </section>
  );
}
