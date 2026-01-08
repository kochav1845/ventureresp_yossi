import * as XLSX from 'xlsx';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  format?: (value: any) => any;
}

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  data: any[];
  title?: string;
  subtitle?: string;
}

export function exportToExcel(options: ExcelExportOptions): void {
  const {
    filename,
    sheetName = 'Sheet1',
    columns,
    data,
    title,
    subtitle
  } = options;

  const workbook = XLSX.utils.book_new();

  const worksheetData: any[][] = [];

  let currentRow = 0;

  if (title) {
    worksheetData.push([title]);
    currentRow++;
  }

  if (subtitle) {
    worksheetData.push([subtitle]);
    currentRow++;
  }

  if (title || subtitle) {
    worksheetData.push([]);
    currentRow++;
  }

  worksheetData.push(columns.map(col => col.header));
  currentRow++;

  data.forEach(row => {
    const rowData = columns.map(col => {
      const value = row[col.key];
      return col.format ? col.format(value) : value;
    });
    worksheetData.push(rowData);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  const columnWidths = columns.map(col => ({
    wch: col.width || Math.max(col.header.length, 15)
  }));
  worksheet['!cols'] = columnWidths;

  if (title) {
    const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (!worksheet[titleCell]) worksheet[titleCell] = { t: 's', v: title };
    worksheet[titleCell].s = {
      font: { bold: true, sz: 16, color: { rgb: '000000' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center' }
    };

    worksheet['!merges'] = worksheet['!merges'] || [];
    worksheet['!merges'].push({
      s: { r: 0, c: 0 },
      e: { r: 0, c: columns.length - 1 }
    });
  }

  if (subtitle) {
    const subtitleRow = title ? 1 : 0;
    const subtitleCell = XLSX.utils.encode_cell({ r: subtitleRow, c: 0 });
    if (!worksheet[subtitleCell]) worksheet[subtitleCell] = { t: 's', v: subtitle };
    worksheet[subtitleCell].s = {
      font: { italic: true, sz: 12, color: { rgb: '000000' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center' }
    };

    worksheet['!merges'] = worksheet['!merges'] || [];
    worksheet['!merges'].push({
      s: { r: subtitleRow, c: 0 },
      e: { r: subtitleRow, c: columns.length - 1 }
    });
  }

  const headerRow = (title ? 1 : 0) + (subtitle ? 1 : 0) + (title || subtitle ? 1 : 0);
  columns.forEach((_, colIndex) => {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: colIndex });
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].s = {
        font: { bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'center' }
      };
    }
  });

  Object.keys(worksheet).forEach(cellAddress => {
    if (cellAddress[0] === '!') return;

    if (!worksheet[cellAddress].s) {
      worksheet[cellAddress].s = {};
    }

    if (!worksheet[cellAddress].s.font) {
      worksheet[cellAddress].s.font = {};
    }
    worksheet[cellAddress].s.font.color = { rgb: '000000' };

    if (!worksheet[cellAddress].s.fill) {
      worksheet[cellAddress].s.fill = { fgColor: { rgb: 'FFFFFF' } };
    }
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;

  XLSX.writeFile(workbook, finalFilename, { bookType: 'xlsx', cellStyles: true });
}

export function formatCurrency(value: any): string {
  if (value === null || value === undefined) return '$0.00';
  const num = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
}

export function formatDate(value: any): string {
  if (!value) return '';
  try {
    const date = new Date(value);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return String(value);
  }
}

export function formatDateTime(value: any): string {
  if (!value) return '';
  try {
    const date = new Date(value);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(value);
  }
}

export function formatBoolean(value: any): string {
  return value ? 'Yes' : 'No';
}

export function formatPercentage(value: any): string {
  if (value === null || value === undefined) return '0%';
  const num = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(num) ? '0%' : `${num.toFixed(2)}%`;
}
