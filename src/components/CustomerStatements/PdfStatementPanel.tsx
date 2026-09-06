import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { Download, Loader2, FileText, Info } from 'lucide-react';
import { DEFAULT_EXCEL_LAYOUT, normalizeExcelLayout, type StatementExcelLayout } from '../../lib/statementExport';
import { buildStatementHtml, downloadCustomerStatementPdf } from '../../lib/statementPdf';
import { SAMPLE_CUSTOMER } from './ExcelTemplatesPanel';
import type { StatementExcelTemplate } from './types';

export default function PdfStatementPanel() {
  const toast = useToast();
  const [templates, setTemplates] = useState<StatementExcelTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('statement_excel_templates')
          .select('id, name, layout, is_default')
          .order('is_default', { ascending: false })
          .order('name');
        if (error) throw error;
        const mapped: StatementExcelTemplate[] = (data || []).map((t: any) => ({
          id: t.id, name: t.name, layout: normalizeExcelLayout(t.layout), is_default: !!t.is_default,
        }));
        setTemplates(mapped);
        setSelectedId(mapped.find(t => t.is_default)?.id || mapped[0]?.id || null);
      } catch (e) {
        console.error('Error loading templates for PDF preview:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const layout: StatementExcelLayout = useMemo(
    () => templates.find(t => t.id === selectedId)?.layout || DEFAULT_EXCEL_LAYOUT,
    [templates, selectedId],
  );

  const previewHtml = useMemo(() => buildStatementHtml(SAMPLE_CUSTOMER, layout), [layout]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCustomerStatementPdf(SAMPLE_CUSTOMER, layout);
    } catch (e: any) {
      toast.error('Could not build the sample PDF: ' + (e?.message || e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">PDF statement</h2>
          <p className="text-sm text-gray-500">The PDF attachment customers can receive alongside (or instead of) the Excel sheet.</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {downloading ? 'Building…' : 'Download sample PDF'}
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-[12px] text-blue-800">
        <Info size={15} className="mt-0.5 flex-shrink-0" />
        <p>
          The PDF uses the same layout as the Excel sheet — the title, customer info block, aging summary,
          columns and total row you configure under <strong>Excel sheet</strong> apply here too. Pick a saved
          layout below to preview how its PDF looks.
        </p>
      </div>

      {templates.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Preview layout:</label>
          <select
            value={selectedId || ''}
            onChange={e => setSelectedId(e.target.value || null)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-400"
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-900">
          <FileText size={15} className="text-gray-400" /> Preview
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="rounded-xl border border-gray-300 bg-gray-100 p-4 overflow-x-auto">
            {/* Render on a page-like white sheet, matching the PDF output. */}
            <div
              className="bg-white shadow-sm mx-auto"
              style={{ width: 816, maxWidth: '100%' }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
