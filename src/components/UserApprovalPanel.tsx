import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, User, Mail,
  AlertCircle, Search, Shield
} from 'lucide-react';

interface PendingUser {
  id: string;
  email: string;
  full_name: string;
  status: 'pending' | 'approved' | 'declined';
  declined_reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export default function UserApprovalPanel({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'declined'>('pending');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadPendingUsers();
  }, [filterStatus]);

  const loadPendingUsers = async () => {
    setLoading(true);
    let query = supabase
      .from('pending_users')
      .select('*')
      .order('requested_at', { ascending: false });

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data, error } = await query;

    if (data) {
      setPendingUsers(data);
    }
    setLoading(false);
  };

  const handleApprove = async (pendingUserId: string) => {
    setProcessing(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-pending-user`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ pending_user_id: pendingUserId })
      });

      const result = await response.json();

      if (result.success) {
        alert('User approved and account created successfully!');
        setSelectedUser(null);
        await loadPendingUsers();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err: any) {
      alert(`Error approving user: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async (pendingUserId: string) => {
    if (!declineReason.trim()) {
      alert('Please provide a reason for declining');
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('pending_users')
        .update({
          status: 'declined',
          declined_reason: declineReason,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', pendingUserId);

      if (error) throw error;

      alert('User declined');
      setSelectedUser(null);
      setDeclineReason('');
      await loadPendingUsers();
    } catch (err: any) {
      alert(`Error declining user: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const filteredUsers = pendingUsers.filter(u =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
            <Clock className="w-4 h-4" />
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Approved
          </span>
        );
      case 'declined':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
            <XCircle className="w-4 h-4" />
            Declined
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center text-white hover:text-blue-100 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Admin Dashboard
          </button>
          <h1 className="text-3xl font-bold">User Account Approval</h1>
          <p className="text-blue-100 mt-2">Review and approve new user registration requests</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Requests</option>
              <option value="pending">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-600">
                {filterStatus === 'pending'
                  ? 'No users waiting for approval'
                  : 'No users match your search criteria'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((pendingUser) => (
                <div
                  key={pendingUser.id}
                  className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                          {pendingUser.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{pendingUser.full_name}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-4 h-4" />
                            {pendingUser.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4 mt-3 text-sm text-gray-600">
                        <span>Requested: {new Date(pendingUser.requested_at).toLocaleString()}</span>
                        {pendingUser.reviewed_at && (
                          <span>Reviewed: {new Date(pendingUser.reviewed_at).toLocaleString()}</span>
                        )}
                      </div>

                      {pendingUser.declined_reason && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-800">
                            <strong>Decline Reason:</strong> {pendingUser.declined_reason}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      {getStatusBadge(pendingUser.status)}

                      {pendingUser.status === 'pending' && (
                        <button
                          onClick={() => setSelectedUser(pendingUser)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          Review
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Review User Request</h2>
              <p className="text-gray-600 mt-1">{selectedUser.email}</p>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-4">Account Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Full Name:</span>
                    <span className="font-medium">{selectedUser.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email:</span>
                    <span className="font-medium">{selectedUser.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Request Date:</span>
                    <span className="font-medium">{new Date(selectedUser.requested_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg mb-4">Decision</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Decline Reason (only if declining)
                    </label>
                    <textarea
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Reason for declining this account request..."
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> Approving will create the user's account and allow them to sign in immediately. Declining will notify the user that their request was not approved.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setDeclineReason('');
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDecline(selectedUser.id)}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                disabled={processing || !declineReason.trim()}
              >
                <XCircle className="w-5 h-5" />
                Decline
              </button>
              <button
                onClick={() => handleApprove(selectedUser.id)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                disabled={processing}
              >
                <CheckCircle className="w-5 h-5" />
                Approve & Create Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
