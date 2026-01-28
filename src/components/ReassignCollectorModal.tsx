import { useState, useEffect } from 'react';
import { X, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Collector {
  id: string;
  email: string;
  role: string;
  full_name: string;
  assigned_invoices: number;
  assigned_customers: number;
}

interface ReassignCollectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceRef: string;
  currentCollectorId?: string;
  onReassigned?: () => void;
}

export default function ReassignCollectorModal({
  isOpen,
  onClose,
  invoiceId,
  invoiceRef,
  currentCollectorId,
  onReassigned
}: ReassignCollectorModalProps) {
  const { profile } = useAuth();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [selectedCollectorId, setSelectedCollectorId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCollectors();
      setSelectedCollectorId(currentCollectorId || '');
      setNotes('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, currentCollectorId]);

  const loadCollectors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_available_collectors');

      if (error) throw error;
      setCollectors(data || []);
    } catch (error) {
      console.error('Error loading collectors:', error);
      setError('Failed to load collectors');
    } finally {
      setLoading(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedCollectorId) {
      setError('Please select a collector');
      return;
    }

    if (!profile?.id) {
      setError('You must be logged in to reassign collectors');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: reassignError } = await supabase.rpc('reassign_invoice_collector', {
        p_invoice_id: invoiceId,
        p_new_collector_id: selectedCollectorId,
        p_assigned_by: profile.id,
        p_notes: notes || null
      });

      if (reassignError) throw reassignError;

      setSuccess(true);
      setTimeout(() => {
        onReassigned?.();
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('Error reassigning collector:', error);
      setError(error.message || 'Failed to reassign collector');
    } finally {
      setSaving(false);
    }
  };

  const getCollectorBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-700',
      manager: 'bg-blue-100 text-blue-700',
      collector: 'bg-green-100 text-green-700',
      viewer: 'bg-gray-100 text-gray-700',
    };
    return colors[role] || colors.viewer;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">Reassign Collector</h2>
              <p className="text-sm text-blue-100">Invoice: {invoiceRef}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Success!</p>
                <p className="text-sm text-green-700">Collector has been reassigned successfully</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Collector
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {collectors.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">No collectors available</p>
                  ) : (
                    collectors.map((collector) => (
                      <label
                        key={collector.id}
                        className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedCollectorId === collector.id
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        } ${currentCollectorId === collector.id ? 'ring-2 ring-yellow-400' : ''}`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="radio"
                            name="collector"
                            value={collector.id}
                            checked={selectedCollectorId === collector.id}
                            onChange={(e) => setSelectedCollectorId(e.target.value)}
                            className="w-4 h-4 text-blue-600"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">
                                {collector.full_name}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${getCollectorBadge(collector.role)}`}>
                                {collector.role}
                              </span>
                              {currentCollectorId === collector.id && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">
                                  Current
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{collector.email}</p>
                            <div className="flex items-center gap-4 mt-1">
                              <span className="text-xs text-gray-500">
                                {collector.assigned_invoices} invoices
                              </span>
                              <span className="text-xs text-gray-500">
                                {collector.assigned_customers} customers
                              </span>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this reassignment..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleReassign}
            disabled={saving || loading || !selectedCollectorId || success}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Reassigning...
              </>
            ) : (
              'Reassign Collector'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
