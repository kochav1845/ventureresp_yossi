import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  Plus,
  Save,
  Trash2,
  Edit,
  GripVertical,
  Filter,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  AlertTriangle,
  Target,
  Users,
  Zap,
  CheckCircle2,
  Circle
} from 'lucide-react';

interface QuickFilter {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  filter_config: FilterConfig;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FilterConfig {
  dateRange?: {
    type: 'relative' | 'absolute' | 'none';
    relativeDays?: number;
    fromDate?: string;
    toDate?: string;
  };
  balance?: {
    min?: number;
    max?: number;
  };
  invoiceCount?: {
    min?: number;
    max?: number;
  };
  overdueCount?: {
    min?: number;
    max?: number;
  };
  colorStatus?: string[];
  daysOverdue?: {
    min?: number;
    max?: number;
  };
  excludeFromAnalytics?: boolean;
  excludeFromReports?: boolean;
  hasCollectorAssigned?: boolean | null;
  hasActiveTickets?: boolean | null;
}

interface QuickFilterManagerProps {
  onClose: () => void;
  onFiltersUpdated: () => void;
}

const ICON_OPTIONS = [
  { value: 'filter', label: 'Filter', Icon: Filter },
  { value: 'zap', label: 'Zap', Icon: Zap },
  { value: 'calendar', label: 'Calendar', Icon: Calendar },
  { value: 'clock', label: 'Clock', Icon: Clock },
  { value: 'dollar-sign', label: 'Dollar', Icon: DollarSign },
  { value: 'file-text', label: 'File', Icon: FileText },
  { value: 'alert-triangle', label: 'Alert', Icon: AlertTriangle },
  { value: 'target', label: 'Target', Icon: Target },
  { value: 'users', label: 'Users', Icon: Users },
  { value: 'check-circle-2', label: 'Check', Icon: CheckCircle2 },
  { value: 'circle', label: 'Circle', Icon: Circle }
];

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue', bgClass: 'bg-blue-600', hoverClass: 'hover:bg-blue-700' },
  { value: 'red', label: 'Red', bgClass: 'bg-red-600', hoverClass: 'hover:bg-red-700' },
  { value: 'green', label: 'Green', bgClass: 'bg-green-600', hoverClass: 'hover:bg-green-700' },
  { value: 'purple', label: 'Purple', bgClass: 'bg-purple-600', hoverClass: 'hover:bg-purple-700' },
  { value: 'orange', label: 'Orange', bgClass: 'bg-orange-600', hoverClass: 'hover:bg-orange-700' },
  { value: 'yellow', label: 'Yellow', bgClass: 'bg-yellow-500', hoverClass: 'hover:bg-yellow-600' },
  { value: 'pink', label: 'Pink', bgClass: 'bg-pink-600', hoverClass: 'hover:bg-pink-700' },
  { value: 'cyan', label: 'Cyan', bgClass: 'bg-cyan-600', hoverClass: 'hover:bg-cyan-700' },
  { value: 'gray', label: 'Gray', bgClass: 'bg-gray-600', hoverClass: 'hover:bg-gray-700' }
];

export default function QuickFilterManager({ onClose, onFiltersUpdated }: QuickFilterManagerProps) {
  const { user } = useAuth();
  const [filters, setFilters] = useState<QuickFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFilter, setEditingFilter] = useState<QuickFilter | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('filter');
  const [formColor, setFormColor] = useState('blue');
  const [formConfig, setFormConfig] = useState<FilterConfig>({});

  useEffect(() => {
    if (user) {
      loadFilters();
    }
  }, [user]);

  const loadFilters = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_quick_filters')
        .select('*')
        .eq('user_id', user!.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setFilters(data || []);
    } catch (error) {
      console.error('Error loading filters:', error);
    } finally {
      setLoading(false);
    }
  };

  const startCreate = () => {
    setFormName('');
    setFormIcon('filter');
    setFormColor('blue');
    setFormConfig({});
    setEditingFilter(null);
    setShowCreateForm(true);
  };

  const startEdit = (filter: QuickFilter) => {
    setFormName(filter.name);
    setFormIcon(filter.icon);
    setFormColor(filter.color);
    setFormConfig(filter.filter_config);
    setEditingFilter(filter);
    setShowCreateForm(true);
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditingFilter(null);
    setFormName('');
    setFormIcon('filter');
    setFormColor('blue');
    setFormConfig({});
  };

  const saveFilter = async () => {
    if (!formName.trim()) {
      alert('Please enter a filter name');
      return;
    }

    try {
      setSaving(true);

      if (editingFilter) {
        const { error } = await supabase
          .from('user_quick_filters')
          .update({
            name: formName,
            icon: formIcon,
            color: formColor,
            filter_config: formConfig
          })
          .eq('id', editingFilter.id);

        if (error) throw error;
      } else {
        const maxSortOrder = filters.length > 0
          ? Math.max(...filters.map(f => f.sort_order))
          : -1;

        const { error } = await supabase
          .from('user_quick_filters')
          .insert({
            user_id: user!.id,
            name: formName,
            icon: formIcon,
            color: formColor,
            filter_config: formConfig,
            sort_order: maxSortOrder + 1,
            is_active: true
          });

        if (error) throw error;
      }

      await loadFilters();
      onFiltersUpdated();
      cancelForm();
    } catch (error) {
      console.error('Error saving filter:', error);
      alert('Failed to save filter');
    } finally {
      setSaving(false);
    }
  };

  const deleteFilter = async (filterId: string) => {
    if (!confirm('Are you sure you want to delete this quick filter?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_quick_filters')
        .delete()
        .eq('id', filterId);

      if (error) throw error;

      await loadFilters();
      onFiltersUpdated();
    } catch (error) {
      console.error('Error deleting filter:', error);
      alert('Failed to delete filter');
    }
  };

  const toggleFilterActive = async (filter: QuickFilter) => {
    try {
      const { error } = await supabase
        .from('user_quick_filters')
        .update({ is_active: !filter.is_active })
        .eq('id', filter.id);

      if (error) throw error;

      await loadFilters();
      onFiltersUpdated();
    } catch (error) {
      console.error('Error toggling filter:', error);
    }
  };

  const updateConfigField = (field: string, value: any) => {
    setFormConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getIconComponent = (iconName: string) => {
    const iconOption = ICON_OPTIONS.find(opt => opt.value === iconName);
    return iconOption ? iconOption.Icon : Filter;
  };

  const getColorClasses = (colorName: string) => {
    const colorOption = COLOR_OPTIONS.find(opt => opt.value === colorName);
    return colorOption
      ? `${colorOption.bgClass} ${colorOption.hoverClass} text-white`
      : 'bg-blue-600 hover:bg-blue-700 text-white';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-yellow-500" />
            <h2 className="text-2xl font-bold text-gray-900">Manage Quick Filters</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading filters...</p>
            </div>
          ) : showCreateForm ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingFilter ? 'Edit Filter' : 'Create New Filter'}
                </h3>
                <button
                  onClick={cancelForm}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filter Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., High Balance Customers"
                    maxLength={50}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Icon
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {ICON_OPTIONS.map((option) => {
                      const IconComponent = option.Icon;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setFormIcon(option.value)}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            formIcon === option.value
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <IconComponent className="w-5 h-5 mx-auto" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Button Color
                </label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormColor(option.value)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        option.bgClass
                      } text-white ${
                        formColor === option.value
                          ? 'ring-4 ring-offset-2 ring-gray-300'
                          : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-4">Filter Criteria</h4>

                <div className="space-y-6">
                  {/* Date Range */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date Range
                    </label>
                    <div className="space-y-3">
                      <select
                        value={formConfig.dateRange?.type || 'none'}
                        onChange={(e) => updateConfigField('dateRange', {
                          ...formConfig.dateRange,
                          type: e.target.value
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="none">No date filter</option>
                        <option value="relative">Relative (last X days)</option>
                        <option value="absolute">Absolute (specific dates)</option>
                      </select>

                      {formConfig.dateRange?.type === 'relative' && (
                        <input
                          type="number"
                          value={formConfig.dateRange?.relativeDays || 30}
                          onChange={(e) => updateConfigField('dateRange', {
                            ...formConfig.dateRange,
                            type: 'relative',
                            relativeDays: parseInt(e.target.value)
                          })}
                          placeholder="Number of days"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      )}

                      {formConfig.dateRange?.type === 'absolute' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={formConfig.dateRange?.fromDate || ''}
                            onChange={(e) => updateConfigField('dateRange', {
                              ...formConfig.dateRange,
                              type: 'absolute',
                              fromDate: e.target.value
                            })}
                            className="px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          <input
                            type="date"
                            value={formConfig.dateRange?.toDate || ''}
                            onChange={(e) => updateConfigField('dateRange', {
                              ...formConfig.dateRange,
                              type: 'absolute',
                              toDate: e.target.value
                            })}
                            className="px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Balance Range */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Balance Range
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={formConfig.balance?.min || ''}
                        onChange={(e) => updateConfigField('balance', {
                          ...formConfig.balance,
                          min: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                        placeholder="Min balance"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        value={formConfig.balance?.max || ''}
                        onChange={(e) => updateConfigField('balance', {
                          ...formConfig.balance,
                          max: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                        placeholder="Max balance"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Invoice Count */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Open Invoices
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={formConfig.invoiceCount?.min || ''}
                        onChange={(e) => updateConfigField('invoiceCount', {
                          ...formConfig.invoiceCount,
                          min: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        placeholder="Min invoices"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        value={formConfig.invoiceCount?.max || ''}
                        onChange={(e) => updateConfigField('invoiceCount', {
                          ...formConfig.invoiceCount,
                          max: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        placeholder="Max invoices"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Overdue Count */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Overdue Invoices
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={formConfig.overdueCount?.min || ''}
                        onChange={(e) => updateConfigField('overdueCount', {
                          ...formConfig.overdueCount,
                          min: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        placeholder="Min overdue"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        value={formConfig.overdueCount?.max || ''}
                        onChange={(e) => updateConfigField('overdueCount', {
                          ...formConfig.overdueCount,
                          max: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        placeholder="Max overdue"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Color Status */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer Color Status
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['red', 'yellow', 'green'].map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            const currentColors = formConfig.colorStatus || [];
                            const newColors = currentColors.includes(color)
                              ? currentColors.filter(c => c !== color)
                              : [...currentColors, color];
                            updateConfigField('colorStatus', newColors);
                          }}
                          className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            (formConfig.colorStatus || []).includes(color)
                              ? color === 'red'
                                ? 'bg-red-600 text-white'
                                : color === 'yellow'
                                ? 'bg-yellow-500 text-gray-900'
                                : 'bg-green-600 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {color.charAt(0).toUpperCase() + color.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Days Overdue Range */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Days Overdue Range
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={formConfig.daysOverdue?.min || ''}
                        onChange={(e) => updateConfigField('daysOverdue', {
                          ...formConfig.daysOverdue,
                          min: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        placeholder="Min days"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        value={formConfig.daysOverdue?.max || ''}
                        onChange={(e) => updateConfigField('daysOverdue', {
                          ...formConfig.daysOverdue,
                          max: e.target.value ? parseInt(e.target.value) : undefined
                        })}
                        placeholder="Max days"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Boolean Filters */}
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formConfig.hasCollectorAssigned === true}
                        onChange={(e) => updateConfigField('hasCollectorAssigned', e.target.checked ? true : null)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Has collector assigned</span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formConfig.hasActiveTickets === true}
                        onChange={(e) => updateConfigField('hasActiveTickets', e.target.checked ? true : null)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Has active tickets</span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formConfig.excludeFromAnalytics === true}
                        onChange={(e) => updateConfigField('excludeFromAnalytics', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Exclude from analytics</span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formConfig.excludeFromReports === true}
                        onChange={(e) => updateConfigField('excludeFromReports', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Exclude from reports</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={saveFilter}
                  disabled={saving || !formName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
                >
                  <Save className="w-5 h-5" />
                  {saving ? 'Saving...' : editingFilter ? 'Update Filter' : 'Create Filter'}
                </button>
                <button
                  onClick={cancelForm}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-6">
                <p className="text-gray-600">
                  {filters.length === 0
                    ? 'No quick filters yet. Create your first one!'
                    : `${filters.filter(f => f.is_active).length} active filter(s)`}
                </p>
                <button
                  onClick={startCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  New Filter
                </button>
              </div>

              {filters.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Filter className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">
                    Create custom quick filters to instantly apply complex filters with one click
                  </p>
                  <button
                    onClick={startCreate}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Create Your First Filter
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filters.map((filter) => {
                    const IconComponent = getIconComponent(filter.icon);
                    return (
                      <div
                        key={filter.id}
                        className={`flex items-center gap-4 p-4 border-2 rounded-lg transition-all ${
                          filter.is_active
                            ? 'border-gray-200 bg-white'
                            : 'border-gray-100 bg-gray-50 opacity-60'
                        }`}
                      >
                        <GripVertical className="w-5 h-5 text-gray-400" />

                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${getColorClasses(filter.color)}`}>
                          <IconComponent className="w-4 h-4" />
                          <span className="font-medium">{filter.name}</span>
                        </div>

                        <div className="flex-1"></div>

                        <button
                          onClick={() => toggleFilterActive(filter)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title={filter.is_active ? 'Disable' : 'Enable'}
                        >
                          {filter.is_active ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>

                        <button
                          onClick={() => startEdit(filter)}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-5 h-5" />
                        </button>

                        <button
                          onClick={() => deleteFilter(filter.id)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
