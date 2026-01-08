import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Mail, RefreshCw, Inbox, Star, Archive, Trash2,
  AlertOctagon, Send, Calendar, Paperclip, Search, Tag,
  MoreVertical, ChevronDown, Clock, LogOut, User, Lock
} from 'lucide-react';
import EmailDetailView from './EmailDetailView';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';

type InboundEmail = {
  id: string;
  customer_id: string | null;
  sender_email: string;
  subject: string;
  body: string;
  received_at: string;
  processing_status: string;
  is_read: boolean;
  is_starred: boolean;
  is_important: boolean;
  folder: string;
  thread_id: string | null;
  normalized_subject: string | null;
  customers?: {
    id: string;
    name: string;
    email: string;
  } | null;
  email_analysis?: {
    detected_intent: string;
    confidence_score: number;
    action_taken: string;
    reasoning?: string;
  }[];
  customer_files?: {
    id: string;
    filename: string;
  }[];
};

type InboxDashboardProps = {
  onBack?: () => void;
};

export default function InboxDashboard({ onBack }: InboxDashboardProps) {
  const { user, signOut } = useAuth();
  const { hasPermission } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.EMAIL_INBOX, 'view');
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string>('inbox');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchFilters, setShowSearchFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const PAGE_SIZE = 20;

  // Advanced search filters
  const [hasAttachments, setHasAttachments] = useState<boolean | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    setCurrentPage(0);
    loadEmails(true);
    loadUnreadCounts();
  }, [currentFolder]);

  useEffect(() => {
    loadUnreadCounts();
    const interval = setInterval(loadUnreadCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuId) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  const loadEmails = async (reset = false) => {
    setLoading(true);
    try {
      const page = reset ? 0 : currentPage;
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (currentFolder === 'sent') {
        const { data: sentReplies, error: sentError } = await supabase
          .from('outbound_replies')
          .select(`
            id,
            subject,
            body,
            sent_at,
            recipient_email,
            inbound_email_id,
            inbound_emails (
              id,
              customer_id,
              customers (id, name, email)
            )
          `)
          .order('sent_at', { ascending: false })
          .range(from, to);

        if (sentError) throw sentError;

        const transformedData = (sentReplies || []).map(reply => ({
          id: reply.id,
          customer_id: reply.inbound_emails?.customer_id || null,
          sender_email: reply.recipient_email,
          subject: reply.subject,
          body: reply.body,
          received_at: reply.sent_at,
          processing_status: 'sent',
          is_read: true,
          is_starred: false,
          is_important: false,
          folder: 'sent',
          thread_id: null,
          normalized_subject: null,
          customers: reply.inbound_emails?.customers || null,
          email_analysis: [],
          customer_files: [],
        }));

        if (reset) {
          setEmails(transformedData);
          setCurrentPage(0);
        } else {
          setEmails(prev => [...prev, ...transformedData]);
        }

        setHasMore(transformedData.length === PAGE_SIZE);
      } else {
        let query = supabase
          .from('inbound_emails')
          .select(`
            *,
            customers (id, name, email),
            email_analysis (detected_intent, confidence_score, action_taken, reasoning),
            customer_files (id, filename)
          `);

        if (currentFolder === 'starred') {
          query = query.eq('is_starred', true);
        } else {
          query = query.eq('folder', currentFolder);
        }

        query = query
          .order('received_at', { ascending: false })
          .range(from, to);

        const { data, error } = await query;

        if (error) throw error;

        if (reset) {
          setEmails(data || []);
          setCurrentPage(0);
        } else {
          setEmails(prev => [...prev, ...(data || [])]);
        }

        setHasMore(data && data.length === PAGE_SIZE);
      }
    } catch (error) {
      console.error('Error loading emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm && !hasAttachments && !dateFrom && !dateTo && !selectedMonth) {
      setCurrentPage(0);
      loadEmails(true);
      return;
    }

    setLoading(true);
    try {
      let dateFromParam = dateFrom ? new Date(dateFrom).toISOString() : null;
      let dateToParam = dateTo ? new Date(dateTo).toISOString() : null;

      if (selectedMonth) {
        const [year, month] = selectedMonth.split('-');
        dateFromParam = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString();
        dateToParam = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59).toISOString();
      }

      const { data, error } = await supabase.rpc('search_emails', {
        search_query: searchTerm || null,
        folder_filter: currentFolder,
        has_attachments: hasAttachments,
        date_from: dateFromParam,
        date_to: dateToParam
      });

      if (error) throw error;

      const emailIds = data.map((e: any) => e.id);
      const batchSize = 100;
      const allEmails: any[] = [];

      for (let i = 0; i < emailIds.length; i += batchSize) {
        const batch = emailIds.slice(i, i + batchSize);

        const { data: batchEmails, error: fetchError } = await supabase
          .from('inbound_emails')
          .select(`
            *,
            customers (id, name, email),
            email_analysis (detected_intent, confidence_score, action_taken, reasoning),
            customer_files (id, filename)
          `)
          .in('id', batch);

        if (fetchError) throw fetchError;
        if (batchEmails) allEmails.push(...batchEmails);
      }

      const sortedEmails = emailIds.map((id: string) =>
        allEmails?.find((e: any) => e.id === id)
      ).filter(Boolean);

      setEmails(sortedEmails as InboundEmail[]);
      setHasMore(false);
    } catch (error) {
      console.error('Error searching emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const moveToFolder = async (emailId: string, folder: string) => {
    try {
      await supabase.rpc('move_email_to_folder', {
        email_id: emailId,
        target_folder: folder
      });

      setEmails(emails.filter(e => e.id !== emailId));
      loadUnreadCounts();
    } catch (error) {
      console.error('Error moving email:', error);
    }
  };

  const toggleStar = async (emailId: string, currentState: boolean) => {
    try {
      await supabase
        .from('inbound_emails')
        .update({ is_starred: !currentState })
        .eq('id', emailId);

      setEmails(emails.map(e =>
        e.id === emailId ? { ...e, is_starred: !currentState } : e
      ));
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const handleEmailClick = async (email: InboundEmail) => {
    setSelectedEmail(email);

    if (!email.is_read) {
      await supabase
        .from('inbound_emails')
        .update({ is_read: true })
        .eq('id', email.id);

      setEmails(emails.map(e => e.id === email.id ? { ...e, is_read: true } : e));
      loadUnreadCounts();
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setHasAttachments(null);
    setDateFrom('');
    setDateTo('');
    setSelectedMonth('');
    setCurrentPage(0);
    loadEmails(true);
  };

  const loadNextPage = async () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);

    setLoading(true);
    try {
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (currentFolder === 'sent') {
        const { data: sentReplies, error: sentError } = await supabase
          .from('outbound_replies')
          .select(`
            id,
            subject,
            body,
            sent_at,
            recipient_email,
            inbound_email_id,
            inbound_emails (
              id,
              customer_id,
              customers (id, name, email)
            )
          `)
          .order('sent_at', { ascending: false })
          .range(from, to);

        if (sentError) throw sentError;

        const transformedData = (sentReplies || []).map(reply => ({
          id: reply.id,
          customer_id: reply.inbound_emails?.customer_id || null,
          sender_email: reply.recipient_email,
          subject: reply.subject,
          body: reply.body,
          received_at: reply.sent_at,
          processing_status: 'sent',
          is_read: true,
          is_starred: false,
          is_important: false,
          folder: 'sent',
          thread_id: null,
          normalized_subject: null,
          customers: reply.inbound_emails?.customers || null,
          email_analysis: [],
          customer_files: [],
        }));

        setEmails(prev => [...prev, ...transformedData]);
        setHasMore(transformedData.length === PAGE_SIZE);
      } else {
        let query = supabase
          .from('inbound_emails')
          .select(`
            *,
            customers (id, name, email),
            email_analysis (detected_intent, confidence_score, action_taken, reasoning),
            customer_files (id, filename)
          `);

        if (currentFolder === 'starred') {
          query = query.eq('is_starred', true);
        } else {
          query = query.eq('folder', currentFolder);
        }

        query = query
          .order('received_at', { ascending: false })
          .range(from, to);

        const { data, error } = await query;

        if (error) throw error;

        setEmails(prev => [...prev, ...(data || [])]);
        setHasMore(data && data.length === PAGE_SIZE);
      }
    } catch (error) {
      console.error('Error loading next page:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCounts = async () => {
    try {
      const folderList = ['inbox', 'starred', 'archive', 'spam', 'trash'];
      const counts: Record<string, number> = {};

      for (const folder of folderList) {
        if (folder === 'starred') {
          const { count, error } = await supabase
            .from('inbound_emails')
            .select('*', { count: 'exact', head: true })
            .eq('is_starred', true);

          if (!error) counts[folder] = count || 0;
        } else if (folder === 'archive') {
          const { count, error } = await supabase
            .from('inbound_emails')
            .select('*', { count: 'exact', head: true })
            .eq('folder', folder);

          if (!error) counts[folder] = count || 0;
        } else {
          const { count, error } = await supabase
            .from('inbound_emails')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false)
            .eq('folder', folder);

          if (!error) counts[folder] = count || 0;
        }
      }

      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error loading unread counts:', error);
    }
  };

  const getFolderIcon = (folder: string) => {
    switch (folder) {
      case 'inbox': return <Inbox size={20} />;
      case 'starred': return <Star size={20} />;
      case 'sent': return <Send size={20} />;
      case 'archive': return <Archive size={20} />;
      case 'spam': return <AlertOctagon size={20} />;
      case 'trash': return <Trash2 size={20} />;
      default: return <Mail size={20} />;
    }
  };

  const folders = [
    { id: 'inbox', label: 'Inbox', count: unreadCounts['inbox'] || 0 },
    { id: 'starred', label: 'Starred', count: unreadCounts['starred'] || 0 },
    { id: 'sent', label: 'Sent', count: 0 },
    { id: 'archive', label: 'Archive', count: unreadCounts['archive'] || 0 },
    { id: 'spam', label: 'Spam', count: unreadCounts['spam'] || 0 },
    { id: 'trash', label: 'Trash', count: unreadCounts['trash'] || 0 },
  ];

  const unreadCount = (() => {
    if (currentFolder === 'starred') {
      return emails.filter(e => !e.is_read && e.is_starred).length;
    }
    if (currentFolder === 'sent') {
      return 0;
    }
    return emails.filter(e => !e.is_read && e.folder === currentFolder).length;
  })();

  // Check permission
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You do not have permission to view Email Inbox.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (selectedEmail) {
    return (
      <EmailDetailView
        email={selectedEmail}
        onBack={() => {
          setSelectedEmail(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex">
      <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Back</span>
        </button>

        <button
          onClick={() => {
            setCurrentPage(0);
            loadEmails(true);
            loadUnreadCounts();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium mb-6 transition-colors shadow-sm"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>

        <nav className="space-y-1 flex-1">
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => setCurrentFolder(folder.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                currentFolder === folder.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {getFolderIcon(folder.id)}
              <span className="flex-1 text-left text-sm">{folder.label}</span>
              {folder.count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  currentFolder === folder.id
                    ? 'bg-blue-200 text-blue-800'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {folder.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-slate-200 p-4">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <User size={20} className="text-slate-600" />
                <span className="text-sm text-slate-700">{user?.email}</span>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search emails..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setShowSearchFilters(!showSearchFilters)}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Tag size={18} />
                <span className="text-sm">Filters</span>
                <ChevronDown size={16} className={`transition-transform ${showSearchFilters ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={handleSearch}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Search
              </button>
            </div>

            {showSearchFilters && (
              <div className="p-4 bg-slate-50 rounded-lg space-y-3 border border-slate-200">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Has Attachments</label>
                    <select
                      value={hasAttachments === null ? '' : hasAttachments.toString()}
                      onChange={(e) => setHasAttachments(e.target.value === '' ? null : e.target.value === 'true')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All</option>
                      <option value="true">With Attachments</option>
                      <option value="false">No Attachments</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">From Date</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setSelectedMonth('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">To Date</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setSelectedMonth('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Or Search by Month</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 capitalize">
                {currentFolder}
                {unreadCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-600">
                    ({unreadCount} unread)
                  </span>
                )}
              </h2>
            </div>

            {loading ? (
              <div className="text-center py-16">
                <RefreshCw className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
                <p className="text-slate-600">Loading emails...</p>
              </div>
            ) : emails.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-lg border border-slate-200">
                <Inbox className="text-slate-300 mx-auto mb-4" size={48} />
                <p className="text-slate-600 mb-2">
                  {searchTerm || hasAttachments !== null || dateFrom || dateTo || selectedMonth
                    ? 'No emails match your search'
                    : `No emails in ${currentFolder}`}
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200">
                  {emails.map((email) => {
                    const hasAttachment = (email.customer_files?.length || 0) > 0;

                    return (
                      <div
                        key={email.id}
                        className={`flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors ${
                          !email.is_read ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStar(email.id, email.is_starred);
                          }}
                          className="flex-shrink-0"
                        >
                          <Star
                            size={18}
                            className={`${
                              email.is_starred
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-slate-300 hover:text-yellow-400'
                            } transition-colors`}
                          />
                        </button>

                        <div
                          onClick={() => handleEmailClick(email)}
                          className="flex-1 cursor-pointer min-w-0"
                        >
                          <div className="flex items-center gap-3 mb-1">
                            {!email.is_read && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                            )}
                            <span className={`font-medium truncate ${!email.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                              {email.customers?.name || email.sender_email}
                            </span>
                            {hasAttachment && (
                              <Paperclip size={14} className="text-slate-400 flex-shrink-0" />
                            )}
                          </div>
                          <p className={`text-sm mb-1 truncate ${!email.is_read ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                            {email.subject || '(No Subject)'}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {email.body.substring(0, 100)}...
                          </p>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-slate-500">
                            {new Date(email.received_at).toLocaleDateString()}
                          </span>

                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === email.id ? null : email.id);
                              }}
                              className="p-1 hover:bg-slate-200 rounded transition-colors"
                            >
                              <MoreVertical size={16} className="text-slate-400" />
                            </button>
                            {openMenuId === email.id && (
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10">
                                {currentFolder !== 'archive' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveToFolder(email.id, 'archive');
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Archive size={14} />
                                    Archive
                                  </button>
                                )}
                                {currentFolder !== 'spam' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveToFolder(email.id, 'spam');
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <AlertOctagon size={14} />
                                    Mark as Spam
                                  </button>
                                )}
                                {currentFolder !== 'trash' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveToFolder(email.id, 'trash');
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-red-600"
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                )}
                                {currentFolder === 'trash' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveToFolder(email.id, 'inbox');
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Inbox size={14} />
                                    Restore
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {hasMore && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={loadNextPage}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition-colors shadow-sm"
                    >
                      {loading ? (
                        <>
                          <RefreshCw size={18} className="animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <span>Next</span>
                          <ChevronDown size={18} className="rotate-[-90deg]" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
