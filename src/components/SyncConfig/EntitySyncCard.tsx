import { Clock, Power, Database } from 'lucide-react';

interface EntityConfig {
  id: string;
  entity_type: string;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  lookback_minutes: number;
}

interface EntitySyncCardProps {
  config: EntityConfig;
  onUpdate: (field: string, value: any) => void;
}

export default function EntitySyncCard({ config, onUpdate }: EntitySyncCardProps) {
  const getEntityLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1) + 's';
  };

  const getEntityIcon = () => {
    return <Database className="w-5 h-5 text-blue-600" />;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            {getEntityIcon()}
          </div>
          <h3 className="text-lg font-semibold text-slate-900">
            {getEntityLabel(config.entity_type)}
          </h3>
        </div>

        <label className="flex items-center gap-2 cursor-pointer group">
          <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">
            Auto-Sync
          </span>
          <div className="relative">
            <input
              type="checkbox"
              checked={config.sync_enabled}
              onChange={(e) => onUpdate('sync_enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </div>
          <Power className={`w-4 h-4 transition-colors ${config.sync_enabled ? 'text-green-500' : 'text-slate-400'}`} />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Sync Interval
          </label>
          <div className="relative">
            <input
              type="number"
              min="5"
              max="60"
              value={config.sync_interval_minutes}
              onChange={(e) => onUpdate('sync_interval_minutes', parseInt(e.target.value))}
              disabled={!config.sync_enabled}
              className="w-full px-3 py-2 pr-16 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
              minutes
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Check for changes every {config.sync_interval_minutes} min
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">
            Lookback Window
          </label>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="10"
              value={config.lookback_minutes}
              onChange={(e) => onUpdate('lookback_minutes', parseInt(e.target.value))}
              disabled={!config.sync_enabled}
              className="w-full px-3 py-2 pr-16 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
              minutes
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Check last {config.lookback_minutes} min for reliability
          </p>
        </div>
      </div>

      {config.sync_enabled && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            <span className="font-medium">Active:</span> Syncing every {config.sync_interval_minutes} minute
            {config.sync_interval_minutes !== 1 ? 's' : ''}, checking last {config.lookback_minutes} minute
            {config.lookback_minutes !== 1 ? 's' : ''} for changes
          </p>
        </div>
      )}
    </div>
  );
}
