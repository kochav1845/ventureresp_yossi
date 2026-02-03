import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ColorStatusPickerProps {
  currentStatus: string | null;
  onColorChange: (color: string | null) => void;
  onClose: () => void;
}

interface ColorStatusOption {
  status_name: string;
  display_name: string;
  color_class: string;
}

export default function ColorStatusPicker({ currentStatus, onColorChange, onClose }: ColorStatusPickerProps) {
  const [colorOptions, setColorOptions] = useState<ColorStatusOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadColorOptions();
  }, []);

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
    // Extract the bg and border colors from the color_class
    const parts = colorClass.split(' ');
    const bgColor = parts.find(p => p.startsWith('bg-')) || 'bg-gray-500';
    const borderColor = parts.find(p => p.startsWith('border-')) || 'border-gray-700';
    return { bgColor, borderColor };
  };

  if (loading) {
    return (
      <div className="absolute z-50 left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[140px]">
        <p className="text-xs text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="absolute z-50 left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[140px]">
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
    </div>
  );
}
