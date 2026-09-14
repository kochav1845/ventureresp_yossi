import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';

export interface ChartSpec {
  chart_type: 'bar' | 'line' | 'pie';
  title: string;
  data: { label: string; value: number }[];
  value_prefix?: string;
}

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#ec4899', '#64748b', '#84cc16'];

function fmt(v: number, prefix = ''): string {
  return `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function ChatChart({ spec, height = 200 }: { spec: ChartSpec; height?: number }) {
  const data = (spec.data || []).filter((d) => d && typeof d.value === 'number');
  if (data.length === 0) return null;
  const prefix = spec.value_prefix || '';
  const tip = (value: any) => [fmt(Number(value), prefix), ''] as [string, string];

  return (
    <div className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-2">
      {spec.title && <div className="mb-1 px-1 text-[11px] font-semibold text-gray-700">{spec.title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        {spec.chart_type === 'pie' ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={height / 2.6}
              label={(e: any) => e.label} labelLine={false} fontSize={10}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={tip} />
          </PieChart>
        ) : spec.chart_type === 'line' ? (
          <LineChart data={data} margin={{ top: 6, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(Number(v), prefix)} width={54} />
            <Tooltip formatter={tip} />
            <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 6, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(Number(v), prefix)} width={54} />
            <Tooltip formatter={tip} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
