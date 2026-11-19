import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Target, Award } from "lucide-react";
import api from "../api.js";
import {
  PageHeader,
  SegmentedControl,
  Pill,
  SelectField,
  EmptyState,
} from "../components/UiPrimitives.jsx";
import GoalCard from "../components/goals/GoalCard.jsx";
import GoalDetailSheet from "../components/goals/GoalDetailSheet.jsx";
import GoalFormSheet from "../components/goals/GoalFormSheet.jsx";
import GoalCheckinSheet from "../components/goals/GoalCheckinSheet.jsx";
import WishesTab from "../components/goals/WishesTab.jsx";
import EventsCalendarTab from "../components/goals/EventsCalendarTab.jsx";
import { GOAL_SPHERES } from "../data/presets.js";
import { todayISO } from "../utils/date.js";

const HORIZON_FILTERS = [
  { key: "all", label: "Все" },
  { key: "month", label: "1 месяц" },
  { key: "1y", label: "1 год" },
  { key: "5y", label: "5 лет" },
  { key: "completed", label: "Готово" },
];

function resolveInitialSubTab(initialSubTab) {
  if (initialSubTab === "wishes") return "wishes";
  if (initialSubTab === "calendar") return "calendar";
  return "goals";
}

export default function GoalsSection({
  todayDate,
  initialSubTab,
  notify,
  onOpenYearReview,
  onDataChanged,
}) {
  const activeToday = todayDate || todayISO();
  const [subTab, setSubTab] = useState(() =>
    resolveInitialSubTab(initialSubTab),
  );

  const [goals, setGoals] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Sheets & sub-tab create triggers
  const [detailGoalId, setDetailGoalId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [formDefaultHorizon, setFormDefaultHorizon] = useState("1y");
  const [formDefaultParentId, setFormDefaultParentId] = useState(null);
  const [formDefaultCategory, setFormDefaultCategory] = useState("");
  const [checkinGoalId, setCheckinGoalId] = useState(null);
  const [wishCreateSignal, setWishCreateSignal] = useState(0);
  const [eventCreateSignal, setEventCreateSignal] = useState(0);

  useEffect(() => {
    if (
      initialSubTab === "calendar" ||
      initialSubTab === "wishes" ||
      initialSubTab === "goals"
    ) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

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

  const categoryFilterOptions = useMemo(
    () => [
      { value: "", label: "Все категории" },
      ...GOAL_SPHERES.map((s) => ({ value: s.key, label: s.label })),
    ],
    [],
  );

  const bigGoals = useMemo(
    () =>
      goals.filter(
        (g) => g.horizon_unit !== "month" && g.status !== "completed",
      ),
    [goals],
  );

  const filteredGoals = useMemo(() => {
    return goals.filter((goal) => {
      if (categoryFilter && goal.category !== categoryFilter) return false;
      if (filter === "all") return true;
      if (filter === "completed") return goal.status === "completed";
      if (goal.status === "completed") return false;
      if (filter === "month") return goal.horizon_unit === "month";
      if (goal.horizon_unit === "month") return false;
      const years = Number(goal.horizon_years) || 1;
      if (filter === "1y") return years === 1;
      if (filter === "5y") return years >= 2;
      return true;
    });
  }, [goals, filter, categoryFilter]);

  const detailGoal = useMemo(
    () => goals.find((g) => g.id === detailGoalId) || null,
    [goals, detailGoalId],
  );

  const checkinGoal = useMemo(
    () => goals.find((g) => g.id === checkinGoalId) || null,
    [goals, checkinGoalId],
  );

  function openNewGoalForm({
    horizon = "1y",
    parentId = null,
    category = "",
  } = {}) {
    setEditingGoal(null);
    setFormDefaultHorizon(horizon);
    setFormDefaultParentId(parentId);
    setFormDefaultCategory(category || categoryFilter || "");
    setFormOpen(true);
  }

  async function handleSaveGoal(payload) {
    if (payload.id) {
      const { id, milestones, ...patchBody } = payload;
      await api.updateGoal(id, patchBody);
      notify?.("Цель обновлена", "success");
    } else {
      const { id, ...createBody } = payload;
      await api.createGoal(createBody);
      notify?.(
        createBody.horizon_unit === "month"
          ? "Мини-цель на месяц создана"
          : "Цель создана",
        "success",
      );
    }
    await loadGoals();
    onDataChanged?.();
  }

  async function handleDeleteGoal(goalId) {
    await api.deleteGoal(goalId);
    if (detailGoalId === goalId) setDetailGoalId(null);
    if (checkinGoalId === goalId) setCheckinGoalId(null);
    notify?.("Цель удалена", "info");
    await loadGoals();
    onDataChanged?.();
  }

  async function handleSubmitCheckin(goalId, payload) {
    await api.createGoalCheckin(goalId, payload);
    notify?.("Чек-ин сохранён", "success");
    await loadGoals();
    onDataChanged?.();
  }

  async function handleToggleMilestone(goalId, milestone) {
    try {
      await api.updateMilestone(goalId, milestone.id, {
        completed: !milestone.completed,
        sync_progress: true,
      });
      await loadGoals();
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось обновить веху", "error");
    }
  }

  async function handleAddMilestone(goalId, payload) {
    try {
      await api.createMilestone(goalId, payload);
      notify?.("Веха добавлена", "success");
      await loadGoals();
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить веху", "error");
      throw err;
    }
  }

  async function handleDeleteMilestone(goalId, milestoneId) {
    try {
      await api.deleteMilestone(goalId, milestoneId);
      notify?.("Веха удалена", "info");
      await loadGoals();
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось удалить веху", "error");
    }
  }

  const headerAction =
    subTab === "calendar" ? (
      <button
        type="button"
        className="mt-btn mt-btn--primary mt-btn--sm"
        aria-label="Новое событие"
        onClick={() => setEventCreateSignal((n) => n + 1)}
      >
        <Plus size={16} />
        <span>Событие</span>
      </button>
    ) : subTab === "wishes" ? (
      <button
        type="button"
        className="mt-btn mt-btn--primary mt-btn--sm"
        aria-label="Новое желание"
        onClick={() => setWishCreateSignal((n) => n + 1)}
      >
        <Plus size={16} />
        <span>Желание</span>
      </button>
    ) : (
      <button
        type="button"
        className="mt-btn mt-btn--primary mt-btn--sm"
        aria-label="Новая цель"
        onClick={() =>
          openNewGoalForm({
            horizon:
              filter === "month" ? "month" : filter === "5y" ? "5y" : "1y",
          })
        }
      >
        <Plus size={16} />
        <span>Цель</span>
      </button>
    );

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
        action={headerAction}
      />

      <SegmentedControl
        value={subTab}
        onChange={setSubTab}
        options={[
          { value: "goals", label: "Цели" },
          { value: "wishes", label: "Желания" },
          { value: "calendar", label: "Календарь" },
        ]}
      />

      {subTab === "goals" ? (
        <div className="mt-stack">
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

          {/* 7-Category Filter SelectField */}
          <div className="goals-filter-bar">
            <SelectField
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryFilterOptions}
              ariaLabel="Фильтр целей по категории"
              compact
            />
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
                  : categoryFilter
                    ? "В этой категории пока нет целей"
                    : "В этом горизонте нет целей"
              }
              description={
                filter === "completed"
                  ? "Завершённые цели появятся здесь."
                  : "Поставьте цель на месяц, год или 5 лет — она будет мягко следить за вашим темпом."
              }
              action={
                filter !== "completed" ? (
                  <button
                    type="button"
                    className="mt-btn mt-btn--primary"
                    onClick={() =>
                      openNewGoalForm({
                        horizon:
                          filter === "month"
                            ? "month"
                            : filter === "5y"
                              ? "5y"
                              : "1y",
                      })
                    }
                  >
                    <Plus size={17} />
                    <span>Новая цель</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mt-btn mt-btn--soft"
                    onClick={() => {
                      setFilter("all");
                      setCategoryFilter("");
                    }}
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
        </div>
      ) : subTab === "wishes" ? (
        <WishesTab
          todayDate={activeToday}
          notify={notify}
          onDataChanged={onDataChanged}
          createSignal={wishCreateSignal}
        />
      ) : (
        <EventsCalendarTab
          todayDate={activeToday}
          notify={notify}
          onDataChanged={onDataChanged}
          createSignal={eventCreateSignal}
        />
      )}

      <GoalDetailSheet
        open={Boolean(detailGoal)}
        goal={detailGoal}
        onClose={() => setDetailGoalId(null)}
        onSelectGoal={(goalId) => setDetailGoalId(goalId)}
        onAddMiniGoal={(parentGoal) =>
          openNewGoalForm({
            horizon: "month",
            parentId: parentGoal.id,
            category: parentGoal.category || "",
          })
        }
        onOpenCheckin={(g) => setCheckinGoalId(g.id)}
        onEditGoal={(g) => {
          setEditingGoal(g);
          setFormDefaultHorizon(
            g.horizon_unit === "month"
              ? "month"
              : Number(g.horizon_years) >= 3
                ? "5y"
                : "1y",
          );
          setFormDefaultParentId(g.parent_goal_id || null);
          setFormDefaultCategory(g.category || "");
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
        defaultHorizon={formDefaultHorizon}
        defaultParentGoalId={formDefaultParentId}
        defaultCategory={formDefaultCategory}
        bigGoals={bigGoals}
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
