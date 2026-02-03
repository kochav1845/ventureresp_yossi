import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Save, X, GripVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface TicketStatus {
  id: string;
  status_name: string;
  display_name: string;
  color_class: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
}

interface TicketStatusManagementProps {
  onBack: () => void;
}

const colorOptions = [
  { value: 'bg-blue-100 text-blue-800', label: 'Blue' },
  { value: 'bg-yellow-100 text-yellow-800', label: 'Yellow' },
  { value: 'bg-purple-100 text-purple-800', label: 'Purple' },
  { value: 'bg-green-100 text-green-800', label: 'Green' },
  { value: 'bg-red-100 text-red-800', label: 'Red' },
  { value: 'bg-gray-100 text-gray-800', label: 'Gray' },
  { value: 'bg-orange-100 text-orange-800', label: 'Orange' },
  { value: 'bg-pink-100 text-pink-800', label: 'Pink' },
  { value: 'bg-teal-100 text-teal-800', label: 'Teal' },
];

export default function TicketStatusManagement({ onBack }: TicketStatusManagementProps) {
  const { profile } = useAuth();
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newStatus, setNewStatus] = useState({
    display_name: '',
    color_class: 'bg-gray-100 text-gray-800'
  });
  const [editForm, setEditForm] = useState<Partial<TicketStatus>>({});

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ticket_status_options')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setStatuses(data || []);
    } catch (error) {
      console.error('Error loading statuses:', error);
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
        .from('ticket_status_options')
        .insert([{
          status_name: newStatus.display_name.toLowerCase().replace(/\s+/g, '_'),
          display_name: newStatus.display_name,
          color_class: newStatus.color_class,
          sort_order: maxSortOrder + 1,
          is_active: true,
          is_system: false,
          created_by: profile?.id
        }]);

      if (error) throw error;

      setNewStatus({ display_name: '', color_class: 'bg-gray-100 text-gray-800' });
      setAddingNew(false);
      await loadStatuses();
    } catch (error: any) {
      console.error('Error adding status:', error);
      alert(error.message || 'Failed to add status');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (status: TicketStatus) => {
    setEditingId(status.id);
    setEditForm(status);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.display_name) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('ticket_status_options')
        .update({
          display_name: editForm.display_name,
          color_class: editForm.color_class
        })
        .eq('id', editingId);

      if (error) throw error;

      setEditingId(null);
      setEditForm({});
      await loadStatuses();
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert(error.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, isSystem: boolean) => {
    if (isSystem) {
      alert('Cannot delete system statuses');
      return;
    }

    if (!confirm('Are you sure you want to delete this status? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('ticket_status_options')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadStatuses();
    } catch (error: any) {
      console.error('Error deleting status:', error);
      alert(error.message || 'Failed to delete status');
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = statuses.findIndex(s => s.id === id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= statuses.length) return;

    try {
      const current = statuses[currentIndex];
      const target = statuses[targetIndex];

      await supabase.from('ticket_status_options').update({ sort_order: target.sort_order }).eq('id', current.id);
      await supabase.from('ticket_status_options').update({ sort_order: current.sort_order }).eq('id', target.id);

      await loadStatuses();
    } catch (error) {
      console.error('Error reordering:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading ticket statuses...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Admin Dashboard
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Ticket Status Management</h1>
        <p className="text-gray-600 mt-2">
          Configure the ticket statuses available for collection tickets. System statuses cannot be deleted.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Ticket Statuses</h2>
          <button
            onClick={() => setAddingNew(true)}
            disabled={addingNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add New Status
          </button>
        </div>

        {addingNew && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border-2 border-blue-500">
            <h3 className="font-semibold text-gray-900 mb-3">Add New Status</h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={newStatus.display_name}
                  onChange={(e) => setNewStatus({ ...newStatus, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Follow Up"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Internal Name * (auto-generated)
                </label>
                <input
                  type="text"
                  value={newStatus.display_name.toLowerCase().replace(/\s+/g, '_')}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <select
                value={newStatus.color_class}
                onChange={(e) => setNewStatus({ ...newStatus, color_class: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {colorOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="mt-2">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${newStatus.color_class}`}>
                  {newStatus.display_name || 'Preview'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddNew}
                disabled={saving || !newStatus.display_name}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setAddingNew(false);
                  setNewStatus({ display_name: '', color_class: 'bg-gray-100 text-gray-800' });
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {statuses.map((status, index) => (
            <div
              key={status.id}
              className={`p-4 border rounded-lg ${
                !status.is_active ? 'bg-gray-50 opacity-60' : 'bg-white'
              }`}
            >
              {editingId === status.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={editForm.display_name}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Color
                      </label>
                      <select
                        value={editForm.color_class}
                        onChange={(e) => setEditForm({ ...editForm, color_class: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {colorOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${editForm.color_class}`}>
                      {editForm.display_name}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditForm({});
                      }}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleReorder(status.id, 'up')}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move up"
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleReorder(status.id, 'down')}
                        disabled={index === statuses.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move down"
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${status.color_class}`}>
                          {status.display_name}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({status.status_name})
                        </span>
                        {status.is_system && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                            System Status
                          </span>
                        )}
                        {!status.is_active && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(status)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(status.id, status.is_system)}
                      disabled={status.is_system}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                      title={status.is_system ? 'Cannot delete system status' : 'Delete'}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
