import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useOrgNavigation } from '../../hooks/useOrgNavigation';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Bell,
  StickyNote,
  X,
  Save,
  Plus,
  Clock,
  AlertCircle,
  Mail,
  FileText,
  Users,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addYears,
  subYears,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  parseISO
} from 'date-fns';

type CalendarView = 'monthly' | 'daily' | 'yearly';

interface PromiseEvent {
  ticket_id: string;
  ticket_number: string;
  customer_name: string;
  promise_date: string;
  total_balance: number;
  ticket_status: string;
}

interface ReminderEvent {
  id: string;
  reminder_date: string;
  reminder_message: string;
  invoice_reference?: string;
  ticket_number?: string;
  customer_name?: string;
  is_triggered: boolean;
}

interface DayNote {
  id: string;
  note_date: string;
  content: string;
}

interface EmailScheduleEvent {
  assignment_id: string;
  customer_name: string;
  customer_email: string;
  formula_name: string;
  ticket_number: string | null;
  ticket_id: string | null;
  time: string;
}

interface DayData {
  promises: PromiseEvent[];
  reminders: ReminderEvent[];
  emails: EmailScheduleEvent[];
  note?: DayNote;
}

export default function CollectorCalendar() {
  const { user } = useAuth();
  const { navigate: orgNavigate } = useOrgNavigation();
  const [view, setView] = useState<CalendarView>('monthly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayData, setDayData] = useState<Map<string, DayData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const loadCalendarData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      let rangeStart: Date;
      let rangeEnd: Date;

      if (view === 'yearly') {
        rangeStart = startOfYear(currentDate);
        rangeEnd = endOfYear(currentDate);
      } else {
        rangeStart = startOfWeek(startOfMonth(currentDate));
        rangeEnd = endOfWeek(endOfMonth(currentDate));
      }

      const startStr = format(rangeStart, 'yyyy-MM-dd');
      const endStr = format(rangeEnd, 'yyyy-MM-dd');

      const { data: result, error } = await supabase.rpc('get_collector_calendar_data', {
        p_user_id: user.id,
        p_start_date: startStr,
        p_end_date: endStr
      });

      if (error) throw error;

      const map = new Map<string, DayData>();
      const ensureDay = (key: string) => {
        if (!map.has(key)) map.set(key, { promises: [], reminders: [], emails: [] });
      };

      const promises: any[] = result?.promises || [];
      const reminders: any[] = result?.reminders || [];
      const notes: any[] = result?.notes || [];
      const emailSchedules: any[] = result?.email_schedules || [];

      for (const ticket of promises) {
        const dateKey = ticket.promise_date.split('T')[0];
        ensureDay(dateKey);
        map.get(dateKey)!.promises.push({
          ticket_id: ticket.ticket_id,
          ticket_number: ticket.ticket_number,
          customer_name: ticket.customer_name,
          promise_date: ticket.promise_date,
          total_balance: parseFloat(ticket.total_balance) || 0,
          ticket_status: ticket.ticket_status
        });
      }

      for (const reminder of reminders) {
        const dateKey = reminder.reminder_date.split('T')[0];
        ensureDay(dateKey);
        map.get(dateKey)!.reminders.push({
          id: reminder.id,
          reminder_date: reminder.reminder_date,
          reminder_message: reminder.reminder_message || '',
          is_triggered: reminder.is_triggered
        });
      }

      for (const note of notes) {
        const dateKey = note.note_date;
        ensureDay(dateKey);
        map.get(dateKey)!.note = note;
      }

      // Compute email schedule dates from formulas
      for (const sched of emailSchedules) {
        if (!sched.formula_schedule || !Array.isArray(sched.formula_schedule)) continue;
        const scheduleDays: Array<{ day: number; times: string[] }> = sched.formula_schedule;

        // For each day in the visible range, check if it matches a formula day
        const rangeStartDate = rangeStart;
        const rangeEndDate = rangeEnd;
        const days = eachDayOfInterval({ start: rangeStartDate, end: rangeEndDate });

        for (const d of days) {
          const dayOfMonth = d.getDate();
          const matchingSchedule = scheduleDays.find(s => s.day === dayOfMonth);
          if (matchingSchedule) {
            const dateKey = format(d, 'yyyy-MM-dd');
            ensureDay(dateKey);
            for (const time of matchingSchedule.times) {
              map.get(dateKey)!.emails.push({
                assignment_id: sched.assignment_id,
                customer_name: sched.customer_name,
                customer_email: sched.customer_email,
                formula_name: sched.formula_name,
                ticket_number: sched.ticket_number,
                ticket_id: sched.ticket_id,
                time
              });
            }
          }
        }
      }

      setDayData(map);
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, currentDate, view]);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  const handleSaveNote = async () => {
    if (!user || !selectedDate) return;
    setSavingNote(true);

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const existing = dayData.get(dateStr)?.note;

      if (noteText.trim() === '' && existing) {
        await supabase
          .from('collector_calendar_notes')
          .delete()
          .eq('id', existing.id);
      } else if (noteText.trim()) {
        if (existing) {
          await supabase
            .from('collector_calendar_notes')
            .update({ content: noteText, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('collector_calendar_notes')
            .insert({
              user_id: user.id,
              note_date: dateStr,
              content: noteText
            });
        }
      }

      setEditingNote(false);
      await loadCalendarData();
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    const dateStr = format(date, 'yyyy-MM-dd');
    const note = dayData.get(dateStr)?.note;
    setNoteText(note?.content || '');
    setEditingNote(false);
  };

  const navigatePrev = () => {
    if (view === 'yearly') setCurrentDate(subYears(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const navigateNext = () => {
    if (view === 'yearly') setCurrentDate(addYears(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const note = dayData.get(dateStr)?.note;
    setNoteText(note?.content || '');
  };

  if (collapsed) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 p-4">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
        >
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <span>Show Calendar</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Calendar</h2>
          <button
            onClick={() => setCollapsed(true)}
            className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Collapse calendar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['daily', 'monthly', 'yearly'] as CalendarView[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  view === v
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 ml-3">
            <button
              onClick={navigatePrev}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              Today
            </button>
            <button
              onClick={navigateNext}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="ml-3 text-sm font-medium text-gray-700">
            {view === 'yearly'
              ? format(currentDate, 'yyyy')
              : format(currentDate, 'MMMM yyyy')}
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Calendar Grid */}
        <div className="flex-1 p-4">
          {view === 'monthly' && <MonthlyView
            currentDate={currentDate}
            selectedDate={selectedDate}
            dayData={dayData}
            onDateClick={handleDateClick}
          />}
          {view === 'daily' && <DailyView
            currentDate={currentDate}
            selectedDate={selectedDate}
            dayData={dayData}
            onDateClick={handleDateClick}
          />}
          {view === 'yearly' && <YearlyView
            currentDate={currentDate}
            dayData={dayData}
            onMonthClick={(month) => {
              setCurrentDate(month);
              setView('monthly');
            }}
          />}
        </div>

        {/* Day Detail Panel */}
        {selectedDate && view !== 'yearly' && (
          <DayDetailPanel
            date={selectedDate}
            dayData={dayData.get(format(selectedDate, 'yyyy-MM-dd'))}
            noteText={noteText}
            editingNote={editingNote}
            savingNote={savingNote}
            onNoteChange={setNoteText}
            onEditNote={() => setEditingNote(true)}
            onSaveNote={handleSaveNote}
            onCancelEdit={() => {
              setEditingNote(false);
              const dateStr = format(selectedDate, 'yyyy-MM-dd');
              setNoteText(dayData.get(dateStr)?.note?.content || '');
            }}
            onClose={() => setSelectedDate(null)}
            onNavigate={orgNavigate}
          />
        )}
      </div>

      {/* Date Analytics Panel */}
      {selectedDate && view !== 'yearly' && (
        <DateAnalyticsPanel date={selectedDate} />
      )}

      {loading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      )}
    </div>
  );
}

function MonthlyView({
  currentDate,
  selectedDate,
  dayData,
  onDateClick
}: {
  currentDate: Date;
  selectedDate: Date | null;
  dayData: Map<string, DayData>;
  onDateClick: (date: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      <div className="grid grid-cols-7 gap-px mb-1">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const data = dayData.get(dateStr);
          const inMonth = isSameMonth(day, currentDate);
          const selected = selectedDate && isSameDay(day, selectedDate);
          const today = isToday(day);
          const hasPromises = (data?.promises.length || 0) > 0;
          const hasReminders = (data?.reminders.length || 0) > 0;
          const hasEmails = (data?.emails?.length || 0) > 0;
          const hasNote = !!data?.note;
          const totalPromise = data?.promises.reduce((s, p) => s + p.total_balance, 0) || 0;

          return (
            <button
              key={dateStr}
              onClick={() => onDateClick(day)}
              className={`
                relative min-h-[80px] p-1.5 text-left transition-all
                ${inMonth ? 'bg-white' : 'bg-gray-50'}
                ${selected ? 'ring-2 ring-blue-500 ring-inset z-10' : ''}
                ${today ? 'bg-blue-50/50' : ''}
                hover:bg-blue-50/70
              `}
            >
              <span className={`
                text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full
                ${today ? 'bg-blue-600 text-white' : inMonth ? 'text-gray-900' : 'text-gray-400'}
              `}>
                {format(day, 'd')}
              </span>

              <div className="mt-0.5 space-y-0.5">
                {hasPromises && (
                  <div className="flex items-center gap-0.5 px-1 py-0.5 bg-emerald-50 rounded text-[10px] text-emerald-700 font-medium truncate">
                    <DollarSign className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">
                      {totalPromise >= 1000
                        ? `${(totalPromise / 1000).toFixed(1)}k`
                        : totalPromise.toFixed(0)}
                    </span>
                  </div>
                )}
                {hasReminders && (
                  <div className="flex items-center gap-0.5 px-1 py-0.5 bg-amber-50 rounded text-[10px] text-amber-700 font-medium">
                    <Bell className="w-2.5 h-2.5 flex-shrink-0" />
                    <span>{data!.reminders.length}</span>
                  </div>
                )}
                {hasEmails && (
                  <div className="flex items-center gap-0.5 px-1 py-0.5 bg-sky-50 rounded text-[10px] text-sky-700 font-medium">
                    <Mail className="w-2.5 h-2.5 flex-shrink-0" />
                    <span>{data!.emails.length}</span>
                  </div>
                )}
                {hasNote && (
                  <div className="flex items-center gap-0.5 px-1 py-0.5 bg-blue-50 rounded text-[10px] text-blue-700">
                    <StickyNote className="w-2.5 h-2.5 flex-shrink-0" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DailyView({
  currentDate,
  selectedDate,
  dayData,
  onDateClick
}: {
  currentDate: Date;
  selectedDate: Date | null;
  dayData: Map<string, DayData>;
  onDateClick: (date: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2">
      {days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const data = dayData.get(dateStr);
        const selected = selectedDate && isSameDay(day, selectedDate);
        const today = isToday(day);
        const hasPromises = (data?.promises.length || 0) > 0;
        const hasReminders = (data?.reminders.length || 0) > 0;
        const hasNote = !!data?.note;
        const hasAnyEvent = hasPromises || hasReminders || hasNote;

        return (
          <button
            key={dateStr}
            onClick={() => onDateClick(day)}
            className={`
              w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all
              ${selected ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'}
              ${today ? 'border-l-3 border-l-blue-500' : ''}
            `}
          >
            <div className={`
              text-center min-w-[44px]
              ${today ? 'text-blue-600' : 'text-gray-600'}
            `}>
              <div className="text-[10px] font-medium uppercase">
                {format(day, 'EEE')}
              </div>
              <div className={`
                text-lg font-bold leading-tight
                ${today ? 'bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}
              `}>
                {format(day, 'd')}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {hasAnyEvent ? (
                <div className="flex flex-wrap gap-1.5">
                  {hasPromises && data!.promises.map((p, i) => (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">
                      <DollarSign className="w-3 h-3" />
                      <span className="font-medium">{p.customer_name}</span>
                      <span className="text-emerald-600">
                        ${p.total_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
                  {hasReminders && data!.reminders.map((r, i) => (
                    <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${
                      r.is_triggered ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <Bell className="w-3 h-3" />
                      <span className="truncate max-w-[150px]">{r.reminder_message}</span>
                    </div>
                  ))}
                  {hasNote && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700">
                      <StickyNote className="w-3 h-3" />
                      <span className="truncate max-w-[150px]">{data!.note!.content}</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-400">No events</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function YearlyView({
  currentDate,
  dayData,
  onMonthClick
}: {
  currentDate: Date;
  dayData: Map<string, DayData>;
  onMonthClick: (month: Date) => void;
}) {
  const yearStart = startOfYear(currentDate);
  const yearEnd = endOfYear(currentDate);
  const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {months.map(month => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

        let totalPromises = 0;
        let totalReminders = 0;
        let promiseAmount = 0;

        for (const day of daysInMonth) {
          const dateStr = format(day, 'yyyy-MM-dd');
          const data = dayData.get(dateStr);
          if (data) {
            totalPromises += data.promises.length;
            totalReminders += data.reminders.length;
            promiseAmount += data.promises.reduce((s, p) => s + p.total_balance, 0);
          }
        }

        const hasEvents = totalPromises > 0 || totalReminders > 0;
        const isCurrent = isSameMonth(month, new Date());

        return (
          <button
            key={format(month, 'yyyy-MM')}
            onClick={() => onMonthClick(month)}
            className={`
              p-3 rounded-lg border text-left transition-all hover:shadow-md
              ${isCurrent ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}
            `}
          >
            <div className={`text-sm font-semibold mb-1 ${isCurrent ? 'text-blue-700' : 'text-gray-900'}`}>
              {format(month, 'MMMM')}
            </div>
            {hasEvents ? (
              <div className="space-y-1">
                {totalPromises > 0 && (
                  <div className="text-[10px] text-emerald-700 flex items-center gap-1">
                    <DollarSign className="w-2.5 h-2.5" />
                    {totalPromises} promise{totalPromises > 1 ? 's' : ''} (${(promiseAmount / 1000).toFixed(1)}k)
                  </div>
                )}
                {totalReminders > 0 && (
                  <div className="text-[10px] text-amber-700 flex items-center gap-1">
                    <Bell className="w-2.5 h-2.5" />
                    {totalReminders} reminder{totalReminders > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-gray-400">No events</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayDetailPanel({
  date,
  dayData,
  noteText,
  editingNote,
  savingNote,
  onNoteChange,
  onEditNote,
  onSaveNote,
  onCancelEdit,
  onClose,
  onNavigate
}: {
  date: Date;
  dayData?: DayData;
  noteText: string;
  editingNote: boolean;
  savingNote: boolean;
  onNoteChange: (text: string) => void;
  onEditNote: () => void;
  onSaveNote: () => void;
  onCancelEdit: () => void;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const promises = dayData?.promises || [];
  const reminders = dayData?.reminders || [];
  const totalPromiseAmount = promises.reduce((s, p) => s + p.total_balance, 0);
  const isPast = date < new Date() && !isToday(date);

  return (
    <div className="w-80 border-l border-gray-200 bg-gray-50/50 p-4 overflow-y-auto max-h-[480px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {format(date, 'EEEE')}
          </div>
          <div className="text-xs text-gray-500">
            {format(date, 'MMMM d, yyyy')}
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Promises */}
      {promises.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
              Promises ({promises.length})
            </span>
            <span className="ml-auto text-xs font-bold text-emerald-700">
              ${totalPromiseAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="space-y-1.5">
            {promises.map((p, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-lg border text-xs ${
                  p.ticket_status === 'closed'
                    ? 'bg-gray-50 border-gray-200 text-gray-500'
                    : isPast
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.customer_name}</span>
                  <span className="font-bold">${p.total_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5 text-[10px] opacity-75">
                  <span>Ticket #{p.ticket_number}</span>
                  {isPast && p.ticket_status !== 'closed' && (
                    <span className="flex items-center gap-0.5 text-red-600 font-medium">
                      <AlertCircle className="w-2.5 h-2.5" />
                      Overdue
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reminders */}
      {reminders.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
              Reminders ({reminders.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {reminders.map((r, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-lg border text-xs ${
                  r.is_triggered
                    ? 'bg-gray-50 border-gray-200 text-gray-500 line-through'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span>{r.reminder_message}</span>
                </div>
                {r.reminder_date.includes('T') && (
                  <div className="text-[10px] mt-0.5 opacity-75 ml-4.5">
                    {format(parseISO(r.reminder_date), 'h:mm a')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduled Emails */}
      {(dayData?.emails?.length || 0) > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Mail className="w-3.5 h-3.5 text-sky-600" />
            <span className="text-xs font-semibold text-sky-800 uppercase tracking-wide">
              Scheduled Emails ({dayData!.emails.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {dayData!.emails.map((email, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-lg border bg-sky-50 border-sky-200 text-xs text-sky-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{email.customer_name}</span>
                  <span className="text-[10px] text-sky-600">{email.time.slice(0, 5)}</span>
                </div>
                <div className="text-[10px] mt-0.5 opacity-75">
                  Formula: {email.formula_name}
                  {email.ticket_number && <span> | Ticket #{email.ticket_number}</span>}
                </div>
                <button
                  onClick={() => onNavigate('/assignments')}
                  className="inline-flex items-center gap-1 mt-1 text-[10px] text-sky-600 hover:text-sky-800 font-medium underline"
                >
                  Manage assignment
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <StickyNote className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Note</span>
          {!editingNote && (
            <button
              onClick={onEditNote}
              className="ml-auto text-blue-600 hover:text-blue-800 transition-colors"
              title={dayData?.note ? 'Edit note' : 'Add note'}
            >
              {dayData?.note ? (
                <StickyNote className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {editingNote ? (
          <div className="space-y-2">
            <textarea
              value={noteText}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Add a note for this day..."
              className="w-full px-3 py-2 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"
              rows={4}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={onSaveNote}
                disabled={savingNote}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3 h-3" />
                {savingNote ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onCancelEdit}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : dayData?.note ? (
          <div
            onClick={onEditNote}
            className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 cursor-pointer hover:bg-blue-100 transition-colors whitespace-pre-wrap"
          >
            {dayData.note.content}
          </div>
        ) : (
          <button
            onClick={onEditNote}
            className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-center"
          >
            Click to add a note
          </button>
        )}
      </div>

      {/* Empty state */}
      {promises.length === 0 && reminders.length === 0 && (dayData?.emails?.length || 0) === 0 && !dayData?.note && !editingNote && (
        <div className="text-center py-4 text-gray-400 text-xs mt-2">
          No events scheduled for this day
        </div>
      )}
    </div>
  );
}

interface DateAnalytics {
  netInvoiced: number;
  creditMemoTotal: number;
  netOpenBalance: number;
  openInvoiceDmBalance: number;
  openInvoiceDmCount: number;
  openCmBalance: number;
  openCmCount: number;
  totalInvoices: number;
  creditMemoCount: number;
  uniqueCustomers: number;
}

function DateAnalyticsPanel({ date }: { date: Date }) {
  const [analytics, setAnalytics] = useState<DateAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [date]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');

      // Try cached analytics first
      const { data: cached } = await supabase
        .from('cached_invoice_analytics')
        .select('*')
        .eq('period_type', 'daily')
        .eq('date', dateStr)
        .maybeSingle();

      if (cached) {
        const invoiceOnlyAmount = parseFloat(cached.invoice_only_amount || '0');
        const debitMemoAmount = parseFloat(cached.debit_memo_amount || '0');
        const creditMemoAmount = parseFloat(cached.credit_memo_amount || '0');
        const netInvoiced = invoiceOnlyAmount + debitMemoAmount - creditMemoAmount;
        const openInvBal = parseFloat(cached.open_invoice_balance || '0');
        const openDmBal = parseFloat(cached.open_dm_balance || '0');
        const openCmBal = parseFloat(cached.open_cm_balance || '0');

        setAnalytics({
          netInvoiced,
          creditMemoTotal: creditMemoAmount,
          netOpenBalance: openInvBal + openDmBal - openCmBal,
          openInvoiceDmBalance: openInvBal + openDmBal,
          openInvoiceDmCount: (cached.open_invoice_count || 0) + (cached.open_dm_count || 0),
          openCmBalance: openCmBal,
          openCmCount: cached.open_cm_count || 0,
          totalInvoices: cached.invoice_count || 0,
          creditMemoCount: cached.credit_memo_count || 0,
          uniqueCustomers: cached.unique_customer_count || 0,
        });
      } else {
        // Compute from invoices table directly
        const { data: invoices } = await supabase
          .from('acumatica_invoices')
          .select('type, status, amount, balance, customer_name')
          .eq('invoice_date', dateStr)
          .neq('status', 'On Hold');

        if (invoices && invoices.length > 0) {
          const invAndDm = invoices.filter(i => i.type === 'Invoice' || i.type === 'Debit Memo');
          const cms = invoices.filter(i => i.type === 'Credit Memo');
          const invTotal = invAndDm.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
          const cmTotal = cms.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
          const openInvDm = invAndDm.filter(i => i.status === 'Open' || i.status === 'Balanced');
          const openInvDmBal = openInvDm.reduce((s, i) => s + (parseFloat(i.balance) || 0), 0);
          const openCms = cms.filter(i => i.status === 'Open' || i.status === 'Balanced');
          const openCmBal = openCms.reduce((s, i) => s + (parseFloat(i.balance) || 0), 0);
          const customers = new Set(invoices.map(i => i.customer_name).filter(Boolean));

          setAnalytics({
            netInvoiced: invTotal - cmTotal,
            creditMemoTotal: cmTotal,
            netOpenBalance: openInvDmBal - openCmBal,
            openInvoiceDmBalance: openInvDmBal,
            openInvoiceDmCount: openInvDm.length,
            openCmBalance: openCmBal,
            openCmCount: openCms.length,
            totalInvoices: invoices.length,
            creditMemoCount: cms.length,
            uniqueCustomers: customers.size,
          });
        } else {
          setAnalytics(null);
        }
      }
    } catch (err) {
      console.error('Error loading date analytics:', err);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(val / 1_000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    return `$${val.toFixed(0)}`;
  };

  const formatFull = (val: number) =>
    '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });

  if (loading) {
    return (
      <div className="border-t border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600" />
          Loading analytics for {format(date, 'MMM d, yyyy')}...
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="border-t border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <BarChart3 className="w-3.5 h-3.5" />
          No invoice data for {format(date, 'MMM d, yyyy')}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-gradient-to-r from-slate-50 to-gray-50 px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Invoice Analytics - {format(date, 'MMM d, yyyy')}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Net Invoiced */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Net Invoiced</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{formatFull(analytics.netInvoiced)}</div>
          {analytics.creditMemoTotal > 0 && (
            <div className="text-[10px] text-red-600 mt-0.5">
              CM: -{formatCurrency(analytics.creditMemoTotal)}
            </div>
          )}
        </div>

        {/* Net Open Balance */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Net Open Balance</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{formatFull(analytics.netOpenBalance)}</div>
          <div className="text-[10px] text-gray-500 mt-0.5 space-y-0.5">
            <div>Open Invoices + DM: {formatCurrency(analytics.openInvoiceDmBalance)} ({analytics.openInvoiceDmCount})</div>
            {analytics.openCmCount > 0 && (
              <div className="text-red-600">Open CM: -{formatCurrency(analytics.openCmBalance)} ({analytics.openCmCount})</div>
            )}
          </div>
        </div>

        {/* Total Invoices */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Total Invoices</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{analytics.totalInvoices.toLocaleString()}</div>
          {analytics.creditMemoCount > 0 && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              {analytics.creditMemoCount} Credit Memo{analytics.creditMemoCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Unique Customers */}
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-teal-600" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Unique Customers</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{analytics.uniqueCustomers.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
