import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Save, X, GripVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface TicketType {
  id: string;
  value: string;
  label: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

interface TicketTypeManagementProps {
  onBack: () => void;
}

export default function TicketTypeManagement({ onBack }: TicketTypeManagementProps) {
  const { profile } = useAuth();
  const [types, setTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState({
    label: '',
    value: ''
  });
  const [editForm, setEditForm] = useState<Partial<TicketType>>({});

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ticket_type_options')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setTypes(data || []);
    } catch (error) {
      console.error('Error loading types:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = async () => {
    if (!newType.label || !newType.label.trim()) {
      alert('Please fill in the label field');
      return;
    }

    try {
      setSaving(true);
      const maxDisplayOrder = Math.max(...types.map(t => t.display_order), 0);
      const generatedValue = newType.label.toLowerCase().replace(/\s+/g, ' ').trim();

      const { error } = await supabase
        .from('ticket_type_options')
        .insert([{
          value: generatedValue,
          label: newType.label,
          display_order: maxDisplayOrder + 1,
          is_active: true
        }]);

      if (error) throw error;

      setNewType({ label: '', value: '' });
      setAddingNew(false);
      await loadTypes();
    } catch (error: any) {
      console.error('Error adding type:', error);
      alert(error.message || 'Failed to add ticket type');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (type: TicketType) => {
    setEditingId(type.id);
    setEditForm(type);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.label) return;

    try {
      setSaving(true);
      const updatedValue = editForm.label!.toLowerCase().replace(/\s+/g, ' ').trim();

      const { error } = await supabase
        .from('ticket_type_options')
        .update({
          label: editForm.label,
          value: updatedValue
        })
        .eq('id', editingId);

      if (error) throw error;

      setEditingId(null);
      setEditForm({});
      await loadTypes();
    } catch (error: any) {
      console.error('Error updating type:', error);
      alert(error.message || 'Failed to update ticket type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ticket type? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('ticket_type_options')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadTypes();
    } catch (error: any) {
      console.error('Error deleting type:', error);
      alert(error.message || 'Failed to delete ticket type');
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('ticket_type_options')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      await loadTypes();
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = types.findIndex(t => t.id === id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= types.length) return;

    try {
      const current = types[currentIndex];
      const target = types[targetIndex];

      await supabase.from('ticket_type_options').update({ display_order: target.display_order }).eq('id', current.id);
      await supabase.from('ticket_type_options').update({ display_order: current.display_order }).eq('id', target.id);

      await loadTypes();
    } catch (error) {
      console.error('Error reordering:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading ticket types...</div>
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
        <h1 className="text-3xl font-bold text-gray-900">Ticket Type Management</h1>
        <p className="text-gray-600 mt-2">
          Configure the ticket types available for collection tickets. Custom types can be added and edited.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Ticket Types</h2>
          <button
            onClick={() => setAddingNew(true)}
            disabled={addingNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add New Type
          </button>
        </div>

        {addingNew && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border-2 border-blue-500">
            <h3 className="font-semibold text-gray-900 mb-3">Add New Ticket Type</h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Label *
                </label>
                <input
                  type="text"
                  value={newType.label}
                  onChange={(e) => setNewType({ ...newType, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Payment Plan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Internal Value (auto-generated)
                </label>
                <input
                  type="text"
                  value={newType.label.toLowerCase().replace(/\s+/g, ' ').trim()}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddNew}
                disabled={saving || !newType.label}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setAddingNew(false);
                  setNewType({ label: '', value: '' });
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {types.map((type, index) => (
            <div
              key={type.id}
              className={`p-4 border rounded-lg ${
                !type.is_active ? 'bg-gray-50 opacity-60' : 'bg-white'
              }`}
            >
              {editingId === type.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Display Label
                      </label>
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Internal Value (auto-updated)
                      </label>
                      <input
                        type="text"
                        value={(editForm.label || '').toLowerCase().replace(/\s+/g, ' ').trim()}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                      />
                    </div>
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
                        onClick={() => handleReorder(type.id, 'up')}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move up"
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleReorder(type.id, 'down')}
                        disabled={index === types.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move down"
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">
                          {type.label}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({type.value})
                        </span>
                        {!type.is_active && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(type.id, type.is_active)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium ${
                        type.is_active
                          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                      }`}
                      title={type.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {type.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleEdit(type)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(type.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
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
