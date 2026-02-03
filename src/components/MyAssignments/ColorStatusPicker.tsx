interface ColorStatusPickerProps {
  currentStatus: string | null;
  onColorChange: (color: string | null) => void;
  onClose: () => void;
}

export default function ColorStatusPicker({ currentStatus, onColorChange, onClose }: ColorStatusPickerProps) {
  return (
    <div className="absolute z-50 left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[140px]">
      <button
        onClick={() => onColorChange('red')}
        className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded flex items-center gap-2"
      >
        <span className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-700"></span>
        Will Not Pay
      </button>
      <button
        onClick={() => onColorChange('yellow')}
        className="w-full text-left px-3 py-2 text-sm hover:bg-yellow-50 rounded flex items-center gap-2"
      >
        <span className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-yellow-600"></span>
        Will Take Care
      </button>
      <button
        onClick={() => onColorChange('green')}
        className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 rounded flex items-center gap-2"
      >
        <span className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-700"></span>
        Will Pay
      </button>
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
