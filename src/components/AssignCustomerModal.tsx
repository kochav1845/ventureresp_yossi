import { useState, useEffect } from 'react';
import { X, Users, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface AssignCustomerModalProps {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onAssignmentComplete: () => void;
}

interface Collector {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function AssignCustomerModal({
  customerId,
  customerName,
  onClose,
  onAssignmentComplete
}: AssignCustomerModalProps) {
  const { profile } = useAuth();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [selectedCollectorId, setSelectedCollectorId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingAssignments, setExistingAssignments] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCollectors();
    loadExistingAssignments();
  }, [customerId]);

  const loadCollectors = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .in('role', ['collector', 'admin', 'manager'])
        .order('full_name');

      if (error) throw error;
      setCollectors(data || []);
    } catch (error) {
      console.error('Error loading collectors:', error);
    }
  };

  const loadExistingAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('collector_customer_assignments')
        .select('assigned_collector_id')
        .eq('customer_id', customerId);

      if (error) throw error;

      const assignedIds = new Set(data?.map(a => a.assigned_collector_id) || []);
      setExistingAssignments(assignedIds);
    } catch (error) {
      console.error('Error loading existing assignments:', error);
    }
  };

  const handleAssign = async () => {
    if (!selectedCollectorId || !profile) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('collector_customer_assignments')
        .insert({
          customer_id: customerId,
          customer_name: customerName,
          assigned_collector_id: selectedCollectorId,
          assigned_by: profile.id,
          notes: notes || null
        });

      if (error) {
        if (error.code === '23505') {
          alert('This customer is already assigned to the selected collector.');
        } else {
          throw error;
        }
        return;
      }

      onAssignmentComplete();
      onClose();
    } catch (error) {
      console.error('Error assigning customer:', error);
      alert('Failed to assign customer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const availableCollectors = collectors.filter(c => !existingAssignments.has(c.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Assign Customer to Collector</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">Customer</p>
            <p className="font-semibold text-gray-900">{customerName}</p>
            <p className="text-xs text-gray-500">{customerId}</p>
          </div>

          {existingAssignments.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                This customer is already assigned to {existingAssignments.size} collector(s).
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign To
            </label>
            <select
              value={selectedCollectorId}
              onChange={(e) => setSelectedCollectorId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="">Choose a collector...</option>
              {availableCollectors.map((collector) => (
                <option key={collector.id} value={collector.id}>
                  {collector.full_name} ({collector.email}) - {collector.role.charAt(0).toUpperCase() + collector.role.slice(1)}
                </option>
              ))}
            </select>
            {availableCollectors.length === 0 && collectors.length > 0 && (
              <p className="text-sm text-orange-600 mt-1">
                All collectors are already assigned to this customer.
              </p>
            )}
            {collectors.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">
                No collectors available. Please create collector accounts first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add any notes about this assignment..."
              disabled={loading}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedCollectorId || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            <Check className="w-5 h-5" />
            {loading ? 'Assigning...' : 'Assign Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
