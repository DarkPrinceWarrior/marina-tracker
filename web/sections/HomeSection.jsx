import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ShoppingBasket,
  X,
} from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  PageHeader,
  SegmentedControl,
  CompactProgress,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
  EmptyState,
} from "../components/UiPrimitives.jsx";
import ChoreSheet from "../components/home/ChoreSheet.jsx";
import {
  CHORE_ZONES,
  CHORE_FREQUENCY_MAP,
  SHOPPING_CATEGORIES,
  formatCountRu,
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

function recomputeShoppingSummary(items) {
  const bought = items.filter((i) => i.bought).length;
  return {
    remaining: items.length - bought,
    bought,
    total: items.length,
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

  // Shopping state
  const [shoppingItems, setShoppingItems] = useState([]);
  const [shoppingSummary, setShoppingSummary] = useState({
    remaining: 0,
    bought: 0,
    total: 0,
  });
  const [shoppingLoading, setShoppingLoading] = useState(true);
  const [quickName, setQuickName] = useState("");
  const [quickQty, setQuickQty] = useState("");
  const [quickCategory, setQuickCategory] = useState(
    SHOPPING_CATEGORIES[0].key,
  );
  const [addingItem, setAddingItem] = useState(false);
  const [clearingBought, setClearingBought] = useState(false);
  const [boughtExpanded, setBoughtExpanded] = useState(false);
  const quickInputRef = useRef(null);

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

  const loadShopping = useCallback(async () => {
    try {
      const data = await api.getShopping();
      const list = Array.isArray(data?.items) ? data.items : [];
      setShoppingItems(list);
      setShoppingSummary(data?.summary || recomputeShoppingSummary(list));
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить список покупок", "error");
    } finally {
      setShoppingLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    setChoresLoading(true);
    loadChores();
  }, [loadChores]);

  useEffect(() => {
    setShoppingLoading(true);
    loadShopping();
  }, [loadShopping]);

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

  // Grouped shopping lists
  const { activeShoppingGroups, boughtItems } = useMemo(() => {
    const unbought = shoppingItems.filter((item) => !item.bought);
    const bought = shoppingItems.filter((item) => item.bought);

    const grouped = new Map();
    SHOPPING_CATEGORIES.forEach((cat) => {
      grouped.set(cat.key, []);
    });

    unbought.forEach((item) => {
      const catKey = item.category || "Другое";
      if (!grouped.has(catKey)) {
        grouped.set(catKey, []);
      }
      grouped.get(catKey).push(item);
    });

    const groups = [];
    for (const [category, items] of grouped.entries()) {
      if (items.length > 0) {
        groups.push({ category, items });
      }
    }

    return { activeShoppingGroups: groups, boughtItems: bought };
  }, [shoppingItems]);

  // Handlers: Shopping
  async function handleQuickAddShopping(event) {
    event?.preventDefault();
    const trimmed = quickName.trim();
    if (!trimmed || addingItem) return;

    setAddingItem(true);
    try {
      const created = await api.createShoppingItem({
        name: trimmed,
        quantity: quickQty.trim(),
        category: quickCategory,
      });
      setShoppingItems((prev) => {
        const next = [created, ...prev];
        setShoppingSummary(recomputeShoppingSummary(next));
        return next;
      });
      setQuickName("");
      setQuickQty("");
      notify?.(`Добавлено: ${trimmed}`, "success");
      onDataChanged?.();
      quickInputRef.current?.focus();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить покупку", "error");
    } finally {
      setAddingItem(false);
    }
  }

  async function handleToggleShopping(item) {
    const nextBought = !item.bought;
    try {
      const updated = await withOptimistic({
        apply: () => {
          const prev = shoppingItems;
          const next = shoppingItems.map((entry) =>
            entry.id === item.id ? { ...entry, bought: nextBought } : entry,
          );
          setShoppingItems(next);
          setShoppingSummary(recomputeShoppingSummary(next));
          return prev;
        },
        commit: () =>
          api.updateShoppingItem(item.id, { bought: nextBought }),
        rollback: (prev) => {
          setShoppingItems(prev);
          setShoppingSummary(recomputeShoppingSummary(prev));
        },
        onError: (err) => {
          notify?.(err?.message || "Не удалось обновить покупку", "error");
        },
      });
      if (updated?.id) {
        setShoppingItems((prev) => {
          const next = prev.map((entry) =>
            entry.id === updated.id ? { ...entry, ...updated } : entry,
          );
          setShoppingSummary(recomputeShoppingSummary(next));
          return next;
        });
      }
      onDataChanged?.();
    } catch {
      // handled by onError
    }
  }

  async function handleDeleteShopping(item) {
    try {
      await withOptimistic({
        apply: () => {
          const prev = shoppingItems;
          const next = shoppingItems.filter((entry) => entry.id !== item.id);
          setShoppingItems(next);
          setShoppingSummary(recomputeShoppingSummary(next));
          return prev;
        },
        commit: () => api.deleteShoppingItem(item.id),
        rollback: (prev) => {
          setShoppingItems(prev);
          setShoppingSummary(recomputeShoppingSummary(prev));
        },
        onError: (err) => {
          notify?.(err?.message || "Не удалось удалить позицию", "error");
        },
      });
      notify?.("Позиция удалена", "info");
      onDataChanged?.();
    } catch {
      // handled by onError
    }
  }

  async function handleClearBought() {
    if (boughtItems.length === 0 || clearingBought) return;
    setClearingBought(true);
    try {
      const res = await api.clearBoughtShopping();
      setShoppingItems((prev) => {
        const next = prev.filter((item) => !item.bought);
        setShoppingSummary(recomputeShoppingSummary(next));
        return next;
      });
      setBoughtExpanded(false);
      const count = res?.cleared ?? boughtItems.length;
      notify?.(
        `Очищено ${formatCountRu(count, "позиция", "позиции", "позиций")}`,
        "success",
      );
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось очистить купленное", "error");
    } finally {
      setClearingBought(false);
    }
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
            count: shoppingSummary.remaining,
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
        <div className="mt-stack">
          {/* Quick-Add Bar */}
          <form
            className="shopping-quick-bar"
            onSubmit={handleQuickAddShopping}
          >
            <div className="mt-input-row">
              <input
                ref={quickInputRef}
                type="text"
                className="mt-input"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Что купить…"
                aria-label="Название продукта или товара"
                autoComplete="off"
                style={{ flex: "1 1 150px" }}
              />
              <input
                type="text"
                className="mt-input"
                value={quickQty}
                onChange={(e) => setQuickQty(e.target.value)}
                placeholder="Кол-во"
                aria-label="Количество (необязательно)"
                autoComplete="off"
                style={{ flex: "0 0 84px", width: "84px", paddingInline: "10px" }}
              />
              <button
                type="submit"
                className="mt-btn mt-btn--primary"
                disabled={!quickName.trim() || addingItem}
                aria-label="Добавить в покупки"
                style={{ paddingInline: "12px", minWidth: "46px" }}
              >
                <Plus size={19} />
              </button>
            </div>

            <div
              className="mt-chip-row"
              role="group"
              aria-label="Категория покупки"
            >
              {SHOPPING_CATEGORIES.map((cat) => (
                <Pill
                  key={cat.key}
                  tone="neutral"
                  active={quickCategory === cat.key}
                  onClick={() => setQuickCategory(cat.key)}
                >
                  {cat.label}
                </Pill>
              ))}
            </div>
          </form>

          {/* Categorized Active List */}
          {shoppingLoading ? (
            <div className="mt-card mt-card--compact">
              <p className="mt-card-sub">Загружаем список покупок...</p>
            </div>
          ) : activeShoppingGroups.length === 0 && boughtItems.length === 0 ? (
            <EmptyState
              icon={<ShoppingBasket size={22} />}
              title="Список покупок пуст"
              description="Введите продукт выше и выберите категорию."
            />
          ) : (
            <div className="mt-stack">
              {activeShoppingGroups.map((group) => (
                <div key={group.category} className="mt-stack mt-stack--xs">
                  <GroupHeader
                    title={group.category}
                    meta={String(group.items.length)}
                  />
                  <GroupList>
                    {group.items.map((item) => (
                      <ListRow
                        key={item.id}
                        checked={false}
                        onToggle={() => handleToggleShopping(item)}
                        strikethrough={true}
                        accent="cobalt"
                        title={item.name}
                        trailing={
                          <span className="mt-row" style={{ gap: "4px" }}>
                            {item.quantity ? (
                              <span
                                className="muted tabular"
                                style={{ fontSize: "13px", whiteSpace: "nowrap" }}
                              >
                                {item.quantity}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="mt-icon-btn"
                              aria-label={`Удалить «${item.name}»`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteShopping(item);
                              }}
                            >
                              <X size={15} />
                            </button>
                          </span>
                        }
                      />
                    ))}
                  </GroupList>
                </div>
              ))}

              {/* Collapsible «Куплено (N)» Footer */}
              {boughtItems.length > 0 && (
                <div className="mt-stack mt-stack--sm">
                  <div className="mt-row mt-row--between" style={{ gap: "8px" }}>
                    <button
                      type="button"
                      className="mt-disclosure-btn"
                      aria-expanded={boughtExpanded}
                      onClick={() => setBoughtExpanded((prev) => !prev)}
                      style={{ flex: "1 1 auto" }}
                    >
                      <span className="tabular">
                        Куплено ({boughtItems.length})
                      </span>
                      <ChevronDown size={17} className="mt-disclosure-chevron" />
                    </button>

                    <button
                      type="button"
                      className="mt-btn mt-btn--soft mt-btn--sm"
                      disabled={clearingBought}
                      aria-label="Очистить купленное"
                      onClick={handleClearBought}
                    >
                      <Trash2 size={15} />
                      <span>Очистить</span>
                    </button>
                  </div>

                  {boughtExpanded && (
                    <GroupList>
                      {boughtItems.map((item) => (
                        <ListRow
                          key={item.id}
                          checked={true}
                          onToggle={() => handleToggleShopping(item)}
                          strikethrough={true}
                          accent="cobalt"
                          title={item.name}
                          meta={item.category}
                          trailing={
                            <span className="mt-row" style={{ gap: "4px" }}>
                              {item.quantity ? (
                                <span
                                  className="muted tabular"
                                  style={{ fontSize: "13px", whiteSpace: "nowrap" }}
                                >
                                  {item.quantity}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="mt-icon-btn"
                                aria-label={`Удалить «${item.name}»`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteShopping(item);
                                }}
                              >
                                <X size={15} />
                              </button>
                            </span>
                          }
                        />
                      ))}
                    </GroupList>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
