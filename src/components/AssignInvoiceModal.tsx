import { useState, useEffect } from 'react';
import { X, FileText, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface AssignInvoiceModalProps {
  invoiceReferenceNumber: string;
  customerName: string;
  invoiceAmount: number;
  onClose: () => void;
  onAssignmentComplete: () => void;
}

interface Collector {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function AssignInvoiceModal({
  invoiceReferenceNumber,
  customerName,
  invoiceAmount,
  onClose,
  onAssignmentComplete
}: AssignInvoiceModalProps) {
  const { profile } = useAuth();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [selectedCollectorId, setSelectedCollectorId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingAssignment, setExistingAssignment] = useState<any>(null);

  useEffect(() => {
    loadCollectors();
    loadExistingAssignment();
  }, [invoiceReferenceNumber]);

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

  const loadExistingAssignment = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_assignments')
        .select('*, user_profiles!invoice_assignments_assigned_collector_id_fkey(full_name, email)')
        .eq('invoice_reference_number', invoiceReferenceNumber)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingAssignment(data);
      }
    } catch (error) {
      console.error('Error loading existing assignment:', error);
    }
  };

  const handleAssign = async () => {
    if (!selectedCollectorId || !profile) return;

    setLoading(true);
    try {
      if (existingAssignment) {
        const { error } = await supabase
          .from('invoice_assignments')
          .update({
            assigned_collector_id: selectedCollectorId,
            assigned_by: profile.id,
            notes: notes || existingAssignment.notes
          })
          .eq('id', existingAssignment.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('invoice_assignments')
          .insert({
            invoice_reference_number: invoiceReferenceNumber,
            assigned_collector_id: selectedCollectorId,
            assigned_by: profile.id,
            notes: notes || null
          });

        if (error) throw error;
      }

      onAssignmentComplete();
      onClose();
    } catch (error) {
      console.error('Error assigning invoice:', error);
      alert('Failed to assign invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (!existingAssignment || !confirm('Are you sure you want to remove this invoice assignment?')) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('invoice_assignments')
        .delete()
        .eq('id', existingAssignment.id);

      if (error) throw error;

      onAssignmentComplete();
      onClose();
    } catch (error) {
      console.error('Error unassigning invoice:', error);
      alert('Failed to unassign invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Assign Invoice to Collector</h2>
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
            <p className="text-sm text-gray-600 mb-1">Invoice</p>
            <p className="font-semibold text-gray-900">{invoiceReferenceNumber}</p>
            <p className="text-sm text-gray-600">{customerName}</p>
            <p className="text-lg font-bold text-blue-600">
              ${invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          {existingAssignment && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800 font-medium mb-1">
                Currently Assigned To:
              </p>
              <p className="text-sm text-yellow-900">
                {existingAssignment.user_profiles?.full_name} ({existingAssignment.user_profiles?.email})
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {existingAssignment ? 'Reassign To' : 'Assign To'}
            </label>
            <select
              value={selectedCollectorId}
              onChange={(e) => setSelectedCollectorId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="">Choose a collector...</option>
              {collectors.map((collector) => (
                <option key={collector.id} value={collector.id}>
                  {collector.full_name} ({collector.email}) - {collector.role.charAt(0).toUpperCase() + collector.role.slice(1)}
                </option>
              ))}
            </select>
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

        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <div>
            {existingAssignment && (
              <button
                onClick={handleUnassign}
                className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors"
                disabled={loading}
              >
                Remove Assignment
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
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
              {loading ? 'Assigning...' : existingAssignment ? 'Reassign' : 'Assign Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
