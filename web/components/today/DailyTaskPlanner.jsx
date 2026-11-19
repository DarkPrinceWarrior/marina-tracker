import React, { useMemo, useState } from "react";
import { CheckSquare, Plus } from "lucide-react";
import {
  EmptyState,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
} from "../UiPrimitives.jsx";
import { TASK_SECTION_MAP } from "../../data/presets.js";

const FILTER_OPTIONS = [
  { key: "all", label: "Все" },
  { key: "active", label: "Активные" },
  { key: "done", label: "Готово" },
];

export default function DailyTaskPlanner({
  tasks = [],
  onAddTask,
  onEditTask,
  onToggleTask,
  busyTaskId = null,
}) {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(() => {
    const done = tasks.filter((t) => t.completed).length;
    return {
      all: tasks.length,
      active: tasks.length - done,
      done,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === "active") return tasks.filter((t) => !t.completed);
    if (filter === "done") return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  return (
    <section className="mt-group-block" aria-label="Задачи на день">
      <GroupHeader
        title="Задачи"
        meta={counts.all > 0 ? `${counts.done}/${counts.all}` : ""}
        action={
          <button
            type="button"
            className="mt-btn mt-btn--ghost mt-btn--sm"
            aria-label="Добавить задачу"
            onClick={onAddTask}
          >
            <Plus size={16} />
            <span>Задача</span>
          </button>
        }
      />

      <div className="mt-chip-row" role="tablist" aria-label="Фильтр задач">
        {FILTER_OPTIONS.map((opt) => (
          <Pill
            key={opt.key}
            tone="neutral"
            active={filter === opt.key}
            onClick={() => setFilter(opt.key)}
          >
            {opt.label}
            {counts[opt.key] > 0 ? ` · ${counts[opt.key]}` : ""}
          </Pill>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <GroupList>
          <EmptyState
            icon={<CheckSquare size={20} />}
            title={
              filter === "done"
                ? "Пока нет выполненных задач"
                : filter === "active" && counts.all > 0
                  ? "Все задачи выполнены"
                  : "Задач пока нет"
            }
            description={
              filter === "active" && counts.all > 0
                ? "Можно выдохнуть или добавить новую задачу."
                : "Добавьте главные дела на этот день."
            }
            action={
              filter !== "done" ? (
                <button
                  type="button"
                  className="mt-btn mt-btn--primary mt-btn--sm"
                  onClick={onAddTask}
                >
                  <Plus size={15} />
                  <span>Новая задача</span>
                </button>
              ) : null
            }
          />
        </GroupList>
      ) : (
        <GroupList>
          {filteredTasks.map((task) => {
            const sectionLabel =
              TASK_SECTION_MAP[task.section_tag]?.label || "Личное";
            const metaParts = [
              task.time_slot || "",
              sectionLabel,
              task.goal_title || "",
            ].filter(Boolean);
            const isHigh = task.priority === "high" && !task.completed;

            return (
              <ListRow
                key={task.id}
                checked={Boolean(task.completed)}
                onToggle={() => onToggleTask?.(task)}
                onClick={() => onEditTask?.(task)}
                title={task.title}
                meta={metaParts.join(" · ")}
                strikethrough
                disabled={busyTaskId === task.id}
                trailing={
                  isHigh ? (
                    <span
                      className="today-priority-dot today-priority-dot--high"
                      aria-label="Важная задача"
                    />
                  ) : null
                }
              />
            );
          })}
        </GroupList>
      )}
    </section>
  );
}
