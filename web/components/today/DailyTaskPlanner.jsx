import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckSquare,
  Clock,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { CheckRow, EmptyState, Pill } from "../UiPrimitives.jsx";
import { TASK_SECTION_MAP } from "../../data/presets.js";

const FILTER_OPTIONS = [
  { key: "all", label: "Все" },
  { key: "active", label: "Активные" },
  { key: "done", label: "Сделано" },
];

export default function DailyTaskPlanner({
  tasks = [],
  onAddTask,
  onEditTask,
  onToggleTask,
  onRescheduleTask,
  onDeleteTask,
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
    <section className="mt-card" aria-label="Планировщик задач на день">
      <div className="mt-card-head">
        <div>
          <h2 className="mt-card-title">Планировщик задач</h2>
          <p className="mt-card-sub tabular">
            {counts.all > 0
              ? `Сделано ${counts.done} из ${counts.all}`
              : "Спокойный план на день"}
          </p>
        </div>
        <button
          type="button"
          className="mt-btn mt-btn--soft mt-btn--sm"
          onClick={onAddTask}
        >
          <Plus size={16} />
          <span>Задача</span>
        </button>
      </div>

      <div className="mt-chip-row" role="tablist" aria-label="Фильтр задач">
        {FILTER_OPTIONS.map((opt) => (
          <Pill
            key={opt.key}
            tone="brand"
            active={filter === opt.key}
            onClick={() => setFilter(opt.key)}
          >
            {opt.label} · {counts[opt.key]}
          </Pill>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={22} />}
          title={
            filter === "done"
              ? "Пока нет выполненных задач"
              : filter === "active" && counts.all > 0
                ? "Все задачи на сегодня закрыты"
                : "Список задач пока пуст"
          }
          description={
            filter === "active" && counts.all > 0
              ? "Отличный ритм — можно выдохнуть или добавить новую задачу."
              : "Добавьте главные дела на день с временем и сферой."
          }
          action={
            filter !== "done" ? (
              <button
                type="button"
                className="mt-btn mt-btn--primary mt-btn--sm"
                onClick={onAddTask}
              >
                <Plus size={15} />
                <span>Добавить задачу</span>
              </button>
            ) : null
          }
        />
      ) : (
        <div className="mt-stack mt-stack--xs">
          {filteredTasks.map((task, idx) => {
            const sectionMeta =
              TASK_SECTION_MAP[task.section_tag] || TASK_SECTION_MAP.personal;
            const accent =
              sectionMeta.tone === "neutral" ? "brand" : sectionMeta.tone;
            const isBusy = busyTaskId === task.id;

            return (
              <div key={task.id} className="mt-stack mt-stack--xs">
                {idx > 0 ? <hr className="mt-divider" /> : null}
                <CheckRow
                  checked={Boolean(task.completed)}
                  onToggle={() => onToggleTask?.(task)}
                  title={task.title}
                  accent={accent}
                  strikethrough
                  disabled={isBusy}
                  subtitle={
                    <span className="today-task-meta">
                      <span
                        className={`today-priority-dot today-priority-dot--${task.priority || "medium"}`}
                        aria-hidden="true"
                      />
                      {task.time_slot ? (
                        <span className="mt-row" style={{ gap: 3 }}>
                          <Clock size={12} aria-hidden="true" />
                          <span className="tabular">{task.time_slot}</span>
                        </span>
                      ) : null}
                      <Pill tone={sectionMeta.tone}>{sectionMeta.label}</Pill>
                      {task.goal_title ? (
                        <Pill tone="goals" icon={<Target size={11} />}>
                          {task.goal_title.length > 22
                            ? `${task.goal_title.slice(0, 21)}…`
                            : task.goal_title}
                        </Pill>
                      ) : null}
                    </span>
                  }
                />
                <div
                  className="mt-row mt-row--between"
                  style={{ paddingLeft: 44 }}
                >
                  <div>
                    {!task.completed ? (
                      <button
                        type="button"
                        className="mt-pill mt-pill--neutral"
                        disabled={isBusy}
                        onClick={() => onRescheduleTask?.(task)}
                      >
                        <span>На завтра</span>
                        <ArrowRight size={13} />
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {task.completed_at
                          ? `Выполнено в ${task.completed_at}`
                          : "Выполнено"}
                      </span>
                    )}
                  </div>
                  <div className="mt-row" style={{ gap: 2 }}>
                    <button
                      type="button"
                      className="mt-icon-btn"
                      aria-label={`Редактировать задачу «${task.title}»`}
                      title="Редактировать"
                      disabled={isBusy}
                      onClick={() => onEditTask?.(task)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="mt-icon-btn mt-icon-btn--danger"
                      aria-label={`Удалить задачу «${task.title}»`}
                      title="Удалить"
                      disabled={isBusy}
                      onClick={() => onDeleteTask?.(task)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
