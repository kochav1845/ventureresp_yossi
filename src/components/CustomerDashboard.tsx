import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, User as UserIcon, Mail, Calendar, FileText, Upload, Download, CheckCircle, RefreshCw, Clock, AlertCircle } from 'lucide-react';

type CustomerFile = {
  id: string;
  month: number;
  year: number;
  filename: string;
  storage_path: string;
  file_size: number;
  created_at: string;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CustomerDashboard() {
  const { profile, signOut } = useAuth();
  const [files, setFiles] = useState<CustomerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [postponeUntil, setPostponeUntil] = useState<string | null>(null);
  const [postponeReason, setPostponeReason] = useState<string | null>(null);

  useEffect(() => {
    loadCustomerData();
  }, [profile]);

  useEffect(() => {
    if (customerId) {
      loadFiles();
    }
  }, [customerId, selectedYear]);

  const loadCustomerData = async () => {
    if (!profile?.email) return;

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, postpone_until, postpone_reason')
        .eq('email', profile.email)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setCustomerId(data.id);
        setPostponeUntil(data.postpone_until);
        setPostponeReason(data.postpone_reason);
      }
    } catch (error) {
      console.error('Error loading customer data:', error);
    }
  };

  const loadFiles = async () => {
    if (!customerId) return;

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
    if (!uploadFile || !customerId) {
      setMessage('Please select a file');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setUploading(true);
    try {
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
          upload_source: 'manual_customer',
        });

      if (dbError) throw dbError;

      await supabase
        .from('customers')
        .update({ responded_this_month: true })
        .eq('id', customerId);

      setMessage('File uploaded successfully');
      setUploadFile(null);
      const fileInput = document.getElementById('customer-file-upload') as HTMLInputElement;
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

  const getFileForMonth = (month: number) => {
    return files.find(f => f.month === month);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-2 rounded-lg">
                <UserIcon size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Customer Dashboard</h1>
                <p className="text-sm text-slate-400">{profile?.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {message && (
          <div className="p-4 bg-blue-500/20 border border-blue-500 rounded-lg">
            <p className="text-blue-200">{message}</p>
          </div>
        )}

        {postponeUntil && new Date(postponeUntil) > new Date() && (
          <div className="p-4 bg-yellow-500/20 border border-yellow-500 rounded-lg">
            <div className="flex items-start gap-3">
              <Clock className="text-yellow-400 flex-shrink-0 mt-1" size={20} />
              <div>
                <h3 className="text-lg font-semibold text-yellow-200 mb-1">Emails Postponed</h3>
                <p className="text-yellow-100">
                  Your scheduled emails are paused until <strong>{new Date(postponeUntil).toLocaleDateString()}</strong>
                </p>
                {postponeReason && (
                  <p className="text-sm text-yellow-200 mt-1 opacity-80">{postponeReason}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Account Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-4 p-4 bg-slate-700/50 rounded-lg">
              <div className="bg-blue-500/20 p-3 rounded-full">
                <Mail className="text-blue-400" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Email</p>
                <p className="text-white font-medium">{profile?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-700/50 rounded-lg">
              <div className="bg-cyan-500/20 p-3 rounded-full">
                <UserIcon className="text-cyan-400" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Role</p>
                <p className="text-white font-medium capitalize">{profile?.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-700/50 rounded-lg">
              <div className="bg-green-500/20 p-3 rounded-full">
                <Calendar className="text-green-400" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Member Since</p>
                <p className="text-white font-medium">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {customerId && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <FileText className="text-blue-400" size={24} />
                  <div>
                    <h2 className="text-xl font-semibold text-white">My Files</h2>
                    <p className="text-sm text-slate-400">Upload and manage your monthly submissions</p>
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
                  Upload File
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
                      id="customer-file-upload"
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
                    const file = getFileForMonth(monthNumber);

                    return (
                      <div
                        key={monthNumber}
                        className={`p-4 rounded-lg border transition-all ${
                          file
                            ? 'bg-green-500/10 border-green-500/30'
                            : 'bg-slate-700/20 border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className={file ? 'text-green-400' : 'text-slate-500'} />
                            <span className={`text-sm font-medium ${file ? 'text-green-300' : 'text-slate-400'}`}>
                              {month}
                            </span>
                          </div>
                          {file && (
                            <CheckCircle size={16} className="text-green-400" />
                          )}
                        </div>

                        {file ? (
                          <div>
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText size={16} className="text-green-400" />
                                <p className="text-sm text-white font-medium truncate">
                                  {file.filename}
                                </p>
                              </div>
                              <p className="text-xs text-slate-400">
                                {formatFileSize(file.file_size)}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                {new Date(file.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <button
                              onClick={() => downloadFile(file)}
                              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                            >
                              <Download size={14} />
                              Download
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <FileText size={32} className="text-slate-600 mx-auto mb-2" />
                            <p className="text-xs text-slate-500">No file submitted</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
