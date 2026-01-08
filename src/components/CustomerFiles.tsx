import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, FileText, Upload, Download, Calendar, RefreshCw, Trash2, CheckCircle, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';

type CustomerFile = {
  id: string;
  month: number;
  year: number;
  filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  upload_source: string;
  created_at: string;
};

type CustomerFilesProps = {
  customerId: string;
  customerName: string;
  onBack?: () => void;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CustomerFiles({ customerId, customerName, onBack }: CustomerFilesProps) {
  const { profile } = useAuth();
  const { hasPermission } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.CUSTOMERS_FILES, 'view');
  const [files, setFiles] = useState<CustomerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadFiles();
  }, [customerId, selectedYear]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_files')
        .select('*')
        .eq('customer_id', customerId)
        .eq('year', selectedYear)
        .order('month', { ascending: true });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setMessage('Please select a file');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setUploading(true);
    try {
      if (!profile) throw new Error('Not authenticated');
      const timestamp = Date.now();
      const sanitizedFilename = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${customerId}/${selectedYear}/${uploadMonth}/${timestamp}_${sanitizedFilename}`;

      const { error: uploadError } = await supabase.storage
        .from('customer-files')
        .upload(storagePath, uploadFile, {
          contentType: uploadFile.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('customer_files')
        .insert({
          customer_id: customerId,
          month: uploadMonth,
          year: selectedYear,
          filename: uploadFile.name,
          storage_path: storagePath,
          file_size: uploadFile.size,
          mime_type: uploadFile.type,
          upload_source: 'manual_admin',
          uploaded_by: user?.id,
        });

      if (dbError) throw dbError;

      setMessage('File uploaded successfully');
      setUploadFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      await loadFiles();
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setMessage('Error uploading file: ' + error.message);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (file: CustomerFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('customer-files')
        .download(file.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file');
    }
  };

  const deleteFile = async (file: CustomerFile) => {
    if (!confirm(`Are you sure you want to delete ${file.filename}?`)) return;

    try {
      await supabase.storage
        .from('customer-files')
        .remove([file.storage_path]);

      const { error } = await supabase
        .from('customer_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      setMessage('File deleted successfully');
      await loadFiles();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Error deleting file');
    }
  };

  const getFilesForMonth = (month: number) => {
    return files.filter(f => f.month === month);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getAvailableYears = () => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  };

  // Check permission
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You do not have permission to view Customer Files.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Customers
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700">
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <FileText className="text-blue-400" size={24} />
                <div>
                  <h2 className="text-xl font-semibold text-white">{customerName} - Files</h2>
                  <p className="text-sm text-slate-400">Monthly file submissions</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {getAvailableYears().map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <button
                  onClick={loadFiles}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
            </div>

            {message && (
              <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-300">{message}</p>
              </div>
            )}

            <div className="bg-slate-700/30 rounded-lg p-6 border border-slate-600">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Upload size={20} />
                Upload New File
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Select Month</label>
                  <select
                    value={uploadMonth}
                    onChange={(e) => setUploadMonth(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {MONTHS.map((month, idx) => (
                      <option key={idx} value={idx + 1}>{month}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Select File</label>
                  <input
                    id="file-upload"
                    type="file"
                    onChange={handleFileSelect}
                    className="w-full px-4 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleUpload}
                    disabled={uploading || !uploadFile}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {uploading ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={18} />
                        Upload
                      </>
                    )}
                  </button>
                </div>
              </div>
              {uploadFile && (
                <p className="text-sm text-slate-400 mt-2">
                  Selected: {uploadFile.name} ({formatFileSize(uploadFile.size)})
                </p>
              )}
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin text-blue-400 mx-auto mb-4" size={32} />
                <p className="text-slate-400">Loading files...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {MONTHS.map((month, idx) => {
                  const monthNumber = idx + 1;
                  const monthFiles = getFilesForMonth(monthNumber);

                  return (
                    <div
                      key={monthNumber}
                      className={`p-4 rounded-lg border transition-all ${
                        monthFiles.length > 0
                          ? 'bg-green-500/10 border-green-500/30 hover:border-green-500/50'
                          : 'bg-slate-700/20 border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className={monthFiles.length > 0 ? 'text-green-400' : 'text-slate-500'} />
                          <span className={`text-sm font-medium ${monthFiles.length > 0 ? 'text-green-300' : 'text-slate-400'}`}>
                            {month}
                          </span>
                        </div>
                        {monthFiles.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-400 font-medium">{monthFiles.length}</span>
                            <CheckCircle size={16} className="text-green-400" />
                          </div>
                        )}
                      </div>

                      {monthFiles.length > 0 ? (
                        <div className="space-y-3">
                          {monthFiles.map((file) => (
                            <div key={file.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                              <div className="mb-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <FileText size={14} className="text-green-400 flex-shrink-0" />
                                  <p className="text-xs text-white font-medium truncate">
                                    {file.filename}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-400">
                                  {formatFileSize(file.file_size)}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  {new Date(file.created_at).toLocaleDateString()}
                                </p>
                                <p className="text-xs text-slate-500">
                                  via {file.upload_source.replace('_', ' ')}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => downloadFile(file)}
                                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                                >
                                  <Download size={12} />
                                  Download
                                </button>
                                <button
                                  onClick={() => deleteFile(file)}
                                  className="px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <FileText size={32} className="text-slate-600 mx-auto mb-2" />
                          <p className="text-xs text-slate-500">No files submitted</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
