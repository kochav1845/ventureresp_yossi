import { Mail, Database, ArrowRight, FileText, Search, BarChart3, CreditCard, Link, Webhook, RefreshCw, Settings, Bug, TestTube } from 'lucide-react';

interface MainSelectionProps {
  onSelectEmails: () => void;
  onSelectAcumatica: () => void;
  onSelectInvoices: () => void;
  onSelectPayments: () => void;
  onSelectDiscovery: () => void;
  onSelectPaymentDiscovery: () => void;
  onSelectAnalytics: () => void;
  onSelectPaymentApplications: () => void;
  onSelectWebhooks: () => void;
  onSelectSyncStatus: () => void;
  onSelectSyncConfig: () => void;
  onSelectSyncDebug: () => void;
  onSelectCredentialTest: () => void;
}

export default function MainSelection({ onSelectEmails, onSelectAcumatica, onSelectInvoices, onSelectPayments, onSelectDiscovery, onSelectPaymentDiscovery, onSelectAnalytics, onSelectPaymentApplications, onSelectWebhooks, onSelectSyncStatus, onSelectSyncConfig, onSelectSyncDebug, onSelectCredentialTest }: MainSelectionProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-7xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Welcome</h1>
          <p className="text-xl text-slate-400">Choose what you'd like to manage</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <button
            onClick={onSelectEmails}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-blue-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <Mail className="w-10 h-10 text-blue-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Email Management</h2>
                <p className="text-slate-400">
                  Manage inbound emails, templates, formulas, and automation
                </p>
              </div>
              <div className="flex items-center gap-2 text-blue-500 font-medium">
                <span>Go to Emails</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectAcumatica}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-green-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                <Database className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Customers</h2>
                <p className="text-slate-400">
                  View and manage Acumatica customers and data
                </p>
              </div>
              <div className="flex items-center gap-2 text-green-500 font-medium">
                <span>Go to Customers</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectInvoices}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-orange-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                <FileText className="w-10 h-10 text-orange-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Invoices</h2>
                <p className="text-slate-400">
                  View and manage Acumatica invoices and billing
                </p>
              </div>
              <div className="flex items-center gap-2 text-orange-500 font-medium">
                <span>Go to Invoices</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectDiscovery}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-pink-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-pink-500/10 rounded-full flex items-center justify-center group-hover:bg-pink-500/20 transition-colors">
                <Search className="w-10 h-10 text-pink-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Field Discovery</h2>
                <p className="text-slate-400">
                  Explore invoice fields and create database structure
                </p>
              </div>
              <div className="flex items-center gap-2 text-pink-500 font-medium">
                <span>Discover Fields</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectPayments}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-purple-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                <CreditCard className="w-10 h-10 text-purple-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Payments</h2>
                <p className="text-slate-400">
                  View and manage Acumatica payments and transactions
                </p>
              </div>
              <div className="flex items-center gap-2 text-purple-500 font-medium">
                <span>Go to Payments</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectPaymentDiscovery}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-yellow-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-yellow-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center group-hover:bg-yellow-500/20 transition-colors">
                <Search className="w-10 h-10 text-yellow-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Payment Applications</h2>
                <p className="text-slate-400">
                  Discover how payments are linked to invoices
                </p>
              </div>
              <div className="flex items-center gap-2 text-yellow-500 font-medium">
                <span>Discover Applications</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectAnalytics}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-cyan-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <BarChart3 className="w-10 h-10 text-cyan-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Analytics</h2>
                <p className="text-slate-400">
                  Comprehensive invoice analytics and insights
                </p>
              </div>
              <div className="flex items-center gap-2 text-cyan-500 font-medium">
                <span>View Analytics</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectPaymentApplications}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-emerald-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                <Link className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Payment-Invoice Links</h2>
                <p className="text-slate-400">
                  View which invoices payments were applied to
                </p>
              </div>
              <div className="flex items-center gap-2 text-emerald-500 font-medium">
                <span>View Applications</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectWebhooks}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-red-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                <Webhook className="w-10 h-10 text-red-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Webhooks</h2>
                <p className="text-slate-400">
                  Real-time sync configuration for Acumatica changes
                </p>
              </div>
              <div className="flex items-center gap-2 text-red-500 font-medium">
                <span>Configure Webhooks</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectSyncStatus}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-violet-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-violet-500/10 rounded-full flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                <RefreshCw className="w-10 h-10 text-violet-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Sync Status</h2>
                <p className="text-slate-400">
                  Monitor real-time synchronization with Acumatica
                </p>
              </div>
              <div className="flex items-center gap-2 text-violet-500 font-medium">
                <span>View Sync Status</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectSyncConfig}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-rose-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-rose-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center group-hover:bg-rose-500/20 transition-colors">
                <Settings className="w-10 h-10 text-rose-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Sync Settings</h2>
                <p className="text-slate-400">
                  Configure automatic sync intervals and settings
                </p>
              </div>
              <div className="flex items-center gap-2 text-rose-500 font-medium">
                <span>Configure Sync</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectSyncDebug}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-amber-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                <Bug className="w-10 h-10 text-amber-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Sync Debug</h2>
                <p className="text-slate-400">
                  Test sync and see detailed diagnostic information
                </p>
              </div>
              <div className="flex items-center gap-2 text-amber-500 font-medium">
                <span>Debug Sync</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={onSelectCredentialTest}
            className="group relative bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700 hover:border-cyan-500 rounded-2xl p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/20 hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <TestTube className="w-10 h-10 text-cyan-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Test Credentials</h2>
                <p className="text-slate-400">
                  Manually test Acumatica API credentials
                </p>
              </div>
              <div className="flex items-center gap-2 text-cyan-500 font-medium">
                <span>Test Connection</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
