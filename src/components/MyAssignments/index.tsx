import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Ticket, FileText, ArrowLeft, DollarSign, CheckSquare, Square } from 'lucide-react';
import InvoiceMemoModal from '../InvoiceMemoModal';
import { Assignment, TicketGroup, CustomerAssignment, TicketStatusOption } from './types';
import TicketCard from './TicketCard';
import IndividualInvoiceCard from './IndividualInvoiceCard';
import CustomerAssignmentCard from './CustomerAssignmentCard';
import BatchActionToolbar from './BatchActionToolbar';
import BatchNoteModal from './BatchNoteModal';
import PromiseDateModal from './PromiseDateModal';

interface MyAssignmentsProps {
  onBack?: () => void;
}

export default function MyAssignments({ onBack }: MyAssignmentsProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketGroup[]>([]);
  const [individualAssignments, setIndividualAssignments] = useState<Assignment[]>([]);
  const [customerAssignments, setCustomerAssignments] = useState<CustomerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<'tickets' | 'individual' | 'customers'>('tickets');
  const [memoModalInvoice, setMemoModalInvoice] = useState<any>(null);
  const [changingColorForInvoice, setChangingColorForInvoice] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [showBatchColorMenu, setShowBatchColorMenu] = useState(false);
  const [showBatchNoteModal, setShowBatchNoteModal] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [createReminder, setCreateReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [processingBatch, setProcessingBatch] = useState(false);
  const [changingTicketStatus, setChangingTicketStatus] = useState<string | null>(null);
  const [promiseDateModalInvoice, setPromiseDateModalInvoice] = useState<string | null>(null);
  const [statusOptions, setStatusOptions] = useState<TicketStatusOption[]>([]);

  useEffect(() => {
    if (user && profile) {
      loadStatusOptions();
      loadAssignments();
    }
  }, [user, profile]);

  const loadStatusOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_status_options')
        .select('id, status_name, display_name, color_class, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setStatusOptions(data || []);
    } catch (error) {
      console.error('Error loading status options:', error);
    }
  };

  const loadAssignments = async () => {
    if (!user || !profile) return;

    setLoading(true);
    try {
      const { data: assignments, error } = await supabase
        .from('collector_assignment_details')
        .select('*')
        .eq('assigned_collector_id', profile.id);

      if (error) throw error;

      if (assignments) {
        const ticketGroups = new Map<string, TicketGroup>();
        const individualList: Assignment[] = [];

        assignments.forEach((assignment: Assignment) => {
          if (assignment.ticket_id) {
            if (!ticketGroups.has(assignment.ticket_id)) {
              ticketGroups.set(assignment.ticket_id, {
                ticket_id: assignment.ticket_id,
                ticket_number: assignment.ticket_number || '',
                ticket_status: assignment.ticket_status || '',
                ticket_priority: assignment.ticket_priority || '',
                customer_id: assignment.customer,
                customer_name: assignment.customer_name,
                invoices: []
              });
            }
            ticketGroups.get(assignment.ticket_id)!.invoices.push(assignment);
          } else {
            individualList.push(assignment);
          }
        });

        const ticketGroupsArray = Array.from(ticketGroups.values());
        await Promise.all(ticketGroupsArray.map(async (ticket) => {
          // Fetch promise date info from collection_tickets
          const { data: ticketData } = await supabase
            .from('collection_tickets')
            .select('promise_date, promise_by_user_id')
            .eq('id', ticket.ticket_id)
            .maybeSingle();

          if (ticketData) {
            ticket.promise_date = ticketData.promise_date;

            // Fetch promise_by user name if exists
            if (ticketData.promise_by_user_id) {
              const { data: userData } = await supabase
                .from('user_profiles')
                .select('full_name')
                .eq('id', ticketData.promise_by_user_id)
                .maybeSingle();

              ticket.promise_by_user_name = userData?.full_name || null;
            }
          }

          const { data: lastStatus } = await supabase
            .from('ticket_status_history')
            .select('new_status, changed_at, changed_by, user_profiles!ticket_status_history_changed_by_fkey(full_name)')
            .eq('ticket_id', ticket.ticket_id)
            .order('changed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastStatus) {
            ticket.last_status_change = {
              status: lastStatus.new_status,
              changed_at: lastStatus.changed_at,
              changed_by_name: (lastStatus as any).user_profiles?.full_name || 'Unknown'
            };
          }

          const { data: lastActivity } = await supabase
            .from('ticket_activity_log')
            .select('description, created_at, created_by, user_profiles!ticket_activity_log_created_by_fkey(full_name)')
            .eq('ticket_id', ticket.ticket_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastActivity) {
            ticket.last_activity = {
              description: lastActivity.description,
              created_at: lastActivity.created_at,
              created_by_name: (lastActivity as any).user_profiles?.full_name || 'Unknown'
            };
          }
        }));

        setTickets(ticketGroupsArray);
        setIndividualAssignments(individualList);
      }

      const { data: custAssignments, error: custError } = await supabase
        .from('collector_customer_assignment_details')
        .select('*')
        .eq('assigned_collector_id', profile.id);

      if (!custError && custAssignments) {
        setCustomerAssignments(custAssignments);
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const colorPickers = document.querySelectorAll('.color-picker-container');
      let clickedInside = false;

      colorPickers.forEach((picker) => {
        if (picker.contains(event.target as Node)) {
          clickedInside = true;
        }
      });

      if (!clickedInside) {
        setChangingColorForInvoice(null);
      }

      const batchColorMenu = document.querySelector('.batch-color-menu');
      if (batchColorMenu && !batchColorMenu.contains(event.target as Node)) {
        const trigger = document.querySelector('.batch-color-trigger');
        if (trigger && !trigger.contains(event.target as Node)) {
          setShowBatchColorMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorChange = async (invoiceRefNumber: string, newColor: string | null) => {
    if (!profile?.id) return;

    if (newColor === 'green') {
      setPromiseDateModalInvoice(invoiceRefNumber);
      return;
    }

    if (newColor === 'yellow') {
      const wantsReminder = window.confirm('Do you want to add a reminder for this invoice?');
      if (wantsReminder) {
        try {
          await supabase.rpc('update_invoice_color_status_by_ref', {
            p_reference_number: invoiceRefNumber,
            p_color_status: newColor,
            p_user_id: profile.id
          });

          const { data: invoice } = await supabase
            .from('acumatica_invoices')
            .select('id, reference_number, customer_name')
            .eq('reference_number', invoiceRefNumber)
            .maybeSingle();

          if (!invoice) throw new Error('Invoice not found');

          navigate('/reminders', {
            state: {
              createReminder: true,
              invoiceId: invoice.id,
              invoiceReference: invoice.reference_number,
              customerName: invoice.customer_name
            }
          });
        } catch (error: any) {
          console.error('Error changing color:', error);
          alert('Failed to change color: ' + error.message);
        }
        return;
      }
    }

    try {
      await supabase.rpc('update_invoice_color_status_by_ref', {
        p_reference_number: invoiceRefNumber,
        p_color_status: newColor,
        p_user_id: profile.id
      });

      setChangingColorForInvoice(null);
      await loadAssignments();
    } catch (error: any) {
      console.error('Error changing color:', error);
      alert('Failed to change color: ' + error.message);
    }
  };

  const handlePromiseDateConfirm = async (promiseDate: string) => {
    if (!profile?.id || !promiseDateModalInvoice) return;

    try {
      const { data: invoice } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, customer_name')
        .eq('reference_number', promiseDateModalInvoice)
        .maybeSingle();

      if (!invoice) throw new Error('Invoice not found');

      await supabase
        .from('acumatica_invoices')
        .update({
          color_status: 'green',
          promise_date: promiseDate,
          promise_by_user_id: profile.id
        })
        .eq('reference_number', promiseDateModalInvoice);

      await supabase.from('invoice_activity_log').insert({
        invoice_id: invoice.id,
        user_id: profile.id,
        activity_type: 'color_status_change',
        old_value: null,
        new_value: 'green',
        description: `Marked as "Will Pay" with promise date: ${promiseDate}`
      });

      setPromiseDateModalInvoice(null);

      const wantsReminder = window.confirm('Do you want to create a reminder for this promise date?');
      if (wantsReminder) {
        navigate('/reminders', {
          state: {
            createReminder: true,
            invoiceId: invoice.id,
            invoiceReference: invoice.reference_number,
            customerName: invoice.customer_name,
            promiseDate: promiseDate
          }
        });
      } else {
        setChangingColorForInvoice(null);
        await loadAssignments();
      }
    } catch (error: any) {
      console.error('Error setting promise date:', error);
      alert('Failed to set promise date: ' + error.message);
      setPromiseDateModalInvoice(null);
    }
  };

  const toggleInvoiceSelection = (invoiceRefNumber: string) => {
    const newSelection = new Set(selectedInvoices);
    if (newSelection.has(invoiceRefNumber)) {
      newSelection.delete(invoiceRefNumber);
    } else {
      newSelection.add(invoiceRefNumber);
    }
    setSelectedInvoices(newSelection);
  };

  const toggleSelectAll = () => {
    const allInvoices: string[] = [];

    if (selectedView === 'tickets') {
      tickets.forEach(ticket => {
        ticket.invoices.forEach(inv => allInvoices.push(inv.invoice_reference_number));
      });
    } else if (selectedView === 'individual') {
      individualAssignments.forEach(inv => allInvoices.push(inv.invoice_reference_number));
    }

    if (selectedInvoices.size === allInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(allInvoices));
    }
  };

  const handleBatchColorChange = async (newColor: string | null) => {
    if (!profile?.id || selectedInvoices.size === 0) return;

    setProcessingBatch(true);
    try {
      await supabase.rpc('batch_update_invoice_color_status_by_refs', {
        p_reference_numbers: Array.from(selectedInvoices),
        p_color_status: newColor,
        p_user_id: profile.id
      });

      setShowBatchColorMenu(false);
      setSelectedInvoices(new Set());
      await loadAssignments();
      alert(`Successfully updated ${selectedInvoices.size} invoice(s)`);
    } catch (error: any) {
      console.error('Error changing colors:', error);
      alert('Failed to change colors: ' + error.message);
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleTicketStatusChange = async (ticketId: string, newStatus: string) => {
    if (!profile?.id) return;

    setChangingTicketStatus(ticketId);
    try {
      await supabase
        .from('collection_tickets')
        .update({ status: newStatus })
        .eq('id', ticketId);

      await loadAssignments();
      alert('Ticket status updated successfully');
    } catch (error: any) {
      console.error('Error changing ticket status:', error);
      alert('Failed to change ticket status: ' + error.message);
    } finally {
      setChangingTicketStatus(null);
    }
  };

  const handleBatchAddNote = async () => {
    if (!profile?.id || selectedInvoices.size === 0 || !batchNote.trim()) return;

    setProcessingBatch(true);
    try {
      const notePromises = Array.from(selectedInvoices).map(async (refNumber) => {
        const { data: invoice } = await supabase
          .from('acumatica_invoices')
          .select('id')
          .eq('reference_number', refNumber)
          .single();

        if (!invoice) return;

        await supabase
          .from('invoice_memos')
          .insert({
            invoice_id: invoice.id,
            invoice_reference: refNumber,
            created_by_user_id: user!.id,
            memo_text: batchNote
          });

        if (createReminder && reminderDate) {
          await supabase
            .from('invoice_reminders')
            .insert({
              invoice_id: invoice.id,
              invoice_reference_number: refNumber,
              user_id: user!.id,
              reminder_date: reminderDate,
              title: `Follow up on invoice ${refNumber}`,
              description: batchNote,
              reminder_message: batchNote,
              status: 'pending'
            });
        }
      });

      await Promise.all(notePromises);

      setShowBatchNoteModal(false);
      setBatchNote('');
      setCreateReminder(false);
      setReminderDate('');
      setSelectedInvoices(new Set());
      await loadAssignments();

      alert(`Successfully added note to ${selectedInvoices.size} invoice(s)${createReminder ? ' with reminders' : ''}`);
    } catch (error: any) {
      console.error('Error adding notes:', error);
      alert('Failed to add notes: ' + error.message);
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleOpenMemo = async (invoice: Assignment) => {
    try {
      const { data: invoiceData, error } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, customer, customer_name, date, balance, status')
        .eq('reference_number', invoice.invoice_reference_number)
        .maybeSingle();

      if (error || !invoiceData) {
        alert('Failed to load invoice details');
        return;
      }

      setMemoModalInvoice(invoiceData);
    } catch (err) {
      console.error('Error in handleOpenMemo:', err);
      alert('Failed to open memo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assignments...</p>
        </div>
      </div>
    );
  }

  const totalInvoiceCount = selectedView === 'tickets'
    ? tickets.reduce((acc, t) => acc + t.invoices.length, 0)
    : individualAssignments.length;

  return (
    <div>
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Assignments</h1>
        <p className="text-gray-600">Collection tickets and invoices assigned to you</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setSelectedView('tickets')}
              className={`px-6 py-3 font-medium ${
                selectedView === 'tickets'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4" />
                <span>Collection Tickets ({tickets.length})</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedView('individual')}
              className={`px-6 py-3 font-medium ${
                selectedView === 'individual'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>Individual Invoices ({individualAssignments.length})</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedView('customers')}
              className={`px-6 py-3 font-medium ${
                selectedView === 'customers'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>Assigned Customers ({customerAssignments.length})</span>
              </div>
            </button>
          </div>
        </div>

        <div className="p-6">
          {selectedInvoices.size > 0 && (selectedView === 'tickets' || selectedView === 'individual') && (
            <BatchActionToolbar
              selectedCount={selectedInvoices.size}
              showBatchColorMenu={showBatchColorMenu}
              processingBatch={processingBatch}
              onClearSelection={() => setSelectedInvoices(new Set())}
              onToggleBatchColorMenu={() => setShowBatchColorMenu(!showBatchColorMenu)}
              onBatchColorChange={handleBatchColorChange}
              onOpenBatchNoteModal={() => setShowBatchNoteModal(true)}
            />
          )}

          {selectedView === 'tickets' ? (
            <div className="space-y-6">
              {tickets.length === 0 ? (
                <div className="text-center py-12">
                  <Ticket className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No tickets assigned to you</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      {selectedInvoices.size > 0 && selectedInvoices.size === totalInvoiceCount ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                      {selectedInvoices.size > 0 && selectedInvoices.size === totalInvoiceCount
                        ? 'Deselect All'
                        : 'Select All Visible'}
                    </button>
                  </div>
                  {tickets.map(ticket => (
                    <TicketCard
                      key={ticket.ticket_id}
                      ticket={ticket}
                      selectedInvoices={selectedInvoices}
                      changingColorForInvoice={changingColorForInvoice}
                      changingTicketStatus={changingTicketStatus}
                      statusOptions={statusOptions}
                      onToggleInvoiceSelection={toggleInvoiceSelection}
                      onColorChange={handleColorChange}
                      onToggleColorPicker={setChangingColorForInvoice}
                      onOpenMemo={handleOpenMemo}
                      onTicketStatusChange={handleTicketStatusChange}
                      onPromiseDateSet={loadAssignments}
                    />
                  ))}
                </>
              )}
            </div>
          ) : selectedView === 'individual' ? (
            <div className="space-y-4">
              {individualAssignments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No individual invoices assigned to you</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      {selectedInvoices.size > 0 && selectedInvoices.size === totalInvoiceCount ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                      {selectedInvoices.size > 0 && selectedInvoices.size === totalInvoiceCount
                        ? 'Deselect All'
                        : 'Select All Visible'}
                    </button>
                  </div>

                  {individualAssignments.map(invoice => (
                    <IndividualInvoiceCard
                      key={invoice.invoice_reference_number}
                      invoice={invoice}
                      isSelected={selectedInvoices.has(invoice.invoice_reference_number)}
                      showColorPicker={changingColorForInvoice === invoice.invoice_reference_number}
                      onToggleSelection={() => toggleInvoiceSelection(invoice.invoice_reference_number)}
                      onColorChange={(color) => handleColorChange(invoice.invoice_reference_number, color)}
                      onToggleColorPicker={() => setChangingColorForInvoice(
                        changingColorForInvoice === invoice.invoice_reference_number ? null : invoice.invoice_reference_number
                      )}
                      onOpenMemo={() => handleOpenMemo(invoice)}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {customerAssignments.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No customers assigned to you</p>
                </div>
              ) : (
                customerAssignments.map(customer => (
                  <CustomerAssignmentCard
                    key={customer.assignment_id}
                    customer={customer}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {showBatchNoteModal && (
        <BatchNoteModal
          selectedCount={selectedInvoices.size}
          batchNote={batchNote}
          createReminder={createReminder}
          reminderDate={reminderDate}
          processingBatch={processingBatch}
          onBatchNoteChange={setBatchNote}
          onCreateReminderChange={setCreateReminder}
          onReminderDateChange={setReminderDate}
          onSubmit={handleBatchAddNote}
          onClose={() => {
            setShowBatchNoteModal(false);
            setBatchNote('');
            setCreateReminder(false);
            setReminderDate('');
          }}
        />
      )}

      {memoModalInvoice && (
        <InvoiceMemoModal
          invoice={memoModalInvoice}
          onClose={() => {
            setMemoModalInvoice(null);
            loadAssignments();
          }}
        />
      )}

      {promiseDateModalInvoice && (
        <PromiseDateModal
          invoiceNumber={promiseDateModalInvoice}
          onConfirm={handlePromiseDateConfirm}
          onCancel={() => setPromiseDateModalInvoice(null)}
        />
      )}
    </div>
  );
}
