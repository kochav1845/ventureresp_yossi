import { useState, useRef, useEffect } from 'react';
import {
  GraduationCap,
  X,
  ChevronRight,
  Compass,
  Users,
  FileText,
  DollarSign,
  Ticket,
  Mail,
  Settings,
  BarChart3,
  Sparkles,
  Bell,
  ClipboardList,
  Activity,
  Layers,
  Play,
} from 'lucide-react';
import { useTour } from './TourProvider';
import { TOURS, TOUR_CATEGORIES, getToursByCategory } from './tours';

const ICON_MAP: Record<string, React.ReactNode> = {
  'compass': <Compass size={16} />,
  'users': <Users size={16} />,
  'bar-chart': <BarChart3 size={16} />,
  'file-text': <FileText size={16} />,
  'dollar-sign': <DollarSign size={16} />,
  'layers': <Layers size={16} />,
  'ticket': <Ticket size={16} />,
  'clipboard-list': <ClipboardList size={16} />,
  'activity': <Activity size={16} />,
  'mail': <Mail size={16} />,
  'sparkles': <Sparkles size={16} />,
  'settings': <Settings size={16} />,
  'bell': <Bell size={16} />,
};

export default function TourLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { startTour, isActive } = useTour();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedCategory(null);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (isActive) return null;

  const handleStartTour = (tourId: string) => {
    setIsOpen(false);
    setSelectedCategory(null);
    startTour(tourId);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all text-sm font-medium"
        data-tour="tour-launcher"
        title="Take a guided tour"
      >
        <GraduationCap size={16} />
        <span className="hidden lg:inline">Guided Tour</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[400px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-[60] animate-scale-in">
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <GraduationCap size={18} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Guided Tours</h3>
                  <p className="text-gray-400 text-xs">Step-by-step walkthroughs</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setSelectedCategory(null);
                }}
                className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {!selectedCategory ? (
              // Category list
              <div className="p-3 space-y-1">
                {TOUR_CATEGORIES.map((cat) => {
                  const tours = getToursByCategory(cat.id);
                  if (tours.length === 0) return null;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors group text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-700 transition-colors">
                          {cat.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tours.length} {tours.length === 1 ? 'tour' : 'tours'} available
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-gray-400 group-hover:text-emerald-600 transition-colors" />
                    </button>
                  );
                })}

                {/* Quick start - full tour */}
                <div className="pt-3 mt-3 border-t border-gray-100 px-2">
                  <button
                    onClick={() => handleStartTour('app-overview')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors text-left"
                  >
                    <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Play size={14} className="text-white ml-0.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Quick Start Tour</p>
                      <p className="text-xs text-emerald-600">New here? Start with a quick overview</p>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              // Tour list for selected category
              <div>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1.5 px-5 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors border-b border-gray-100 w-full"
                >
                  <ChevronRight size={14} className="rotate-180" />
                  Back to categories
                </button>

                <div className="p-3 space-y-1">
                  {getToursByCategory(selectedCategory).map((tour) => (
                    <button
                      key={tour.id}
                      onClick={() => handleStartTour(tour.id)}
                      className="w-full flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                    >
                      <div className="w-8 h-8 bg-gray-100 group-hover:bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors">
                        <span className="text-gray-600 group-hover:text-emerald-600 transition-colors">
                          {ICON_MAP[tour.icon] || <Compass size={16} />}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-700 transition-colors">
                          {tour.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {tour.description}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {tour.steps.length} steps
                        </p>
                      </div>
                      <Play size={14} className="text-gray-400 group-hover:text-emerald-500 mt-1 flex-shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Use arrow keys or Escape during tours. Voice narration available.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
