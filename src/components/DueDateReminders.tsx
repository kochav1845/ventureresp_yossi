import { Bell, Mail, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  DueDateReminderPlan,
  OFFSET_PRESETS,
  offsetLabel,
  reminderDateFor,
} from '../lib/dueDateReminders';

/**
 * The companion to a due-date field: "remind me before this is due".
 *
 * Sits under any due-date input. Each lead time picked becomes a row in the
 * Reminders section when the parent form saves — see lib/dueDateReminders.ts.
 */
export default function DueDateReminders({
  dueDate,
  plan,
  onChange,
  label = 'Remind me before the due date',
}: {
  dueDate: string;
  plan: DueDateReminderPlan;
  onChange: (plan: DueDateReminderPlan) => void;
  label?: string;
}) {
  const [customDays, setCustomDays] = useState('');

  const set = (patch: Partial<DueDateReminderPlan>) => onChange({ ...plan, ...patch });

  const toggleOffset = (days: number) => {
    const has = plan.offsets.includes(days);
    const next = has ? plan.offsets.filter(d => d !== days) : [...plan.offsets, days];
    set({ offsets: next });
  };

  const addCustom = () => {
    const n = parseInt(customDays, 10);
    if (!Number.isFinite(n) || n < 0 || n > 365) return;
    if (!plan.offsets.includes(n)) set({ offsets: [...plan.offsets, n] });
    setCustomDays('');
  };

  const now = Date.now();
  const scheduled = dueDate
    ? [...new Set(plan.offsets)]
        .sort((a, b) => b - a)
        .map(d => ({ days: d, at: reminderDateFor(dueDate, d, plan.timeOfDay) }))
    : [];
  const pastCount = scheduled.filter(s => s.at.getTime() <= now).length;
  const futureCount = scheduled.length - pastCount;

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50">
      <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
        <input
          type="checkbox"
          checked={plan.enabled}
          disabled={!dueDate}
          onChange={e => set({ enabled: e.target.checked })}
          className="mt-0.5 h-4 w-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 disabled:opacity-40"
        />
        <span className="min-w-0">
          <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-violet-600" />
            {label}
          </span>
          <span className="block text-xs text-gray-500">
            {dueDate
              ? 'Added to your Reminders automatically — no need to create them by hand.'
              : 'Set a due date first.'}
          </span>
        </span>
      </label>

      {plan.enabled && dueDate && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-gray-200 pt-2.5">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">When</p>
            <div className="flex flex-wrap gap-1.5">
              {OFFSET_PRESETS.map(d => {
                const on = plan.offsets.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleOffset(d)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      on
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-violet-50'
                    }`}
                  >
                    {offsetLabel(d)}
                  </button>
                );
              })}
              {/* Any lead time beyond the presets. */}
              {plan.offsets
                .filter(d => !OFFSET_PRESETS.includes(d))
                .sort((a, b) => b - a)
                .map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleOffset(d)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border bg-violet-600 border-violet-600 text-white"
                  >
                    {offsetLabel(d)}
                  </button>
                ))}
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={customDays}
                  onChange={e => setCustomDays(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                  placeholder="other"
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-violet-500"
                />
                <button type="button" onClick={addCustom} title="Add this lead time"
                  className="p-1 text-violet-700 border border-violet-300 bg-white rounded hover:bg-violet-50">
                  <Plus className="w-3 h-3" />
                </button>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={plan.sendEmail}
                onChange={e => set({ sendEmail: e.target.checked })}
                className="h-3.5 w-3.5 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
              />
              <Mail className="w-3.5 h-3.5 text-gray-500" />
              Also email me
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              Time
              <input
                type="time"
                value={plan.timeOfDay}
                onChange={e => set({ timeOfDay: e.target.value })}
                className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-violet-500"
              />
            </label>
          </div>

          {scheduled.length === 0 ? (
            <p className="text-xs text-amber-700">Pick at least one lead time.</p>
          ) : (
            <div className="text-xs text-gray-600">
              <p>
                {futureCount > 0 ? (
                  <>
                    <span className="font-medium text-gray-800">{futureCount}</span> reminder
                    {futureCount === 1 ? '' : 's'} will be created
                    {plan.sendEmail ? ' (in-app + email)' : ' (in-app only)'}:
                  </>
                ) : (
                  <span className="text-amber-700">
                    Every lead time you picked is already in the past, so nothing will be scheduled.
                  </span>
                )}
              </p>
              {futureCount > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {scheduled
                    .filter(s => s.at.getTime() > now)
                    .map(s => (
                      <li key={s.days} className="font-mono text-[11px] text-gray-500">
                        {s.at.toLocaleString(undefined, {
                          weekday: 'short', month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                        <span className="text-gray-400"> · {offsetLabel(s.days)}</span>
                      </li>
                    ))}
                </ul>
              )}
              {pastCount > 0 && futureCount > 0 && (
                <p className="mt-1 text-amber-700">
                  {pastCount} of them would already have passed and will be skipped.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
