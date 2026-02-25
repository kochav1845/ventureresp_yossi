import { DollarSign, CreditCard, ArrowDownRight, RotateCcw, FileX } from 'lucide-react';
import { MonthSummary, formatCurrency, formatNumber } from './types';

interface MonthSummaryCardsProps {
  months: MonthSummary[];
}

export default function MonthSummaryCards({ months }: MonthSummaryCardsProps) {
  const totals = months.reduce((acc, m) => ({
    total: acc.total + m.total_amount,
    count: acc.count + m.total_payments,
    payments: acc.payments + m.payment_amount,
    paymentCount: acc.paymentCount + m.payment_count,
    prepayments: acc.prepayments + m.prepayment_amount,
    prepaymentCount: acc.prepaymentCount + m.prepayment_count,
    voided: acc.voided + m.voided_amount,
    voidedCount: acc.voidedCount + m.voided_count,
    refunds: acc.refunds + m.refund_amount,
    refundCount: acc.refundCount + m.refund_count,
  }), { total: 0, count: 0, payments: 0, paymentCount: 0, prepayments: 0, prepaymentCount: 0, voided: 0, voidedCount: 0, refunds: 0, refundCount: 0 });

  const cards = [
    { label: 'Net Collections', amount: totals.payments + totals.prepayments - Math.abs(totals.voided) - Math.abs(totals.refunds), count: totals.count, icon: DollarSign, gradient: 'from-emerald-500 to-teal-600', description: 'Payments + Prepayments - Voided - Refunds' },
    { label: 'Total Payments', amount: totals.payments, count: totals.paymentCount, icon: CreditCard, gradient: 'from-blue-500 to-blue-600', description: 'Standard payment transactions' },
    { label: 'Prepayments', amount: totals.prepayments, count: totals.prepaymentCount, icon: ArrowDownRight, gradient: 'from-cyan-500 to-cyan-600', description: 'Advance payment deposits' },
    { label: 'Voided', amount: totals.voided, count: totals.voidedCount, icon: FileX, gradient: 'from-red-500 to-red-600', description: 'Voided and reversed payments' },
    { label: 'Refunds', amount: totals.refunds, count: totals.refundCount, icon: RotateCcw, gradient: 'from-amber-500 to-amber-600', description: 'Customer refunds issued' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg bg-gradient-to-br ${card.gradient} shadow-sm`}>
                <Icon size={18} className="text-white" />
              </div>
              <span className="text-xs text-gray-400 font-medium">{formatNumber(card.count)} txns</span>
            </div>
            <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(card.amount)}</div>
            <div className="text-xs text-gray-500">{card.label}</div>
          </div>
        );
      })}
    </div>
  );
}
