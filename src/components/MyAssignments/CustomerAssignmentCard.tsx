import { CustomerAssignment } from './types';

interface CustomerAssignmentCardProps {
  customer: CustomerAssignment;
}

export default function CustomerAssignmentCard({ customer }: CustomerAssignmentCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-bold text-xl text-gray-900">
              {customer.customer_name}
            </h3>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
              Customer Assignment
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Customer ID: <span className="font-mono font-medium">{customer.customer_id}</span>
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Balance</p>
              <p className="text-2xl font-bold text-red-600">
                ${(customer.customer_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Assigned On</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(customer.assigned_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          {customer.notes && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-1">Assignment Notes:</p>
              <p className="text-sm text-gray-700 italic">{customer.notes}</p>
            </div>
          )}
          <div className="mt-4">
            <p className="text-xs text-gray-500">
              Manage all invoices for this customer through the customer detail page
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
