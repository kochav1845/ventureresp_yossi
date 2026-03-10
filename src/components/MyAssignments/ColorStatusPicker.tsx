import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

interface ColorStatusPickerProps {
  currentStatus: string | null;
  onColorChange: (color: string | null) => void;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

interface ColorStatusOption {
  status_name: string;
  display_name: string;
  color_class: string;
}

export default function ColorStatusPicker({ currentStatus, onColorChange, onClose, anchorRect }: ColorStatusPickerProps) {
  const [colorOptions, setColorOptions] = useState<ColorStatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadColorOptions();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const loadColorOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_color_status_options')
        .select('status_name, display_name, color_class')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setColorOptions(data || []);
    } catch (error) {
      console.error('Error loading color options:', error);
    } finally {
      setLoading(false);
    }
  };

  const getColorClasses = (colorClass: string) => {
    const parts = colorClass.split(' ');
    const bgColor = parts.find(p => p.startsWith('bg-')) || 'bg-gray-500';
    const borderColor = parts.find(p => p.startsWith('border-')) || 'border-gray-700';
    return { bgColor, borderColor };
  };

  const getStyle = (): React.CSSProperties => {
    if (!anchorRect) return {};
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const menuHeight = 300;
    const top = spaceBelow > menuHeight
      ? anchorRect.bottom + 4
      : anchorRect.top - menuHeight - 4;

    let left = anchorRect.right - 180;
    if (left < 8) left = 8;

    return {
      position: 'fixed',
      top: Math.max(8, top),
      left,
      zIndex: 99999,
    };
  };

  const content = (
    <div
      ref={menuRef}
      style={anchorRect ? getStyle() : undefined}
      className={`${anchorRect ? '' : 'absolute z-50 left-0 mt-2'} bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[180px] max-h-[280px] overflow-y-auto`}
      onClick={(e) => e.stopPropagation()}
    >
      {loading ? (
        <p className="text-xs text-gray-500 px-3 py-2">Loading...</p>
      ) : (
        <>
          {colorOptions.map((option) => {
            const { bgColor, borderColor } = getColorClasses(option.color_class);
            return (
              <button
                key={option.status_name}
                onClick={() => onColorChange(option.status_name)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded flex items-center gap-2"
              >
                <span className={`w-4 h-4 rounded-full ${bgColor} border-2 ${borderColor}`}></span>
                {option.display_name}
              </button>
            );
          })}
          {currentStatus && (
            <>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => onColorChange(null)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded text-gray-600"
              >
                Clear Status
              </button>
            </>
          )}
        </>
      )}
    </div>
  );

  if (anchorRect) {
    return createPortal(content, document.body);
  }
  return content;
}
