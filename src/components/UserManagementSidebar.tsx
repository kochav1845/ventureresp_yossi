import { useState, useEffect } from 'react';
import {
  Users, Shield, X, ChevronDown, ChevronRight, CheckSquare,
  Square, Eye, Edit, Plus, Trash, LayoutDashboard, TrendingUp,
  UserCircle, FileText, DollarSign, Mail, ClipboardList, Bell,
  Settings, Database, Activity, ArrowLeft, UserCog
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import UserActivityLog from './UserActivityLog';

interface User {
  id: string;
  email: string;
  role: string;
  assigned_color: string | null;
}

interface Permission {
  permission_key: string;
  permission_name: string;
  category: string;
  description: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  is_custom: boolean;
}

interface UserManagementSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'purple', description: 'Full access to all features' },
  { value: 'manager', label: 'Manager', color: 'blue', description: 'Management and analytics access' },
  { value: 'collector', label: 'Collector', color: 'green', description: 'Customer and collection access' },
  { value: 'viewer', label: 'Viewer', color: 'gray', description: 'Read-only access' },
];

const CATEGORY_ICONS: Record<string, any> = {
  'Dashboard & Analytics': TrendingUp,
  'Customer Management': UserCircle,
  'Invoice Management': FileText,
  'Payment Management': DollarSign,
  'Email System': Mail,
  'Reports & Documents': ClipboardList,
  'Reminders System': Bell,
  'System Administration': Settings,
  'Acumatica Integration': Database,
  'Monitoring & Logs': Activity,
};

export default function UserManagementSidebar({  onClose, isOpen }: UserManagementSidebarProps) {
  const { profile, impersonateUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
    console.warn(isOpen)
  }, [isOpen]);

  useEffect(() => {
    if (selectedUser) {
      loadUserPermissions();
    }
  }, [selectedUser]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role, assigned_color')
        .order('email');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserPermissions = async () => {
    if (!selectedUser) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_permissions', { user_uuid: selectedUser.id });

      if (error) throw error;
      setPermissions(data || []);

      const categories = new Set(data?.map((p: Permission) => p.category) || []);
      setExpandedCategories(categories);
    } catch (error) {
      console.error('Error loading permissions:', error);
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
        await loadUserPermissions();
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

  const updateCustomPermission = async (
    permissionKey: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete',
    value: boolean
  ) => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      const currentPerm = permissions.find(p => p.permission_key === permissionKey);
      if (!currentPerm) return;

      const newPermission = {
        user_id: selectedUser.id,
        permission_key: permissionKey,
        can_view: field === 'can_view' ? value : currentPerm.can_view,
        can_create: field === 'can_create' ? value : currentPerm.can_create,
        can_edit: field === 'can_edit' ? value : currentPerm.can_edit,
        can_delete: field === 'can_delete' ? value : currentPerm.can_delete,
      };

      const { error } = await supabase
        .from('user_custom_permissions')
        .upsert(newPermission, { onConflict: 'user_id,permission_key' });

      if (error) throw error;

      await loadUserPermissions();
    } catch (error) {
      console.error('Error updating permission:', error);
      alert('Failed to update permission');
    } finally {
      setSaving(false);
    }
  };

  const resetToRoleDefaults = async () => {
    if (!selectedUser) return;

    if (!confirm('Reset all custom permissions to role defaults?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_custom_permissions')
        .delete()
        .eq('user_id', selectedUser.id);

      if (error) throw error;

      await loadUserPermissions();
      alert('Permissions reset to role defaults');
    } catch (error) {
      console.error('Error resetting permissions:', error);
      alert('Failed to reset permissions');
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

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

 if (!isOpen) return null;

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
              <p className="text-sm text-gray-600">Manage user roles and permissions</p>
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
                                <Shield className={`w-4 h-4 text-${roleConfig.color}-600`} />
                                <span className={`text-sm font-medium px-3 py-1 rounded-full bg-${roleConfig.color}-100 text-${roleConfig.color}-800`}>
                                  {roleConfig.label}
                                </span>
                                <span className="text-xs text-gray-500">{roleConfig.description}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-blue-600 font-medium">Manage →</div>
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
                    <Shield className={`w-5 h-5 text-${role.color}-600 flex-shrink-0 mt-0.5`} />
                    <div>
                      <span className={`font-semibold text-${role.color}-800`}>{role.label}:</span>
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
                    <p className="text-sm text-gray-600">Configure role and permissions</p>
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
                  <button
                    onClick={resetToRoleDefaults}
                    disabled={saving}
                    className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    Reset to Role Defaults
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg border-2 border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Custom Permissions</h3>
                  <p className="text-sm text-gray-600">
                    Customize individual permissions to override role defaults. Custom permissions are highlighted.
                  </p>
                  <div className="flex gap-4 mt-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Eye className="w-3 h-3" />
                      <span>View</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Plus className="w-3 h-3" />
                      <span>Create</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Edit className="w-3 h-3" />
                      <span>Edit</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trash className="w-3 h-3" />
                      <span>Delete</span>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-gray-200">
                  {Object.entries(groupedPermissions).map(([category, perms]) => {
                    const Icon = CATEGORY_ICONS[category] || LayoutDashboard;
                    const isExpanded = expandedCategories.has(category);
                    const hasCustom = perms.some(p => p.is_custom);

                    return (
                      <div key={category}>
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5 text-gray-600" />
                            <span className="font-semibold text-gray-900">{category}</span>
                            {hasCustom && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                Custom
                              </span>
                            )}
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-6 pb-4 space-y-3 bg-gray-50">
                            {perms.map((perm) => (
                              <div
                                key={perm.permission_key}
                                className={`p-3 rounded-lg border-2 ${
                                  perm.is_custom
                                    ? 'bg-blue-50 border-blue-200'
                                    : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900 text-sm">
                                      {perm.permission_name}
                                      {perm.is_custom && (
                                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                          Custom
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">{perm.description}</p>
                                  </div>
                                </div>
                                <div className="flex gap-4">
                                  <button
                                    onClick={() => updateCustomPermission(perm.permission_key, 'can_view', !perm.can_view)}
                                    disabled={saving}
                                    className="flex items-center gap-1 text-xs hover:text-blue-600 transition-colors disabled:opacity-50"
                                  >
                                    {perm.can_view ? (
                                      <CheckSquare className="w-4 h-4 text-blue-600" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-400" />
                                    )}
                                    <Eye className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => updateCustomPermission(perm.permission_key, 'can_create', !perm.can_create)}
                                    disabled={saving}
                                    className="flex items-center gap-1 text-xs hover:text-green-600 transition-colors disabled:opacity-50"
                                  >
                                    {perm.can_create ? (
                                      <CheckSquare className="w-4 h-4 text-green-600" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-400" />
                                    )}
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => updateCustomPermission(perm.permission_key, 'can_edit', !perm.can_edit)}
                                    disabled={saving}
                                    className="flex items-center gap-1 text-xs hover:text-yellow-600 transition-colors disabled:opacity-50"
                                  >
                                    {perm.can_edit ? (
                                      <CheckSquare className="w-4 h-4 text-yellow-600" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-400" />
                                    )}
                                    <Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => updateCustomPermission(perm.permission_key, 'can_delete', !perm.can_delete)}
                                    disabled={saving}
                                    className="flex items-center gap-1 text-xs hover:text-red-600 transition-colors disabled:opacity-50"
                                  >
                                    {perm.can_delete ? (
                                      <CheckSquare className="w-4 h-4 text-red-600" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-400" />
                                    )}
                                    <Trash className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

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
