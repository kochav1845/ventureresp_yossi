// Acumatica deep-links (instance: ventureresp.acumatica.com).
//
// Verified empirically against the live instance: a document only opens when the
// URL's DocType matches the document's actual type. AR301000 (Invoices and Memos)
// hosts Invoices, Credit Memos and Debit Memos, each under a DIFFERENT DocType:
//   Invoice -> INV,  Credit Memo -> CRM,  Debit Memo -> DRM
// Passing DocType=INV for a Credit/Debit Memo opens a blank record. The legacy
// "(W(3))" session-window token was dropped — the plain /Main URL works and
// Acumatica re-establishes company/session context on load.

const BASE = 'https://ventureresp.acumatica.com/Main';
const COMPANY = 'Venture Resp';

// Accepts either the human type ("Credit Memo") or an already-coded value ("CRM").
const AR_DOC_TYPE: Record<string, string> = {
  'Invoice': 'INV',
  'Debit Memo': 'DRM',
  'Credit Memo': 'CRM',
  'Credit WO': 'CRM',
  INV: 'INV', DRM: 'DRM', CRM: 'CRM',
};

export function getAcumaticaInvoiceUrl(referenceNumber: string, type?: string): string {
  const docType = (type && AR_DOC_TYPE[type.trim()]) || 'INV';
  const params = new URLSearchParams({
    CompanyID: COMPANY,
    ScreenId: 'AR301000',
    DocType: docType,
    RefNbr: referenceNumber,
  });
  return `${BASE}?${params.toString()}`;
}

export function getAcumaticaPaymentUrl(referenceNumber: string): string {
  const params = new URLSearchParams({
    CompanyID: COMPANY,
    ScreenId: 'AR302000',
    DocType: 'PMT',
    RefNbr: referenceNumber,
  });
  return `${BASE}?${params.toString()}`;
}

export function getAcumaticaCustomerUrl(customerId: string): string {
  const params = new URLSearchParams({
    CompanyID: COMPANY,
    ScreenId: 'AR303000',
    AcctCD: customerId,
  });
  return `${BASE}?${params.toString()}`;
}
