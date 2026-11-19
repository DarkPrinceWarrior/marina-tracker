import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, Sparkles } from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  PageHeader,
  SegmentedControl,
  CompactProgress,
  GroupList,
  ListRow,
  Pill,
  EmptyState,
} from "../components/UiPrimitives.jsx";
import ShoppingPanel from "../components/ShoppingPanel.jsx";
import ChoreSheet from "../components/home/ChoreSheet.jsx";
import {
  CHORE_ZONES,
  CHORE_FREQUENCY_MAP,
  HOUSEHOLD_CATEGORIES,
} from "../data/presets.js";
import {
  todayISO,
  formatDateShortRu,
  formatRelativeDayRu,
  nowTimeHHMM,
} from "../utils/date.js";

function formatShortLastDone(chore, activeDate) {
  if (chore.completed && chore.completed_at) {
    const dayLabel = formatRelativeDayRu(activeDate).toLowerCase();
    return `${dayLabel} ${chore.completed_at}`;
  }
  if (chore.last_completed_date) {
    const rel = formatRelativeDayRu(chore.last_completed_date);
    if (rel === "Сегодня" || rel === "Вчера" || rel === "Завтра") {
      return rel.toLowerCase();
    }
    return formatDateShortRu(chore.last_completed_date);
  }
  return "";
}

function recomputeChoreSummary(items) {
  const active = items.filter((item) => item.active !== false);
  const done_today = active.filter((i) => i.completed).length;
  const daily = active.filter((i) => i.frequency === "daily");
  const weekly = active.filter((i) => i.frequency === "weekly");
  return {
    done_today,
    total_active: active.length,
    daily_done: daily.filter((i) => i.completed).length,
    daily_total: daily.length,
    weekly_done: weekly.filter((i) => i.completed).length,
    weekly_total: weekly.length,
  };
}

export default function HomeSection({
  selectedDate,
  todayDate,
  initialSubTab,
  notify,
  onDataChanged,
}) {
  const activeDate = selectedDate || todayDate || todayISO();
  const [subTab, setSubTab] = useState(
    initialSubTab === "shopping" ? "shopping" : "chores",
  );

  // Chores state
  const [chores, setChores] = useState([]);
  const [choresSummary, setChoresSummary] = useState({
    done_today: 0,
    total_active: 0,
    daily_done: 0,
    daily_total: 0,
    weekly_done: 0,
    weekly_total: 0,
  });
  const [choresLoading, setChoresLoading] = useState(true);
  const [choreFilter, setChoreFilter] = useState("all");
  const [choreSheetOpen, setChoreSheetOpen] = useState(false);
  const [editingChore, setEditingChore] = useState(null);

  // Household shopping count badge (strictly household goods, zero food)
  const [householdCount, setHouseholdCount] = useState(0);

  useEffect(() => {
    if (initialSubTab === "shopping" || initialSubTab === "chores") {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const loadChores = useCallback(async () => {
    try {
      const data = await api.getChores(activeDate);
      const list = Array.isArray(data?.items) ? data.items : [];
      setChores(list);
      setChoresSummary(data?.summary || recomputeChoreSummary(list));
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить дела по дому", "error");
    } finally {
      setChoresLoading(false);
    }
  }, [activeDate, notify]);

  const loadHouseholdCount = useCallback(async () => {
    try {
      const data = await api.getShopping("household");
      const list = Array.isArray(data?.items) ? data.items : [];
      setHouseholdCount(list.filter((it) => !it.bought).length);
    } catch {
      // Optional initial badge count
    }
  }, []);

  useEffect(() => {
    setChoresLoading(true);
    loadChores();
  }, [loadChores]);

  useEffect(() => {
    loadHouseholdCount();
  }, [loadHouseholdCount]);

  // Zone filter chips (show Общее only if chores use it)
  const choreFilterOptions = useMemo(() => {
    const hasGeneral = chores.some((c) => c.zone === "Общее");
    const zones = CHORE_ZONES.filter(
      (z) => z.key !== "Общее" || hasGeneral,
    ).map((z) => ({ key: z.key, label: z.label }));
    return [
      { key: "all", label: "Все" },
      { key: "today", label: "Сегодня" },
      ...zones,
    ];
  }, [chores]);

  const filteredChores = useMemo(() => {
    const list = chores.filter((chore) => {
      if (choreFilter === "all") return true;
      if (choreFilter === "today") {
        return (
          chore.frequency === "daily" ||
          chore.completed ||
          chore.frequency === "once"
        );
      }
      return chore.zone === choreFilter;
    });
    return [...list].sort((a, b) => {
      if (Boolean(a.completed) !== Boolean(b.completed)) {
        return a.completed ? 1 : -1;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
    });
  }, [chores, choreFilter]);

  const progressStats = useMemo(() => {
    const done = choresSummary.done_today || 0;
    const total = choresSummary.total_active || chores.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [choresSummary, chores.length]);

  const choresPendingCount = useMemo(
    () =>
      Math.max(
        0,
        (choresSummary.total_active || 0) - (choresSummary.done_today || 0),
      ),
    [choresSummary],
  );

  // Handlers: Chores
  async function handleToggleChore(chore) {
    const nextCompleted = !chore.completed;
    const nowTime = nowTimeHHMM();

    try {
      const updated = await withOptimistic({
        apply: () => {
          const prevChores = chores;
          const nextChores = chores.map((item) =>
            item.id === chore.id
              ? {
                  ...item,
                  completed: nextCompleted,
                  completed_at: nextCompleted ? nowTime : null,
                  last_completed_date: nextCompleted
                    ? activeDate
                    : item.last_completed_date,
                  last_completed_at: nextCompleted
                    ? nowTime
                    : item.last_completed_at,
                }
              : item,
          );
          setChores(nextChores);
          setChoresSummary(recomputeChoreSummary(nextChores));
          return prevChores;
        },
        commit: () =>
          api.toggleChore(chore.id, {
            date: activeDate,
            completed: nextCompleted,
          }),
        rollback: (prevChores) => {
          setChores(prevChores);
          setChoresSummary(recomputeChoreSummary(prevChores));
        },
        onError: (err) => {
          notify?.(err?.message || "Не удалось обновить статус дела", "error");
        },
      });

      if (updated?.id) {
        setChores((prev) => {
          const next = prev.map((item) =>
            item.id === updated.id ? { ...item, ...updated } : item,
          );
          setChoresSummary(recomputeChoreSummary(next));
          return next;
        });
      }
      onDataChanged?.();
    } catch {
      // handled by onError
    }
  }

  async function handleSaveChore(payload) {
    if (payload.id) {
      const updated = await api.updateChore(payload.id, {
        title: payload.title,
        zone: payload.zone,
        frequency: payload.frequency,
      });
      setChores((prev) => {
        const next = prev.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        );
        setChoresSummary(recomputeChoreSummary(next));
        return next;
      });
      notify?.("Дело обновлено", "success");
    } else {
      const created = await api.createChore({
        title: payload.title,
        zone: payload.zone,
        frequency: payload.frequency,
      });
      setChores((prev) => {
        const next = [...prev, created];
        setChoresSummary(recomputeChoreSummary(next));
        return next;
      });
      notify?.("Дело добавлено", "success");
    }
    onDataChanged?.();
  }

  async function handleDeleteChore(choreId) {
    await api.deleteChore(choreId);
    setChores((prev) => {
      const next = prev.filter((item) => item.id !== choreId);
      setChoresSummary(recomputeChoreSummary(next));
      return next;
    });
    notify?.("Дело удалено", "info");
    onDataChanged?.();
  }

  return (
    <section className="mt-section" aria-label="Дом">
      <PageHeader
        title="Дом"
        action={
          subTab === "chores" ? (
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              aria-label="Новое дело"
              onClick={() => {
                setEditingChore(null);
                setChoreSheetOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Дело</span>
            </button>
          ) : null
        }
      />

      <SegmentedControl
        value={subTab}
        onChange={setSubTab}
        options={[
          {
            value: "chores",
            label: "Уборка",
            count: choresPendingCount,
          },
          {
            value: "shopping",
            label: "Покупки",
            count: householdCount,
          },
        ]}
      />

      {subTab === "chores" ? (
        <div className="mt-stack">
          <div className="mt-card mt-card--compact">
            <CompactProgress
              value={progressStats.done}
              max={Math.max(1, progressStats.total)}
              label={`Сделано ${progressStats.done} из ${progressStats.total}`}
              meta={`${progressStats.pct}%`}
              tone="cobalt"
            />
          </div>

          <div
            className="mt-chip-row"
            role="group"
            aria-label="Фильтр дел по зонам"
          >
            {choreFilterOptions.map((opt) => (
              <Pill
                key={opt.key}
                tone="neutral"
                active={choreFilter === opt.key}
                onClick={() => setChoreFilter(opt.key)}
              >
                {opt.label}
              </Pill>
            ))}
          </div>

          {choresLoading ? (
            <div className="mt-card mt-card--compact">
              <p className="mt-card-sub">Загружаем список дел...</p>
            </div>
          ) : filteredChores.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={22} />}
              title="В этой категории чисто"
              description="Добавьте регулярное или разовое дело."
              action={
                <button
                  type="button"
                  className="mt-btn mt-btn--primary"
                  onClick={() => {
                    setEditingChore(null);
                    setChoreSheetOpen(true);
                  }}
                >
                  <Plus size={17} />
                  <span>Новое дело</span>
                </button>
              }
            />
          ) : (
            <GroupList className="home-chores-list">
              {filteredChores.map((chore) => {
                const freqLabel =
                  CHORE_FREQUENCY_MAP[chore.frequency]?.label || "Регулярно";
                const lastDone = formatShortLastDone(chore, activeDate);
                const metaParts = [chore.zone || "Общее", freqLabel];
                if (lastDone) metaParts.push(lastDone);

                return (
                  <ListRow
                    key={chore.id}
                    checked={Boolean(chore.completed)}
                    onToggle={() => handleToggleChore(chore)}
                    onClick={() => {
                      setEditingChore(chore);
                      setChoreSheetOpen(true);
                    }}
                    strikethrough={true}
                    accent="cobalt"
                    title={chore.title}
                    meta={metaParts.join(" · ")}
                    trailing={
                      <ChevronRight
                        size={16}
                        className="muted"
                        aria-hidden="true"
                      />
                    }
                  />
                );
              })}
            </GroupList>
          )}
        </div>
      ) : (
        <ShoppingPanel
          listType="household"
          categories={HOUSEHOLD_CATEGORIES}
          placeholder="Средства, техника, мебель…"
          emptyTitle="Покупок для дома пока нет"
          emptyDescription="Добавьте моющие средства, технику, текстиль или мебель."
          notify={notify}
          onDataChanged={onDataChanged}
          onCountChange={setHouseholdCount}
        />
      )}

      <ChoreSheet
        open={choreSheetOpen}
        chore={editingChore}
        onClose={() => {
          setChoreSheetOpen(false);
          setEditingChore(null);
        }}
        onSave={handleSaveChore}
        onDelete={handleDeleteChore}
      />
    </section>
  );
}
