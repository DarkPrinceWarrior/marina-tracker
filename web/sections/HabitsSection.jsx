import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  DateStrip,
  PageHeader,
  SegmentedControl,
} from "../components/UiPrimitives.jsx";
import HabitsVitaminsTab from "../components/habits/HabitsVitaminsTab.jsx";
import WorkoutsTab from "../components/habits/WorkoutsTab.jsx";
import CycleTrackerTab from "../components/habits/CycleTrackerTab.jsx";
import { formatDateShortRu, todayISO } from "../utils/date.js";

function normalizeSubTab(raw) {
  if (raw === "workouts" || raw === "cycle" || raw === "habits") return raw;
  if (raw === "water" || raw === "vitamins") return "habits";
  return "habits";
}

export default function HabitsSection({
  selectedDate,
  todayDate,
  onSelectDate,
  navRequest = null,
  onConsumeNavRequest,
  notify,
  onDataChanged,
}) {
  const effectiveToday = todayDate || todayISO();
  const activeDate = selectedDate || effectiveToday;

  const [subTab, setSubTab] = useState(() =>
    normalizeSubTab(navRequest?.subTab),
  );
  const [habitsSummary, setHabitsSummary] = useState(null);
  const [workoutsTodayCount, setWorkoutsTodayCount] = useState(0);
  const [createHabitTrigger, setCreateHabitTrigger] = useState(0);

  useEffect(() => {
    if (!navRequest?.seq) return;
    if (navRequest.subTab) {
      setSubTab(normalizeSubTab(navRequest.subTab));
    }
    onConsumeNavRequest?.(navRequest.seq);
  }, [navRequest, onConsumeNavRequest]);

  return (
    <div className="mt-section" aria-label="Здоровье">
      <PageHeader
        title="Здоровье"
        subtitle={formatDateShortRu(activeDate)}
        action={
          subTab === "habits" ? (
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--sm"
              aria-label="Добавить привычку или витамин"
              onClick={() => setCreateHabitTrigger((n) => n + 1)}
            >
              <Plus size={15} />
              <span>Добавить</span>
            </button>
          ) : null
        }
      />

      <DateStrip
        selectedDate={activeDate}
        todayDate={effectiveToday}
        onSelectDate={onSelectDate}
      />

      <SegmentedControl
        value={subTab}
        onChange={setSubTab}
        options={[
          {
            value: "habits",
            label: "Привычки",
            count:
              habitsSummary && habitsSummary.total > 0
                ? habitsSummary.done
                : undefined,
          },
          {
            value: "workouts",
            label: "Тренировки",
            count: workoutsTodayCount > 0 ? workoutsTodayCount : undefined,
          },
          {
            value: "cycle",
            label: "Цикл",
          },
        ]}
      />

      {subTab === "habits" ? (
        <HabitsVitaminsTab
          selectedDate={activeDate}
          todayDate={effectiveToday}
          notify={notify}
          onDataChanged={onDataChanged}
          onSummaryChange={setHabitsSummary}
          createTrigger={createHabitTrigger}
          onConsumeCreateTrigger={() => setCreateHabitTrigger(0)}
        />
      ) : null}

      {subTab === "workouts" ? (
        <WorkoutsTab
          selectedDate={activeDate}
          todayDate={effectiveToday}
          notify={notify}
          onDataChanged={onDataChanged}
          onTodayCountChange={setWorkoutsTodayCount}
        />
      ) : null}

      {subTab === "cycle" ? (
        <CycleTrackerTab
          selectedDate={activeDate}
          todayDate={effectiveToday}
          notify={notify}
          onDataChanged={onDataChanged}
        />
      ) : null}
    </div>
  );
}
