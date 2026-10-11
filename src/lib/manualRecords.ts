import { supabase } from './supabase';

/**
 * Creating and recognising hand-entered records.
 *
 * Manual customers / invoices / payments live in the same acumatica_* tables as
 * synced ones, distinguished only by `source = 'manual'`. That means every
 * balance, statement, ticket, aging bucket and analytic already counts them
 * with no extra work — and it is why their business keys are prefixed, so the
 * sync's upserts can never collide with one. See
 * supabase/migrations/20261008100000_manual_records.sql.
 */

export type RecordSource = 'acumatica' | 'manual';

export const isManual = (row: { source?: string | null } | null | undefined): boolean =>
  row?.source === 'manual';

/**
 * The caller's organization_id, which every manual insert must set explicitly.
 *
 * Do NOT rely on the column default: organization_id on these tables defaults
 * to the hardcoded LIVE org (a98c768a…), not to get_user_org_id(). A user in
 * the demo org would get the live org's id by default and the insert would then
 * be rejected by the `organization_id = get_user_org_id()` RLS check.
 */
let orgIdCache: string | null = null;
export async function currentOrgId(): Promise<string> {
  if (orgIdCache) return orgIdCache;
  const { data, error } = await supabase.rpc('get_user_org_id');
  if (error) throw error;
  if (!data) throw new Error('Could not determine your organization — try signing in again.');
  orgIdCache = data as string;
  return orgIdCache;
}

/** Business key for a new manual record: M-C-00001 / M-INV-00001 / M-PAY-00001. */
export async function nextManualKey(kind: 'customer' | 'invoice' | 'payment'): Promise<string> {
  const { data, error } = await supabase.rpc('next_manual_key', { p_kind: kind });
  if (error) throw error;
  if (!data) throw new Error('Could not allocate a manual reference number');
  return data as string;
}

/**
 * Rebuild one customer's row in cached_customer_balances. The Customers list
 * and Dashboard read that cache, not the invoice table, so without this a
 * hand-entered invoice wouldn't show up until the next full refresh.
 */
export async function refreshCustomerBalance(customerId: string): Promise<void> {
  const { error } = await supabase.rpc('refresh_cached_customer_balance_for', {
    p_customer_id: customerId,
  });
  if (error) throw error;
}

// ── customers ──────────────────────────────────────────────────────────────

export interface ManualCustomerInput {
  customer_id?: string;
  customer_name: string;
  email_address?: string;
  phone1?: string;
  phone2?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  billing_state?: string;
  postal_code?: string;
  country?: string;
  customer_class?: string;
  terms?: string;
  credit_limit?: number | null;
  customer_status?: string;
  parent_account?: string;
  statement_cycle_id?: string;
  days_from_invoice_threshold?: number | null;
  is_test_customer?: boolean;
  manual_note?: string;
}

export async function createManualCustomer(input: ManualCustomerInput) {
  const { data: profile } = await supabase.auth.getUser();
  const userId = profile?.user?.id ?? null;
  const orgId = await currentOrgId();

  const customerId = input.customer_id?.trim() || (await nextManualKey('customer'));

  const row = {
    customer_id: customerId,
    customer_name: input.customer_name.trim(),
    email_address: input.email_address?.trim() || null,
    phone1: input.phone1?.trim() || null,
    phone2: input.phone2?.trim() || null,
    address_line1: input.address_line1?.trim() || null,
    address_line2: input.address_line2?.trim() || null,
    city: input.city?.trim() || null,
    billing_state: input.billing_state?.trim() || null,
    postal_code: input.postal_code?.trim() || null,
    country: input.country?.trim() || null,
    customer_class: input.customer_class?.trim() || null,
    terms: input.terms?.trim() || null,
    credit_limit: input.credit_limit ?? null,
    customer_status: input.customer_status?.trim() || 'Active',
    parent_account: input.parent_account?.trim() || null,
    statement_cycle_id: input.statement_cycle_id?.trim() || null,
    days_from_invoice_threshold: input.days_from_invoice_threshold ?? 30,
    is_active: true,
    is_test_customer: input.is_test_customer ?? false,
    source: 'manual' as const,
    manual_created_by: userId,
    manual_created_at: new Date().toISOString(),
    manual_note: input.manual_note?.trim() || null,
    organization_id: orgId,
  };

  const { data, error } = await supabase
    .from('acumatica_customers')
    .insert(row)
    .select('id, customer_id, customer_name, source')
    .single();
  if (error) throw error;

  // Give it a cache row immediately so it appears in the Customers list.
  await refreshCustomerBalance(customerId);
  return data;
}

// ── invoices ───────────────────────────────────────────────────────────────

export type InvoiceDocType = 'Invoice' | 'Credit Memo' | 'Debit Memo';

export interface ManualInvoiceInput {
  reference_number?: string;
  type: InvoiceDocType;
  customer: string;
  customer_name: string;
  status?: string;
  date: string;
  due_date?: string | null;
  amount: number;
  /** Defaults to `amount` — an invoice entered by hand is normally unpaid. */
  balance?: number;
  description?: string;
  terms?: string;
  po_number?: string;
  note?: string;
}

export async function createManualInvoice(input: ManualInvoiceInput) {
  const { data: profile } = await supabase.auth.getUser();
  const userId = profile?.user?.id ?? null;
  const orgId = await currentOrgId();

  const ref = input.reference_number?.trim() || (await nextManualKey('invoice'));
  const amount = Number(input.amount) || 0;
  const balance = input.balance === undefined ? amount : Number(input.balance) || 0;

  const row = {
    reference_number: ref,
    type: input.type,
    customer: input.customer,
    customer_name: input.customer_name,
    status: input.status || 'Open',
    date: input.date,
    due_date: input.due_date || null,
    amount,
    balance,
    description: input.description?.trim() || null,
    terms: input.terms?.trim() || null,
    customer_order_number: input.po_number?.trim() || null,
    note: input.note?.trim() || null,
    doc_type: input.type,
    source: 'manual' as const,
    manual_created_by: userId,
    manual_created_at: new Date().toISOString(),
    organization_id: orgId,
  };

  const { data, error } = await supabase
    .from('acumatica_invoices')
    .insert(row)
    .select('id, reference_number, type, balance, source')
    .single();
  if (error) throw error;

  await refreshCustomerBalance(input.customer);
  return data;
}

// ── payments + check images ────────────────────────────────────────────────

export interface CheckUpload {
  file: File;
  /** Which face of the cheque this image is, when known. */
  side?: 'front' | 'back' | null;
}

export interface ManualPaymentInput {
  reference_number?: string;
  type?: string;
  customer_id: string;
  customer_name: string;
  application_date: string;
  payment_amount: number;
  payment_method?: string;
  /** The cheque number, which is what `payment_ref` holds on synced rows. */
  payment_ref?: string;
  description?: string;
  /** Invoice reference → amount applied. Reduces each invoice's balance. */
  applications?: Array<{ reference_number: string; type: string; amount: number }>;
}

const CHECK_BUCKET = 'payment-check-images';

/**
 * Record a payment entered by hand, attach its cheque images and optionally
 * apply it against invoices. Mirrors what the Acumatica payment sync writes
 * (acumatica_payments + payment_attachments + payment_invoice_applications), so
 * the Payments screens render a manual cheque exactly like a synced one.
 */
export async function createManualPayment(input: ManualPaymentInput, checks: CheckUpload[] = []) {
  const { data: profile } = await supabase.auth.getUser();
  const userId = profile?.user?.id ?? null;
  const orgId = await currentOrgId();

  const ref = input.reference_number?.trim() || (await nextManualKey('payment'));
  const amount = Number(input.payment_amount) || 0;
  const applications = (input.applications || []).filter(a => (Number(a.amount) || 0) > 0);
  const applied = applications.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  if (applied > amount + 0.005) {
    throw new Error(
      `Applied ${applied.toFixed(2)} is more than the payment amount ${amount.toFixed(2)}`
    );
  }

  const { data: payment, error: payErr } = await supabase
    .from('acumatica_payments')
    .insert({
      reference_number: ref,
      type: input.type || 'Payment',
      customer_id: input.customer_id,
      customer_name: input.customer_name,
      status: 'Closed',
      application_date: input.application_date,
      doc_date: input.application_date,
      payment_amount: amount,
      available_balance: amount - applied,
      payment_method: input.payment_method?.trim() || null,
      payment_ref: input.payment_ref?.trim() || null,
      description: input.description?.trim() || null,
      currency_id: 'USD',
      applications_fetched: true,
      applications_fetched_at: new Date().toISOString(),
      source: 'manual' as const,
      manual_created_by: userId,
      manual_created_at: new Date().toISOString(),
      organization_id: orgId,
    })
    .select('id, reference_number, type, payment_amount, source')
    .single();
  if (payErr) throw payErr;

  // ── cheque images ────────────────────────────────────────────────────────
  const uploadedPaths: string[] = [];
  try {
    for (const [idx, chk] of checks.entries()) {
      const safeName = chk.file.name.replace(/[^A-Za-z0-9._-]/g, '_');
      const path = `manual/${input.customer_id}/${ref}/${Date.now()}_${idx}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(CHECK_BUCKET)
        .upload(path, chk.file, { contentType: chk.file.type || undefined, upsert: false });
      if (upErr) throw upErr;
      uploadedPaths.push(path);

      const { error: attErr } = await supabase.from('payment_attachments').insert({
        payment_id: payment.id,
        payment_reference_number: ref,
        // file_id is Acumatica's attachment id; a locally uploaded file has
        // none, so key it off the storage path to keep the row unique.
        file_id: `manual:${path}`,
        file_name: chk.file.name,
        file_type: chk.file.type || null,
        file_size: chk.file.size,
        storage_path: path,
        is_check_image: true,
        check_side: chk.side || null,
        source: 'manual',
        uploaded_by: userId,
      });
      if (attErr) throw attErr;
    }
  } catch (e) {
    // Don't leave a payment with half its cheque images attached.
    if (uploadedPaths.length) {
      await supabase.storage.from(CHECK_BUCKET).remove(uploadedPaths).catch(() => {});
    }
    await supabase.from('payment_attachments').delete().eq('payment_id', payment.id);
    await supabase.from('acumatica_payments').delete().eq('id', payment.id);
    throw e;
  }

  // ── apply to invoices ────────────────────────────────────────────────────
  if (applications.length) {
    const { error: appErr } = await supabase.from('payment_invoice_applications').insert(
      applications.map(a => ({
        payment_id: payment.id,
        payment_reference_number: ref,
        invoice_reference_number: a.reference_number,
        amount_paid: Number(a.amount),
        application_date: input.application_date,
        customer_id: input.customer_id,
        organization_id: orgId,
      }))
    );
    if (appErr) throw appErr;

    // Knock the applied amount off each invoice's balance, and close it when
    // it reaches zero (same shape the sync leaves a fully-paid invoice in).
    for (const a of applications) {
      const { data: inv } = await supabase
        .from('acumatica_invoices')
        .select('id, balance')
        .eq('reference_number', a.reference_number)
        .eq('type', a.type)
        .maybeSingle();
      if (!inv) continue;

      const newBalance = Math.max(0, Number(inv.balance || 0) - Number(a.amount));
      await supabase
        .from('acumatica_invoices')
        .update({
          balance: newBalance,
          status: newBalance <= 0.004 ? 'Closed' : undefined,
        })
        .eq('id', inv.id);
    }
  }

  await refreshCustomerBalance(input.customer_id);
  return payment;
}

/** Remove a hand-entered record. Synced records are not deletable from the app. */
export async function deleteManualInvoice(invoiceId: string, customerId: string) {
  const { error } = await supabase
    .from('acumatica_invoices')
    .delete()
    .eq('id', invoiceId)
    .eq('source', 'manual');
  if (error) throw error;
  await refreshCustomerBalance(customerId);
}
