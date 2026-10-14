// Storing Acumatica payment attachments in the payment-check-images bucket.
// No imports, so the key rules can be unit-tested outside Deno.
//
// Rule: an Acumatica file is uploaded ONCE. Its object key is derived from the
// Acumatica file id (not the time of the run), and uploads never overwrite, so a
// retry after a half-finished run lands on the same key ("already exists") and
// can never add a second copy. 701k duplicate copies had to be deleted on
// 2026-10-01 when keys were "<timestamp>-<name>" and every run re-uploaded.

export const CHECK_IMAGE_BUCKET = 'payment-check-images';

/**
 * Supabase Storage rejects keys outside  A-Z a-z 0-9 _ / ! - . * ' ( ) space & $ @ = ; : + , ?
 * with 400 InvalidKey. "Remittance_Advice_ACH_from_Big_Ten_Supply[55] copy.pdf"
 * (payment 032603) failed on its "[55]" every run from 2026-10-14 09:50 UTC.
 * We keep a stricter set (letters, digits, . _ - ( ) space), fold accents to
 * ASCII, and cap the length so the key stays well inside the limits.
 */
export function storageSafeFileName(name: string, maxLen = 120): string {
  const base = String(name ?? '').split(/[\\/]/).pop() || '';
  let safe = base
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._\-() ]+/g, '_')
    .replace(/_{2,}/g, '_')
    .trim();
  if (!safe || /^\.+$/.test(safe)) safe = 'file';
  if (safe.length > maxLen) {
    const dot = safe.lastIndexOf('.');
    const ext = dot > 0 && safe.length - dot <= 10 ? safe.slice(dot) : '';
    safe = safe.slice(0, maxLen - ext.length).trimEnd() + ext;
  }
  return safe;
}

/** The one key an Acumatica file is stored under: payments/<ref>/<fileId>-<name>. */
export function attachmentStoragePath(refNbr: string, fileId: string, fileName: string): string {
  return `payments/${storageSafeFileName(refNbr, 40)}/${storageSafeFileName(fileId, 64)}-${storageSafeFileName(fileName)}`;
}

/** Storage answers a non-upsert upload of an existing key with 409 "Duplicate / already exists". */
export function isAlreadyExistsError(err: any): boolean {
  if (!err) return false;
  return String(err.statusCode) === '409' || err.status === 409 ||
    /already exists|duplicate/i.test(String(err.message || err.error || ''));
}

/**
 * Upload without ever overwriting. ok:true when the object is in the bucket
 * afterwards (existed:true = an earlier, half-finished run had already put it there).
 */
export async function uploadAttachmentOnce(
  supabase: any,
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ ok: boolean; existed: boolean; error?: string }> {
  const { error } = await supabase.storage
    .from(CHECK_IMAGE_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (!error) return { ok: true, existed: false };
  if (isAlreadyExistsError(error)) return { ok: true, existed: true };
  const code = (error as any).statusCode || (error as any).status;
  return { ok: false, existed: false, error: `${error.message}${code ? ` (${code})` : ''}` };
}
