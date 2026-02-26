import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Plus, Edit2, Trash2, Search, Users, Save, AlertTriangle } from 'lucide-react';

type Customer = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

type ManageCustomersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCustomersChanged: () => void;
};

export default function ManageCustomersModal({ isOpen, onClose, onCustomersChanged }: ManageCustomersModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({ name: '', email: '' });
  const [editFormData, setEditFormData] = useState({ name: '', email: '' });

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
    }
  }, [isOpen]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, email, is_active, created_at')
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and email are required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
        });

      if (error) {
        if (error.code === '23505') {
          setError('A customer with this email already exists');
        } else {
          throw error;
        }
        return;
      }

      setFormData({ name: '', email: '' });
      setShowAddForm(false);
      await loadCustomers();
      onCustomersChanged();
    } catch (err) {
      console.error('Error adding customer:', err);
      setError('Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setEditFormData({ name: customer.name, email: customer.email });
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({ name: '', email: '' });
    setError('');
  };

  const handleSaveEdit = async (id: string) => {
    setError('');

    if (!editFormData.name.trim() || !editFormData.email.trim()) {
      setError('Name and email are required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editFormData.email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          name: editFormData.name.trim(),
          email: editFormData.email.trim().toLowerCase(),
        })
        .eq('id', id);

      if (error) {
        if (error.code === '23505') {
          setError('A customer with this email already exists');
        } else {
          throw error;
        }
        return;
      }

      setEditingId(null);
      await loadCustomers();
      onCustomersChanged();
    } catch (err) {
      console.error('Error updating customer:', err);
      setError('Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    const confirmed = confirm(
      `Are you sure you want to delete "${customer.name}" (${customer.email})?\n\nThis will also remove any assignments linked to this customer.`
    );
    if (!confirmed) return;

    setDeletingId(customer.id);
    try {
      await supabase
        .from('customer_assignments')
        .delete()
        .eq('customer_id', customer.id);

      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customer.id);

      if (error) throw error;

      await loadCustomers();
      onCustomersChanged();
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert('Failed to delete customer. It may be referenced by other records.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[85vh] bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Users className="text-blue-400" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Manage Customers</h2>
              <p className="text-sm text-slate-400 mt-0.5">{customers.length} customer{customers.length !== 1 ? 's' : ''} total</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-700/50 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 text-sm"
              />
            </div>
            <button
              onClick={() => { setShowAddForm(true); setError(''); setFormData({ name: '', email: '' }); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
            >
              <Plus size={18} />
              Add Customer
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}
        </div>

        {showAddForm && (
          <div className="p-4 border-b border-slate-700/50 bg-slate-700/20">
            <form onSubmit={handleAdd} className="space-y-3">
              <p className="text-sm font-medium text-slate-300">New Customer</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Customer name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="px-3 py-2.5 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 text-sm"
                  autoFocus
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="px-3 py-2.5 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setError(''); }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="text-slate-600 mx-auto mb-3" size={40} />
              <p className="text-slate-400 text-sm">
                {search ? 'No customers match your search' : 'No customers yet. Add your first customer above.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="group flex items-center gap-3 p-3 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/50 hover:border-slate-500/50 rounded-lg transition-all"
                >
                  {editingId === customer.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        autoFocus
                      />
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <button
                        onClick={() => handleSaveEdit(customer.id)}
                        disabled={saving}
                        className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        title="Save"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                        <span className="text-blue-400 font-semibold text-sm">
                          {customer.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">{customer.name}</p>
                        <p className="text-slate-400 text-xs truncate">{customer.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEdit(customer)}
                          className="p-1.5 bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(customer)}
                          disabled={deletingId === customer.id}
                          className="p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
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
