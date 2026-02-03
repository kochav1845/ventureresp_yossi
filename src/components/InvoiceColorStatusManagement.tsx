import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Save, X, GripVertical, Palette } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface InvoiceColorStatus {
  id: string;
  status_name: string;
  display_name: string;
  color_class: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
}

interface InvoiceColorStatusManagementProps {
  onBack: () => void;
}

const colorOptions = [
  { value: 'bg-red-500 border-red-700', label: 'Red', bgColor: 'bg-red-500', borderColor: 'border-red-700' },
  { value: 'bg-yellow-400 border-yellow-600', label: 'Yellow', bgColor: 'bg-yellow-400', borderColor: 'border-yellow-600' },
  { value: 'bg-green-500 border-green-700', label: 'Green', bgColor: 'bg-green-500', borderColor: 'border-green-700' },
  { value: 'bg-blue-500 border-blue-700', label: 'Blue', bgColor: 'bg-blue-500', borderColor: 'border-blue-700' },
  { value: 'bg-purple-500 border-purple-700', label: 'Purple', bgColor: 'bg-purple-500', borderColor: 'border-purple-700' },
  { value: 'bg-orange-500 border-orange-700', label: 'Orange', bgColor: 'bg-orange-500', borderColor: 'border-orange-700' },
  { value: 'bg-pink-500 border-pink-700', label: 'Pink', bgColor: 'bg-pink-500', borderColor: 'border-pink-700' },
  { value: 'bg-teal-500 border-teal-700', label: 'Teal', bgColor: 'bg-teal-500', borderColor: 'border-teal-700' },
  { value: 'bg-gray-500 border-gray-700', label: 'Gray', bgColor: 'bg-gray-500', borderColor: 'border-gray-700' },
];

export default function InvoiceColorStatusManagement({ onBack }: InvoiceColorStatusManagementProps) {
  const { profile } = useAuth();
  const [statuses, setStatuses] = useState<InvoiceColorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newStatus, setNewStatus] = useState({
    display_name: '',
    color_class: 'bg-gray-500 border-gray-700'
  });
  const [editForm, setEditForm] = useState<Partial<InvoiceColorStatus>>({});

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('invoice_color_status_options')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setStatuses(data || []);
    } catch (error) {
      console.error('Error loading invoice color statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = async () => {
    if (!newStatus.display_name || !newStatus.display_name.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      const maxSortOrder = Math.max(...statuses.map(s => s.sort_order), 0);

      const { error } = await supabase
        .from('invoice_color_status_options')
        .insert([{
          status_name: newStatus.display_name.toLowerCase().replace(/\s+/g, '_'),
          display_name: newStatus.display_name,
          color_class: newStatus.color_class,
          sort_order: maxSortOrder + 1,
          is_active: true,
          is_system: false
        }]);

      if (error) throw error;

      setNewStatus({ display_name: '', color_class: 'bg-gray-500 border-gray-700' });
      setAddingNew(false);
      await loadStatuses();
    } catch (error: any) {
      console.error('Error adding color status:', error);
      alert(error.message || 'Failed to add color status');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (status: InvoiceColorStatus) => {
    setEditingId(status.id);
    setEditForm({
      id: status.id,
      display_name: status.display_name,
      color_class: status.color_class
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.id || !editForm.display_name?.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('invoice_color_status_options')
        .update({
          display_name: editForm.display_name,
          color_class: editForm.color_class
        })
        .eq('id', editForm.id);

      if (error) throw error;

      setEditingId(null);
      setEditForm({});
      await loadStatuses();
    } catch (error: any) {
      console.error('Error updating color status:', error);
      alert(error.message || 'Failed to update color status');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const status = statuses.find(s => s.id === id);
    if (status?.is_system) {
      alert('Cannot delete system color statuses');
      return;
    }

    if (!confirm('Are you sure you want to delete this color status?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('invoice_color_status_options')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadStatuses();
    } catch (error: any) {
      console.error('Error deleting color status:', error);
      alert(error.message || 'Failed to delete color status');
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = statuses.findIndex(s => s.id === id);
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === statuses.length - 1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    try {
      const current = statuses[currentIndex];
      const target = statuses[targetIndex];

      await supabase.from('invoice_color_status_options').update({ sort_order: target.sort_order }).eq('id', current.id);
      await supabase.from('invoice_color_status_options').update({ sort_order: current.sort_order }).eq('id', target.id);

      await loadStatuses();
    } catch (error) {
      console.error('Error reordering:', error);
    }
  };

  const getColorPreview = (colorClass: string) => {
    const option = colorOptions.find(o => o.value === colorClass);
    return option ? (
      <span className={`inline-block w-6 h-6 rounded-full ${option.bgColor} border-2 ${option.borderColor}`}></span>
    ) : (
      <span className="inline-block w-6 h-6 rounded-full bg-gray-300 border-2 border-gray-500"></span>
    );
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-6">
            <Palette className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Invoice Color Status Management</h1>
          </div>

          <p className="text-sm text-gray-600 mb-6">
            Manage the color status options that collectors can assign to invoices. These colors help identify
            payment likelihood and customer behavior at a glance.
          </p>

          {!addingNew && (
            <button
              onClick={() => setAddingNew(true)}
              className="mb-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add New Color Status
            </button>
          )}

          {addingNew && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-4">Add New Color Status</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={newStatus.display_name}
                    onChange={(e) => setNewStatus({ ...newStatus, display_name: e.target.value })}
                    placeholder="e.g., Payment Pending"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {colorOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setNewStatus({ ...newStatus, color_class: option.value })}
                        className={`flex items-center gap-2 p-2 border-2 rounded-lg hover:bg-gray-50 ${
                          newStatus.color_class === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-full ${option.bgColor} border-2 ${option.borderColor}`}></span>
                        <span className="text-sm">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleAddNew}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setAddingNew(false);
                      setNewStatus({ display_name: '', color_class: 'bg-gray-500 border-gray-700' });
                    }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading color statuses...</p>
            </div>
          ) : statuses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No color statuses found. Add your first one above.
            </div>
          ) : (
            <div className="space-y-2">
              {statuses.map((status, index) => (
                <div
                  key={status.id}
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleReorder(status.id, 'up')}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleReorder(status.id, 'down')}
                      disabled={index === statuses.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {editingId === status.id ? (
                    <>
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div>
                          <input
                            type="text"
                            value={editForm.display_name || ''}
                            onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <select
                            value={editForm.color_class || ''}
                            onChange={(e) => setEditForm({ ...editForm, color_class: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {colorOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="p-2 text-green-600 hover:bg-green-50 rounded"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditForm({});
                          }}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 flex-1">
                        {getColorPreview(status.color_class)}
                        <div>
                          <div className="font-medium text-gray-900">{status.display_name}</div>
                          <div className="text-xs text-gray-500">
                            {status.is_system && (
                              <span className="inline-block px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                                System
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(status)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!status.is_system && (
                          <button
                            onClick={() => handleDelete(status.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
