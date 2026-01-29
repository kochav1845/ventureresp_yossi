import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, Edit2, Trash2, Calendar, RefreshCw } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

type ScheduleDay = {
  day: number;
  times: string[];
};

type EmailFormula = {
  id: string;
  name: string;
  description: string;
  schedule: ScheduleDay[];
  created_at: string;
  updated_at: string;
};

type EmailFormulasProps = {
  onBack?: () => void;
};

export default function EmailFormulas({ onBack }: EmailFormulasProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [formulas, setFormulas] = useState<EmailFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFormula, setEditingFormula] = useState<EmailFormula | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    schedule: [] as ScheduleDay[],
  });

  const [newScheduleDay, setNewScheduleDay] = useState(1);
  const [newScheduleTimes, setNewScheduleTimes] = useState<string[]>([]);
  const [newTimeInput, setNewTimeInput] = useState('09:00');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadFormulas();
  }, []);

  const loadFormulas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_formulas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFormulas(data || []);
    } catch (error) {
      console.error('Error loading formulas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingFormula(null);
    setFormData({ name: '', description: '', schedule: [] });
    setNewScheduleDay(1);
    setNewScheduleTimes([]);
    setNewTimeInput('09:00');
    setShowForm(true);
  };

  const handleEdit = (formula: EmailFormula) => {
    setEditingFormula(formula);
    setFormData({
      name: formula.name,
      description: formula.description,
      schedule: formula.schedule,
    });
    setNewScheduleDay(1);
    setNewScheduleTimes([]);
    setNewTimeInput('09:00');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this formula?')) return;

    try {
      const { error } = await supabase
        .from('email_formulas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadFormulas();
    } catch (error) {
      console.error('Error deleting formula:', error);
      toast.error('Error deleting formula. It may be in use by customer assignments.');
    }
  };

  const handleAddTimeToSchedule = () => {
    if (!newTimeInput) {
      toast.warning('Please select a time');
      return;
    }

    const timeWithSeconds = newTimeInput + ':00';
    if (newScheduleTimes.includes(timeWithSeconds)) {
      toast.warning('This time is already added');
      return;
    }

    setNewScheduleTimes([...newScheduleTimes, timeWithSeconds].sort());
    setNewTimeInput('09:00');
  };

  const handleRemoveTimeFromSchedule = (time: string) => {
    setNewScheduleTimes(newScheduleTimes.filter(t => t !== time));
  };

  const handleAddScheduleDay = () => {
    if (newScheduleDay < 1 || newScheduleDay > 31) {
      toast.warning('Day must be between 1 and 31');
      return;
    }

    if (newScheduleTimes.length === 0) {
      toast.warning('Please add at least one time for this day');
      return;
    }

    const exists = formData.schedule.some(s => s.day === newScheduleDay);
    if (exists) {
      toast.warning('This day is already in the schedule');
      return;
    }

    setFormData({
      ...formData,
      schedule: [...formData.schedule, { day: newScheduleDay, times: [...newScheduleTimes] }].sort((a, b) => a.day - b.day),
    });
    setNewScheduleDay(1);
    setNewScheduleTimes([]);
    setNewTimeInput('09:00');
  };

  const handleRemoveScheduleDay = (day: number) => {
    setFormData({
      ...formData,
      schedule: formData.schedule.filter(s => s.day !== day),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.warning('Please enter a formula name');
      return;
    }

    if (formData.schedule.length === 0) {
      toast.warning('Please add at least one schedule day');
      return;
    }

    try {
      if (editingFormula) {
        const { error } = await supabase
          .from('email_formulas')
          .update({
            name: formData.name,
            description: formData.description,
            schedule: formData.schedule,
          })
          .eq('id', editingFormula.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_formulas')
          .insert({
            name: formData.name,
            description: formData.description,
            schedule: formData.schedule,
          });

        if (error) throw error;
      }

      setShowForm(false);
      await loadFormulas();
    } catch (error) {
      console.error('Error saving formula:', error);
      toast.warning('Error saving formula');
    }
  };

  if (showForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setShowForm(false)}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Formulas
          </button>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingFormula ? 'Edit Formula' : 'Create New Formula'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Formula Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Standard Follow-up"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Optional description of this formula"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-4">
                  Email Schedule *
                </label>
                <p className="text-xs text-slate-400 mb-4">
                  Configure which days to send emails and at what times. For example: Day 1 at 11:00 AM, Day 3 at 9:00 AM and 3:00 PM.
                </p>

                <div className="bg-slate-700/50 rounded-lg p-4 mb-4 space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-400 mb-1">Day of Month</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={newScheduleDay}
                        onChange={(e) => setNewScheduleDay(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-slate-400 mb-1">Add Time</label>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={newTimeInput}
                          onChange={(e) => setNewTimeInput(e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddTimeToSchedule}
                          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {newScheduleTimes.length > 0 && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-2">Times for Day {newScheduleDay}:</label>
                      <div className="flex flex-wrap gap-2">
                        {newScheduleTimes.map((time) => (
                          <div
                            key={time}
                            className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-full text-sm"
                          >
                            <span className="text-green-300">
                              {new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTimeFromSchedule(time)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAddScheduleDay}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={20} />
                    Add Day {newScheduleDay} to Schedule
                  </button>
                </div>

                {formData.schedule.length > 0 ? (
                  <div className="space-y-2">
                    {formData.schedule.map((item) => (
                      <div
                        key={item.day}
                        className="flex items-start justify-between bg-slate-700/50 rounded-lg p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="text-blue-400" size={20} />
                            <span className="text-white font-medium">Day {item.day}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 ml-7">
                            {item.times.map((time) => (
                              <span
                                key={time}
                                className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-300"
                              >
                                {new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveScheduleDay(item.day)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm text-center py-4">
                    No schedule days added yet. Add at least one day to continue.
                  </p>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  {editingFormula ? 'Update Formula' : 'Create Formula'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700">
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="text-blue-400" size={24} />
                <h2 className="text-xl font-semibold text-white">Email Formulas</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={loadFormulas}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  New Formula
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin text-blue-400 mx-auto mb-4" size={32} />
                <p className="text-slate-400">Loading formulas...</p>
              </div>
            ) : formulas.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="text-slate-600 mx-auto mb-4" size={48} />
                <p className="text-slate-400 mb-4">No formulas created yet</p>
                <button
                  onClick={handleCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  Create Your First Formula
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {formulas.map((formula) => (
                  <div
                    key={formula.id}
                    className="bg-slate-700/30 rounded-lg p-6 border border-slate-600 hover:border-slate-500 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">{formula.name}</h3>
                        {formula.description && (
                          <p className="text-slate-400 text-sm">{formula.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(formula)}
                          className="p-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(formula.id)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {formula.schedule && formula.schedule.length > 0 ? (
                        formula.schedule.map((item) => (
                          <div key={item.day} className="flex items-start gap-3">
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <Calendar size={14} className="text-blue-400" />
                              <span className="text-blue-300 text-sm font-medium">Day {item.day}:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.times && item.times.length > 0 ? (
                                item.times.map((time) => (
                                  <span
                                    key={time}
                                    className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-300"
                                  >
                                    {new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    })}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400">(old format - please edit and re-save)</span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">No schedule configured</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
