import { AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function ImpersonationBanner() {
  const { isImpersonating, profile, originalProfile, stopImpersonation } = useAuth();

  if (!isImpersonating || !profile || !originalProfile) return null;

  const handleStopImpersonation = async () => {
    if (confirm('Stop impersonating and return to your admin account?')) {
      await stopImpersonation();
      window.location.reload();
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-orange-600 via-red-600 to-orange-600 text-white shadow-2xl border-b-4 border-red-800">
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-between max-w-full">
          <div className="flex items-center gap-3 animate-pulse">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="font-bold text-base sm:text-lg">⚠️ IMPERSONATION MODE ACTIVE</span>
              <span className="text-xs sm:text-sm opacity-90">
                Viewing as <strong>{profile.email}</strong> ({profile.role})
              </span>
            </div>
          </div>
          <button
            onClick={handleStopImpersonation}
            className="flex items-center gap-2 px-6 py-2.5 bg-white text-red-600 rounded-lg hover:bg-red-50 hover:scale-105 transition-all font-bold text-sm shadow-lg border-2 border-white"
          >
            <X className="w-5 h-5" />
            <span className="hidden sm:inline">Exit Impersonation</span>
            <span className="sm:hidden">Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
