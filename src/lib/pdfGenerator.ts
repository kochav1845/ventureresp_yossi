interface Invoice {
  reference_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  balance: number;
  description: string;
}

interface Customer {
  customer_id: string;
  customer_name: string;
  email: string;
  total_balance: number;
  unpaid_invoices: Invoice[];
}

export function generateCustomerInvoicePDF(customer: Customer): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 816;
      canvas.height = 1056;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 28px Arial';
      ctx.fillText('Invoice Statement', 40, 60);

      ctx.font = '14px Arial';
      ctx.fillStyle = '#64748b';
      ctx.fillText(new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }), 40, 90);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('Customer Information', 40, 140);

      ctx.font = '14px Arial';
      ctx.fillStyle = '#334155';
      ctx.fillText(`Name: ${customer.customer_name}`, 40, 170);
      ctx.fillText(`ID: ${customer.customer_id}`, 40, 195);
      if (customer.email) {
        ctx.fillText(`Email: ${customer.email}`, 40, 220);
      }

      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = '#dc2626';
      const balanceText = `Total Balance Due: ${formatCurrency(customer.total_balance)}`;
      ctx.fillText(balanceText, 40, 260);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 280);
      ctx.lineTo(776, 280);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('Unpaid Invoices', 40, 320);

      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#64748b';
      ctx.fillText('Invoice #', 40, 350);
      ctx.fillText('Date', 200, 350);
      ctx.fillText('Due Date', 320, 350);
      ctx.fillText('Amount', 450, 350);
      ctx.fillText('Balance', 600, 350);

      let yPos = 380;
      ctx.font = '12px Arial';
      ctx.fillStyle = '#334155';

      customer.unpaid_invoices.forEach((invoice, index) => {
        if (yPos > 980) {
          ctx.fillStyle = '#64748b';
          ctx.font = 'italic 10px Arial';
          ctx.fillText('Continued on next page...', 40, yPos);
          return;
        }

        if (index % 2 === 0) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(30, yPos - 15, 756, 25);
        }

        ctx.fillStyle = '#334155';
        ctx.font = '12px Arial';
        ctx.fillText(invoice.reference_number, 40, yPos);
        ctx.fillText(formatDate(invoice.invoice_date), 200, yPos);
        ctx.fillText(formatDate(invoice.due_date), 320, yPos);
        ctx.fillText(formatCurrency(invoice.amount), 450, yPos);

        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#dc2626';
        ctx.fillText(formatCurrency(invoice.balance), 600, yPos);

        yPos += 30;
      });

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, yPos + 10);
      ctx.lineTo(776, yPos + 10);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('Total:', 500, yPos + 40);
      ctx.fillStyle = '#dc2626';
      ctx.fillText(formatCurrency(customer.total_balance), 600, yPos + 40);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Arial';
      ctx.fillText('Please remit payment to the address on file.', 40, canvas.height - 40);
      ctx.fillText('Thank you for your business!', 40, canvas.height - 20);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
