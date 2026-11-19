import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  EmptyState,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
} from "./UiPrimitives.jsx";

export default function ShoppingPanel({
  listType = "groceries",
  categories = [],
  placeholder = "Что купить…",
  emptyTitle = "Список покупок пуст",
  emptyDescription = "Добавьте первую позицию в строке выше.",
  notify,
  onDataChanged,
  onCountChange,
}) {
  const defaultCategory = categories[0]?.key || "Прочее";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const [submitting, setSubmitting] = useState(false);
  const [boughtOpen, setBoughtOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setSelectedCategory(defaultCategory);
  }, [defaultCategory]);

  const loadShopping = useCallback(async () => {
    try {
      const data = await api.getShopping(listType);
      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      const remaining = list.filter((it) => !it.bought).length;
      onCountChange?.(remaining);
    } catch (err) {
      notify?.(err?.message || "Не удалось загрузить список покупок.", "error");
    } finally {
      setLoading(false);
    }
  }, [listType, notify, onCountChange]);

  useEffect(() => {
    setLoading(true);
    loadShopping();
  }, [loadShopping]);

  const activeItems = useMemo(
    () => items.filter((item) => !item.bought),
    [items]
  );
  const boughtItems = useMemo(
    () => items.filter((item) => item.bought),
    [items]
  );

  useEffect(() => {
    onCountChange?.(activeItems.length);
  }, [activeItems.length, onCountChange]);

  const groupedActive = useMemo(() => {
    const order = categories.map((c) => c.key);
    const map = new Map();
    activeItems.forEach((item) => {
      const cat = item.category || defaultCategory;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(item);
    });
    const keys = Array.from(map.keys()).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, "ru");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys.map((key) => ({ category: key, items: map.get(key) }));
  }, [activeItems, categories, defaultCategory]);

  const handleAdd = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const created = await api.createShoppingItem({
        name: trimmed,
        quantity: quantity.trim(),
        category: selectedCategory,
        list_type: listType,
      });
      setItems((prev) => [created, ...prev]);
      setName("");
      setQuantity("");
      notify?.(`Добавлено: ${trimmed}`);
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось добавить покупку.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBought = async (item) => {
    const nextBought = !item.bought;
    try {
      await withOptimistic({
        apply: () => {
          const snapshot = items;
          setItems((prev) =>
            prev.map((row) =>
              row.id === item.id ? { ...row, bought: nextBought } : row
            )
          );
          return snapshot;
        },
        commit: async () => {
          const updated = await api.updateShoppingItem(item.id, {
            bought: nextBought,
          });
          setItems((prev) =>
            prev.map((row) => (row.id === item.id ? updated : row))
          );
          onDataChanged?.();
        },
        rollback: (snapshot) => setItems(snapshot),
        onError: (err) =>
          notify?.(err?.message || "Не удалось обновить статус.", "error"),
      });
    } catch {
      // handled in onError
    }
  };

  const handleDelete = async (item) => {
    try {
      await withOptimistic({
        apply: () => {
          const snapshot = items;
          setItems((prev) => prev.filter((row) => row.id !== item.id));
          return snapshot;
        },
        commit: async () => {
          await api.deleteShoppingItem(item.id);
          notify?.("Позиция удалена", "info");
          onDataChanged?.();
        },
        rollback: (snapshot) => setItems(snapshot),
        onError: (err) =>
          notify?.(err?.message || "Не удалось удалить позицию.", "error"),
      });
    } catch {
      // handled in onError
    }
  };

  const handleClearBought = async () => {
    if (!boughtItems.length || clearing) return;
    setClearing(true);
    try {
      await api.clearBoughtShopping(listType);
      setItems((prev) => prev.filter((item) => !item.bought));
      setBoughtOpen(false);
      notify?.("Купленные позиции очищены");
      onDataChanged?.();
    } catch (err) {
      notify?.(err?.message || "Не удалось очистить купленное.", "error");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mt-stack">
      <form className="mt-card mt-card--compact" onSubmit={handleAdd}>
        <div className="mt-input-row">
          <input
            type="text"
            className="mt-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            maxLength={140}
          />
          <input
            type="text"
            className="mt-input"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Кол-во"
            aria-label="Количество"
            maxLength={40}
            style={{ flex: "0 0 84px", width: 84, minWidth: 84, paddingInline: 10 }}
          />
          <button
            type="submit"
            className="mt-btn mt-btn--primary"
            disabled={!name.trim() || submitting}
            aria-label="Добавить в покупки"
            style={{ width: 44, minWidth: 44, padding: 0 }}
          >
            <Plus size={19} />
          </button>
        </div>

        {categories.length > 0 ? (
          <div className="mt-chip-row" role="group" aria-label="Категория покупки">
            {categories.map((cat) => (
              <Pill
                key={cat.key}
                tone="neutral"
                active={selectedCategory === cat.key}
                onClick={() => setSelectedCategory(cat.key)}
              >
                {cat.label}
              </Pill>
            ))}
          </div>
        ) : null}
      </form>

      <div className="mt-row mt-row--between" style={{ padding: "0 2px" }}>
        <span className="muted tabular" style={{ fontSize: "13px", fontWeight: 500 }}>
          Осталось: {activeItems.length}
        </span>
        {boughtItems.length > 0 ? (
          <button
            type="button"
            className="mt-btn mt-btn--ghost mt-btn--sm"
            onClick={handleClearBought}
            disabled={clearing}
          >
            <Trash2 size={14} />
            <span>Очистить купленное</span>
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-card">
          <div className="mt-skeleton" style={{ height: 22, width: "55%" }} />
          <div className="mt-skeleton" style={{ height: 22, width: "80%" }} />
        </div>
      ) : groupedActive.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={22} />}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="mt-stack">
          {groupedActive.map((group) => (
            <div key={group.category} className="mt-group-block">
              <GroupHeader
                title={group.category}
                meta={String(group.items.length)}
              />
              <GroupList>
                {group.items.map((item) => (
                  <ListRow
                    key={item.id}
                    checked={false}
                    onToggle={() => handleToggleBought(item)}
                    title={item.name}
                    strikethrough
                    trailing={
                      <div className="mt-row" style={{ gap: 4 }}>
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
                          aria-label={`Удалить ${item.name}`}
                          onClick={() => handleDelete(item)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    }
                  />
                ))}
              </GroupList>
            </div>
          ))}
        </div>
      )}

      {boughtItems.length > 0 ? (
        <div className="mt-group-block">
          <button
            type="button"
            className="mt-disclosure-btn"
            aria-expanded={boughtOpen}
            onClick={() => setBoughtOpen((prev) => !prev)}
          >
            <span>Куплено ({boughtItems.length})</span>
            <ChevronDown size={16} className="mt-disclosure-chevron" />
          </button>

          {boughtOpen ? (
            <GroupList>
              {boughtItems.map((item) => (
                <ListRow
                  key={item.id}
                  checked
                  onToggle={() => handleToggleBought(item)}
                  title={item.name}
                  meta={item.category}
                  strikethrough
                  trailing={
                    <div className="mt-row" style={{ gap: 4 }}>
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
                        aria-label={`Удалить ${item.name}`}
                        onClick={() => handleDelete(item)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  }
                />
              ))}
            </GroupList>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
