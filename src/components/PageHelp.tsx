import { useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

export type HelpItem = {
  label: string;
  body: string;
  /** A color dot shown before the label (e.g. for the red/yellow/green statuses). */
  swatch?: string;
  /** An icon shown before the label. */
  icon?: ReactNode;
};

export type HelpSection = { heading: string; items: HelpItem[] };

// A small "Help" button that opens a right-side panel explaining everything on the
// current page. Give it a title, an optional intro line, and grouped items. Drop it
// in any page header: <PageHelp title="Customers" sections={CUSTOMERS_HELP} />.
export default function PageHelp({ title, intro, sections }: { title: string; intro?: string; sections: HelpSection[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`What's on the ${title} page?`}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors flex-shrink-0"
      >
        <HelpCircle size={15} /> Help
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50"><HelpCircle size={16} className="text-blue-600" /></div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{title} — guide</h2>
                  <p className="text-[11px] text-gray-500">What everything on this page means.</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {intro && <p className="text-sm text-gray-600 leading-relaxed">{intro}</p>}
              {sections.map((section) => (
                <div key={section.heading}>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">{section.heading}</p>
                  <div className="space-y-2.5">
                    {section.items.map((it) => (
                      <div key={it.label} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 mt-0.5 flex items-center justify-center w-4">
                          {it.swatch
                            ? <span className="w-3 h-3 rounded-full ring-1 ring-black/5" style={{ background: it.swatch }} />
                            : (it.icon ?? <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />)}
                        </span>
                        <p className="text-[13px] text-gray-700 leading-relaxed">
                          <span className="font-semibold text-gray-900">{it.label}</span>
                          {' — '}{it.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                Tip: hover over most icons and buttons on the page and a short tooltip explains what they do.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
