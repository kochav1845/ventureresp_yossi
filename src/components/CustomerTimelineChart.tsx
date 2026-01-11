import { useState, useEffect } from 'react';
import { TrendingUp, FileText, Calendar, TrendingDown, Minus, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CustomerTimelineChartProps {
  customerId: string;
  customerName: string;
}

interface TimelineData {
  date: string;
  balance: number;
  invoices: number;
  payments: number;
  overdue_90_days: number;
}

interface HoverData {
  x: number;
  y: number;
  date: string;
  balance: number;
  invoices: number;
  payments: number;
  overdue_90_days: number;
  index: number;
}

export default function CustomerTimelineChart({ customerId, customerName }: CustomerTimelineChartProps) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'3month' | '6month' | 'year' | 'all'>('6month');
  const [hoveredPoint, setHoveredPoint] = useState<HoverData | null>(null);
  const [showBalance, setShowBalance] = useState(true);
  const [showInvoices, setShowInvoices] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [showOverdue, setShowOverdue] = useState(true);

  useEffect(() => {
    loadTimelineData();
  }, [customerId, timeRange]);

  const loadTimelineData = async () => {
    setLoading(true);
    try {
      let dateFrom: Date | null = null;
      const dateTo = new Date();

      switch (timeRange) {
        case '3month':
          dateFrom = new Date();
          dateFrom.setMonth(dateFrom.getMonth() - 3);
          break;
        case '6month':
          dateFrom = new Date();
          dateFrom.setMonth(dateFrom.getMonth() - 6);
          break;
        case 'year':
          dateFrom = new Date();
          dateFrom.setFullYear(dateFrom.getFullYear() - 1);
          break;
        case 'all':
          dateFrom = null;
          break;
      }

      const { data: timelineData, error } = await supabase
        .rpc('get_single_customer_timeline', {
          p_customer_id: customerId,
          p_date_from: dateFrom?.toISOString().split('T')[0] || null,
          p_date_to: dateTo.toISOString().split('T')[0],
          p_grouping: 'day'
        });

      if (error) throw error;
      setData(timelineData || []);
    } catch (error) {
      console.error('Error loading timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (timeRange === '3month') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (timeRange === '6month' || timeRange === 'year') {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  // Find max value across all series for consistent scale
  const maxValue = Math.max(
    ...data.map(d => Math.max(d.balance, d.invoices, d.payments, d.overdue_90_days)),
    1
  );

  // Round up to nearest nice number for y-axis
  const getMaxYAxis = () => {
    const rounded = Math.ceil(maxValue / 1000) * 1000;
    return rounded || 1000;
  };

  const maxYAxis = getMaxYAxis();

  // Generate y-axis labels
  const getYAxisLabels = () => {
    const labels = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      labels.push((maxYAxis / steps) * i);
    }
    return labels.reverse();
  };

  const yAxisLabels = getYAxisLabels();

  // Chart coordinates (with padding for axes)
  const CHART_PADDING = { left: 10, right: 5, top: 5, bottom: 10 };
  const CHART_WIDTH = 100 - CHART_PADDING.left - CHART_PADDING.right;
  const CHART_HEIGHT = 100 - CHART_PADDING.top - CHART_PADDING.bottom;

  const getY = (value: number) => {
    const percentage = value / maxYAxis;
    return CHART_PADDING.top + (CHART_HEIGHT * (1 - percentage));
  };

  const getX = (index: number) => {
    if (data.length <= 1) return CHART_PADDING.left;
    return CHART_PADDING.left + (index / (data.length - 1)) * CHART_WIDTH;
  };

  // Create smooth curve using Bezier interpolation
  const createSmoothPath = (values: number[]) => {
    if (values.length === 0) return '';
    if (values.length === 1) {
      const x = getX(0);
      const y = getY(values[0]);
      return `M ${x},${y}`;
    }

    let path = '';
    for (let i = 0; i < values.length; i++) {
      const x = getX(i);
      const y = getY(values[i]);

      if (i === 0) {
        path += `M ${x},${y}`;
      } else {
        const prevX = getX(i - 1);
        const prevY = getY(values[i - 1]);

        const controlPointX = prevX + (x - prevX) / 2;

        path += ` C ${controlPointX},${prevY} ${controlPointX},${y} ${x},${y}`;
      }
    }
    return path;
  };

  // Create area fill path for under the line
  const createAreaPath = (values: number[]) => {
    if (values.length === 0) return '';

    const linePath = createSmoothPath(values);
    const lastX = getX(values.length - 1);
    const firstX = getX(0);
    const bottomY = CHART_PADDING.top + CHART_HEIGHT;

    return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  };

  const createLine = (values: number[], color: string, areaColor: string, label: string, isVisible: boolean) => {
    if (data.length === 0 || !isVisible) return null;

    const pathData = createSmoothPath(values);
    const areaPathData = createAreaPath(values);

    return (
      <g>
        {/* Area fill under the line */}
        <path
          d={areaPathData}
          fill={areaColor}
          opacity="0.1"
          className="transition-all duration-300"
        />

        {/* Main line with glow effect */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          opacity="0.3"
          filter="blur(2px)"
        />
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-300"
        />

        {/* Data points */}
        {values.map((value, index) => {
          const x = getX(index);
          const y = getY(value);
          const isHovered = hoveredPoint?.index === index;

          return (
            <g key={`${label}-${index}`}>
              <circle
                cx={x}
                cy={y}
                r={isHovered ? "1.8" : "1"}
                fill="white"
                stroke={color}
                strokeWidth={isHovered ? "0.8" : "0.5"}
                className="transition-all cursor-pointer"
                onMouseEnter={() => setHoveredPoint({
                  x,
                  y,
                  date: data[index].date,
                  balance: data[index].balance,
                  invoices: data[index].invoices,
                  payments: data[index].payments,
                  overdue_90_days: data[index].overdue_90_days,
                  index
                })}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              {isHovered && (
                <>
                  {/* Crosshair vertical line */}
                  <line
                    x1={x}
                    y1={CHART_PADDING.top}
                    x2={x}
                    y2={CHART_PADDING.top + CHART_HEIGHT}
                    stroke="#94a3b8"
                    strokeWidth="0.3"
                    strokeDasharray="2,2"
                  />
                  {/* Crosshair horizontal line */}
                  <line
                    x1={CHART_PADDING.left}
                    y1={y}
                    x2={CHART_PADDING.left + CHART_WIDTH}
                    y2={y}
                    stroke="#94a3b8"
                    strokeWidth="0.3"
                    strokeDasharray="2,2"
                  />
                </>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  // Calculate trend
  const calculateTrend = (values: number[]) => {
    if (values.length < 2) return { direction: 'flat', percentage: 0 };

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = avgSecond - avgFirst;
    const percentage = avgFirst > 0 ? (change / avgFirst) * 100 : 0;

    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      percentage: Math.abs(percentage)
    };
  };

  const invoiceTrend = calculateTrend(data.map(d => d.invoices));
  const paymentTrend = calculateTrend(data.map(d => d.payments));

  // Get X-axis date labels (7 evenly distributed points)
  const getXAxisLabels = () => {
    if (data.length <= 7) return data.map((d, i) => ({ date: d.date, index: i }));

    const labels = [];
    const step = (data.length - 1) / 6;

    for (let i = 0; i < 7; i++) {
      const index = Math.round(i * step);
      labels.push({ date: data[index].date, index });
    }
    return labels;
  };

  const xAxisLabels = getXAxisLabels();

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Customer Timeline</h2>
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No timeline data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg shadow-md border border-gray-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Customer Financial Timeline</h2>
          <p className="text-xs md:text-sm text-gray-600 mt-1">{customerName} - Invoices & Payments Over Time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTimeRange('3month')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === '3month'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            aria-label="Show 3 month range"
          >
            3 Months
          </button>
          <button
            onClick={() => setTimeRange('6month')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === '6month'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            aria-label="Show 6 month range"
          >
            6 Months
          </button>
          <button
            onClick={() => setTimeRange('year')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === 'year'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            aria-label="Show 1 year range"
          >
            1 Year
          </button>
          <button
            onClick={() => setTimeRange('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === 'all'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            aria-label="Show all time range"
          >
            All Time
          </button>
        </div>
      </div>

      {/* Interactive Legend */}
      <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-6 pb-4 border-b">
        <button
          onClick={() => setShowBalance(!showBalance)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showBalance ? 'bg-red-50 border border-red-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showBalance ? "Hide balance line" : "Show balance line"}
        >
          <div className={`w-8 h-1 rounded ${showBalance ? 'bg-red-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Balance Owed</span>
        </button>
        <button
          onClick={() => setShowInvoices(!showInvoices)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showInvoices ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showInvoices ? "Hide invoices line" : "Show invoices line"}
        >
          <div className={`w-8 h-1 rounded ${showInvoices ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Invoices</span>
        </button>
        <button
          onClick={() => setShowPayments(!showPayments)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showPayments ? 'bg-green-50 border border-green-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showPayments ? "Hide payments line" : "Show payments line"}
        >
          <div className={`w-8 h-1 rounded ${showPayments ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Payments</span>
        </button>
        <button
          onClick={() => setShowOverdue(!showOverdue)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showOverdue ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showOverdue ? "Hide overdue 90+ days line" : "Show overdue 90+ days line"}
        >
          <div className={`w-8 h-1 rounded ${showOverdue ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Overdue 90+ Days</span>
        </button>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200 relative">
        <div className="flex gap-2">
          {/* Y-axis labels */}
          <div className="flex flex-col justify-between h-80 text-xs text-gray-500 pr-2 pt-1 pb-6">
            {yAxisLabels.map((label, index) => (
              <div key={index} className="text-right">
                {formatCurrency(label)}
              </div>
            ))}
          </div>

          {/* Chart SVG */}
          <div className="flex-1 relative">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-80"
              preserveAspectRatio="none"
            >
              {/* Grid lines aligned with y-axis labels */}
              {yAxisLabels.map((label, index) => {
                const y = CHART_PADDING.top + (index / (yAxisLabels.length - 1)) * CHART_HEIGHT;
                return (
                  <line
                    key={`grid-${index}`}
                    x1={CHART_PADDING.left}
                    y1={y}
                    x2={CHART_PADDING.left + CHART_WIDTH}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth="0.2"
                    strokeDasharray="1,1"
                  />
                );
              })}

              {/* X-axis tick marks */}
              {xAxisLabels.map((label) => {
                const x = getX(label.index);
                return (
                  <line
                    key={`tick-${label.index}`}
                    x1={x}
                    y1={CHART_PADDING.top + CHART_HEIGHT}
                    x2={x}
                    y2={CHART_PADDING.top + CHART_HEIGHT + 1}
                    stroke="#9ca3af"
                    strokeWidth="0.3"
                  />
                );
              })}

              {/* Balance line (red) */}
              {createLine(data.map(d => d.balance), '#ef4444', '#ef4444', 'Balance', showBalance)}

              {/* Invoice line (blue) */}
              {createLine(data.map(d => d.invoices), '#3b82f6', '#3b82f6', 'Invoices', showInvoices)}

              {/* Payment line (green) */}
              {createLine(data.map(d => d.payments), '#10b981', '#10b981', 'Payments', showPayments)}

              {/* Overdue 90+ Days line (orange) */}
              {createLine(data.map(d => d.overdue_90_days), '#f97316', '#f97316', 'Overdue 90+', showOverdue)}
            </svg>

            {/* Custom floating tooltip */}
            {hoveredPoint && (
              <div
                className="absolute bg-white border-2 border-gray-300 rounded-lg shadow-xl p-3 pointer-events-none z-10 transform -translate-x-1/2 -translate-y-full"
                style={{
                  left: `${(hoveredPoint.x / 100) * 100}%`,
                  top: '0',
                  marginTop: '-10px'
                }}
              >
                <div className="text-xs font-semibold text-gray-700 mb-2 whitespace-nowrap">
                  {formatDate(hoveredPoint.date)}
                </div>
                <div className="space-y-1">
                  {showBalance && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="text-xs text-gray-600">Balance:</span>
                      <span className="text-xs font-bold text-red-700">
                        {formatCurrency(hoveredPoint.balance)}
                      </span>
                    </div>
                  )}
                  {showInvoices && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-xs text-gray-600">Invoices:</span>
                      <span className="text-xs font-bold text-blue-700">
                        {formatCurrency(hoveredPoint.invoices)}
                      </span>
                    </div>
                  )}
                  {showPayments && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-xs text-gray-600">Payments:</span>
                      <span className="text-xs font-bold text-green-700">
                        {formatCurrency(hoveredPoint.payments)}
                      </span>
                    </div>
                  )}
                  {showOverdue && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                      <span className="text-xs text-gray-600">Overdue 90+:</span>
                      <span className="text-xs font-bold text-orange-700">
                        {formatCurrency(hoveredPoint.overdue_90_days)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* X-axis labels */}
            <div className="flex justify-between mt-2 px-2">
              {xAxisLabels.map((label, index) => (
                <div
                  key={index}
                  className="text-xs text-gray-600 transform -rotate-45 origin-top-left"
                  style={{ width: '60px' }}
                >
                  {formatDate(label.date)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-700">Current Balance</span>
            <DollarSign className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-900">
            {formatCurrency(data[data.length - 1]?.balance || 0)}
          </p>
          <p className="text-xs text-red-600 mt-1">Outstanding amount</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Total Invoiced</span>
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.invoices, 0))}
          </p>
          <p className="text-xs text-blue-600 mt-1">In selected period</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Total Paid</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.payments, 0))}
          </p>
          <p className="text-xs text-green-600 mt-1">In selected period</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-orange-700">Overdue 90+ Days</span>
            <DollarSign className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-900">
            {formatCurrency(data[data.length - 1]?.overdue_90_days || 0)}
          </p>
          <p className="text-xs text-orange-600 mt-1">Currently overdue</p>
        </div>
      </div>
    </div>
  );
}
