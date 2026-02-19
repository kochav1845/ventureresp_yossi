import {
  Users, DollarSign, Banknote, TrendingUp, CheckCircle, AlertCircle,
  Ticket, Eye, ChevronDown, ChevronUp, Calendar, FileText, Mail, BarChart3
} from 'lucide-react';
import { CollectorCombined } from './types';
import CollectorExpandedDetails from './CollectorExpandedDetails';

interface Props {
  collector: CollectorCombined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onViewProgress: () => void;
  dateRange: number;
}

export default function CollectorCard({ collector, isExpanded, onToggleExpand, onViewProgress, dateRange }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {(collector.full_name || collector.email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{collector.full_name}</h2>
              <p className="text-sm text-blue-600 font-medium truncate">{collector.email}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-500">{collector.assigned_customers} customers</span>
                {collector.last_activity_at && (
                  <span className="text-xs text-gray-400">
                    Last active: {new Date(collector.last_activity_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
              <Calendar className="w-4 h-4 text-green-600" />
              <span className="text-green-700 font-semibold text-sm">{collector.working_days}d</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onViewProgress(); }}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Progress</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'Details'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-4 rounded-xl border border-emerald-200">
            <div className="flex items-center gap-2 mb-1.5">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-800">Total Collected</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">
              ${collector.total_collected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-xl border border-blue-200">
            <div className="flex items-center gap-2 mb-1.5">
              <Banknote className="w-5 h-5 text-blue-600" />
              <span className="text-xs font-semibold text-blue-800">Invoices Paid</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">{collector.invoices_paid}</p>
            <p className="text-xs text-blue-500 mt-0.5">{collector.payment_count} payment{collector.payment_count !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-yellow-50 p-4 rounded-xl border border-amber-200">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <span className="text-xs font-semibold text-amber-800">Avg / Invoice</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">
              ${collector.invoices_paid > 0
                ? (collector.total_collected / collector.invoices_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '0.00'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-green-50 p-3 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-green-800">Green</span>
            </div>
            <p className="text-xl font-bold text-green-700">{collector.green_changes}</p>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-medium text-orange-800">Orange</span>
            </div>
            <p className="text-xl font-bold text-orange-700">{collector.orange_changes}</p>
          </div>
          <div className="bg-red-50 p-3 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-medium text-red-800">Red</span>
            </div>
            <p className="text-xl font-bold text-red-700">{collector.red_changes}</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-800">Resolved</span>
            </div>
            <p className="text-xl font-bold text-blue-700">{collector.orange_to_green}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Marked Red</p>
            <p className="text-lg font-bold text-gray-800">{collector.untouched_to_red}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Status Changes</p>
            <p className="text-lg font-bold text-gray-800">{collector.total_changes}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Ticket className="w-3 h-3 text-gray-500" />
              <p className="text-xs text-gray-500">Tickets</p>
            </div>
            <p className="text-lg font-bold text-gray-800">{collector.tickets_assigned}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <FileText className="w-3 h-3 text-gray-500" />
              <p className="text-xs text-gray-500">Inv. Modified</p>
            </div>
            <p className="text-lg font-bold text-gray-800">{collector.invoices_modified}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Pay. Modified</p>
            <p className="text-lg font-bold text-gray-800">{collector.payments_modified}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Mail className="w-3 h-3 text-gray-500" />
              <p className="text-xs text-gray-500">Emails</p>
            </div>
            <p className="text-lg font-bold text-gray-800">{collector.emails_sent}/{collector.emails_scheduled}</p>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 pt-2 border-t border-gray-100 bg-gray-50/50">
          <CollectorExpandedDetails collectorId={collector.user_id} dateRange={dateRange} />
        </div>
      )}
    </div>
  );
}
