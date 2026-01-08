export function getAcumaticaInvoiceUrl(referenceNumber: string): string {
  const baseUrl = 'https://ventureresp.acumatica.com/(W(3))/Main';
  const params = new URLSearchParams({
    CompanyID: 'Venture Resp',
    ScreenId: 'AR301000',
    DocType: 'INV',
    RefNbr: referenceNumber
  });

  return `${baseUrl}?${params.toString()}`;
}

export function getAcumaticaPaymentUrl(referenceNumber: string): string {
  const baseUrl = 'https://ventureresp.acumatica.com/(W(3))/Main';
  const params = new URLSearchParams({
    CompanyID: 'Venture Resp',
    ScreenId: 'AR302000',
    DocType: 'PMT',
    RefNbr: referenceNumber
  });

  return `${baseUrl}?${params.toString()}`;
}

export function getAcumaticaCustomerUrl(customerId: string): string {
  const baseUrl = 'https://ventureresp.acumatica.com/(W(3))/Main';
  const params = new URLSearchParams({
    CompanyID: 'Venture Resp',
    ScreenId: 'AR303000',
    CustomerID: customerId
  });

  return `${baseUrl}?${params.toString()}`;
}
