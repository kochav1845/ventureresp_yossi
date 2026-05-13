import { useState, useEffect } from 'react';
import {
  Users, Shield, X, Lock, Unlock,
  UserCircle, Activity, ArrowLeft, UserCog, Trash,
  Settings, Mail, Code, FileText, DollarSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { LOCKABLE_COMPONENTS, COMPONENT_LABELS, LockableComponent } from '../lib/permissions';
import UserActivityLog from './UserActivityLog';

interface User {
  id: string;
  email: string;
  role: string;
  assigned_color: string | null;
  can_be_assigned_as_collector: boolean;
}

interface ComponentLock {
  component_key: string;
  is_locked: boolean;
}

interface UserManagementSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'blue', description: 'Full access to all features' },
  { value: 'manager', label: 'Manager', color: 'teal', description: 'Management and analytics access' },
  { value: 'collector', label: 'Collector', color: 'green', description: 'Customer and collection access' },
  { value: 'viewer', label: 'Viewer', color: 'gray', description: 'Read-only access' },
];

const COMPONENT_ICONS: Record<string, any> = {
  settings: Settings,
  email_system: Mail,
  developer_settings: Code,
  invoice_analytics: FileText,
  payment_analytics: DollarSign,
};

const ALL_COMPONENT_KEYS = Object.values(LOCKABLE_COMPONENTS);

export default function UserManagementSidebar({ onClose, isOpen }: UserManagementSidebarProps) {
  const { profile, impersonateUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [locks, setLocks] = useState<ComponentLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedUser) {
      loadUserLocks();
    }
  }, [selectedUser]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role, assigned_color, can_be_assigned_as_collector')
        .order('email');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserLocks = async () => {
    if (!selectedUser) return;

    try {
      const { data, error } = await supabase
        .from('user_component_locks')
        .select('component_key, is_locked')
        .eq('user_id', selectedUser.id);

      if (error) throw error;
      setLocks(data || []);
    } catch (error) {
      console.error('Error loading component locks:', error);
    }
  };

  const isLocked = (componentKey: string): boolean => {
    const lock = locks.find(l => l.component_key === componentKey);
    return lock?.is_locked ?? false;
  };

  const toggleLock = async (componentKey: string) => {
    if (!selectedUser) return;

    const currentlyLocked = isLocked(componentKey);
    setSaving(true);

    try {
      const { error } = await supabase
        .from('user_component_locks')
        .upsert({
          user_id: selectedUser.id,
          component_key: componentKey,
          is_locked: !currentlyLocked,
          updated_by: profile?.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,component_key' });

      if (error) throw error;
      await loadUserLocks();
    } catch (error) {
      console.error('Error toggling lock:', error);
      alert('Failed to update component lock');
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev =>
        prev.map(user =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );

      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, role: newRole } : null);
      }
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const updateColor = async (userId: string, newColor: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ assigned_color: newColor })
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev =>
        prev.map(user =>
          user.id === userId ? { ...user, assigned_color: newColor } : user
        )
      );

      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, assigned_color: newColor } : null);
      }
    } catch (error) {
      console.error('Error updating color:', error);
      alert('Failed to update color');
    } finally {
      setSaving(false);
    }
  };

  const toggleCollectorAssignment = async (userId: string, canBeCollector: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ can_be_assigned_as_collector: canBeCollector })
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev =>
        prev.map(user =>
          user.id === userId ? { ...user, can_be_assigned_as_collector: canBeCollector } : user
        )
      );

      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, can_be_assigned_as_collector: canBeCollector } : null);
      }
    } catch (error) {
      console.error('Error updating collector assignment:', error);
      alert('Failed to update collector assignment');
    } finally {
      setSaving(false);
    }
  };

  const unlockAll = async () => {
    if (!selectedUser) return;
    if (!confirm('Unlock all components for this user?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_component_locks')
        .delete()
        .eq('user_id', selectedUser.id);

      if (error) throw error;
      setLocks([]);
    } catch (error) {
      console.error('Error unlocking all:', error);
      alert('Failed to unlock all components');
    } finally {
      setSaving(false);
    }
  };

  const handleImpersonate = async (userId: string) => {
    if (userId === profile?.id) {
      alert('You cannot impersonate yourself');
      return;
    }

    if (!confirm('Start impersonating this user? You will see and act with their exact permissions.')) return;

    setImpersonating(true);
    try {
      await impersonateUser(userId);
      onClose();
      window.location.reload();
    } catch (error: any) {
      console.error('Error impersonating user:', error);
      alert(error.message || 'Failed to impersonate user');
    } finally {
      setImpersonating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (selectedUser.id === profile?.id) {
      alert('You cannot delete your own account');
      return;
    }

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('force-delete-user', {
        body: { email: selectedUser.email }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setShowDeleteConfirm(false);
      setSelectedUser(null);
      await loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert(error.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  const lockedCount = locks.filter(l => l.is_locked).length;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 h-full w-full max-w-4xl bg-white shadow-2xl z-50 overflow-y-auto">
        {!selectedUser ? (
          <>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-blue-600" />
                  <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              <p className="text-sm text-gray-600">Manage user roles and component access</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No users found</p>
              </div>
            ) : (
              <div className="p-6">
                <div className="grid gap-4">
                  {users.map((user) => {
                    const roleConfig = ROLES.find(r => r.value === user.role) || ROLES[3];
                    return (
                      <div
                        key={user.id}
                        className="bg-white rounded-lg p-6 border-2 border-gray-200 hover:border-blue-400 transition-all cursor-pointer hover:shadow-md"
                        onClick={() => setSelectedUser(user)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div
                              className="w-12 h-12 rounded-full border-4 border-gray-300 flex-shrink-0"
                              style={{ backgroundColor: user.assigned_color || '#e5e7eb' }}
                            />
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 text-lg">{user.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Shield className="w-4 h-4 text-gray-500" />
                                <span className="text-sm font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-800">
                                  {roleConfig.label}
                                </span>
                                <span className="text-xs text-gray-500">{roleConfig.description}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-blue-600 font-medium">Manage &rarr;</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
              <div className="text-sm text-gray-600 space-y-3">
                <p className="font-semibold text-gray-800 text-base mb-3">Role Descriptions:</p>
                {ROLES.map(role => (
                  <div key={role.value} className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-gray-800">{role.label}:</span>
                      <span className="ml-2 text-gray-700">{role.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-medium">Back to Users</span>
              </button>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full border-4 border-gray-300"
                    style={{ backgroundColor: selectedUser.assigned_color || '#e5e7eb' }}
                  />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{selectedUser.email}</h2>
                    <p className="text-sm text-gray-600">Configure role and component access</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* User Settings */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">User Settings</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleImpersonate(selectedUser.id)}
                      disabled={impersonating || selectedUser.id === profile?.id}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserCog className="w-4 h-4" />
                      {impersonating ? 'Starting...' : 'Impersonate User'}
                    </button>
                    <button
                      onClick={() => setShowActivityLog(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Activity className="w-4 h-4" />
                      View Activity Log
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Shield className="w-4 h-4 inline mr-2" />
                      Role
                    </label>
                    <select
                      value={selectedUser.role}
                      onChange={(e) => updateRole(selectedUser.id, e.target.value)}
                      disabled={saving}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {ROLES.map(role => (
                        <option key={role.value} value={role.value}>
                          {role.label} - {role.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      User Color
                    </label>
                    <input
                      type="color"
                      value={selectedUser.assigned_color || '#e5e7eb'}
                      onChange={(e) => updateColor(selectedUser.id, e.target.value)}
                      disabled={saving}
                      className="w-full h-10 rounded-lg cursor-pointer disabled:opacity-50 border-2 border-gray-300"
                    />
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <UserCog className="w-5 h-5 text-blue-600" />
                      <div>
                        <span className="text-sm font-medium text-gray-900 block">
                          Can Be Assigned as Collector
                        </span>
                        <span className="text-xs text-gray-500">
                          Allow this user to be assigned to invoices and customers
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCollectorAssignment(selectedUser.id, !selectedUser.can_be_assigned_as_collector)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                        selectedUser.can_be_assigned_as_collector ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          selectedUser.can_be_assigned_as_collector ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                  <button
                    onClick={unlockAll}
                    disabled={saving || lockedCount === 0}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 flex items-center gap-1"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unlock All Components
                  </button>
                  {selectedUser.id !== profile?.id && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={saving || deleting}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash className="w-4 h-4" />
                      Delete User
                    </button>
                  )}
                </div>
              </div>

              {/* Component Access */}
              <div className="bg-white rounded-lg border-2 border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Component Access</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Lock or unlock specific sections for this user.
                        {selectedUser.role === 'admin' && (
                          <span className="ml-1 text-blue-600 font-medium">Admins always have full access regardless of locks.</span>
                        )}
                      </p>
                    </div>
                    {lockedCount > 0 && (
                      <span className="text-sm font-medium px-3 py-1 rounded-full bg-red-100 text-red-700">
                        {lockedCount} locked
                      </span>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-gray-100">
                  {ALL_COMPONENT_KEYS.map((key) => {
                    const label = COMPONENT_LABELS[key as LockableComponent];
                    const Icon = COMPONENT_ICONS[key] || UserCircle;
                    const locked = isLocked(key);

                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between px-6 py-5 transition-colors ${
                          locked ? 'bg-red-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            locked ? 'bg-red-100' : 'bg-blue-50'
                          }`}>
                            <Icon className={`w-5 h-5 ${locked ? 'text-red-600' : 'text-blue-600'}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{label.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{label.description}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleLock(key)}
                          disabled={saving}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-50 ${
                            locked
                              ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                              : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                          }`}
                        >
                          {locked ? (
                            <>
                              <Lock className="w-4 h-4" />
                              Locked
                            </>
                          ) : (
                            <>
                              <Unlock className="w-4 h-4" />
                              Unlocked
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete User</h3>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              Are you sure you want to permanently delete this user?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-semibold text-red-800">{selectedUser.email}</p>
              <p className="text-xs text-red-600 mt-1">
                This will remove the user from Supabase Auth, their profile, pending records, and all associated data. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash className="w-4 h-4" />
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showActivityLog && selectedUser && (
        <UserActivityLog
          userId={selectedUser.id}
          userName={selectedUser.email}
          onClose={() => setShowActivityLog(false)}
        />
      )}
    </>
  );
}
