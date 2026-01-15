import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Download, Image as ImageIcon, RefreshCw, FileImage, TestTube } from 'lucide-react';
import AcumaticaFilesTest from './AcumaticaFilesTest';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PaymentCheckImagesProps {
  onBack?: () => void;
}

interface Attachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  is_check_image: boolean;
  check_side: string | null;
  converted_from_pdf: boolean;
  synced_at: string;
}

interface AcumaticaFile {
  PaymentType: string;
  PaymentRefNbr: string;
  CustomerID: string;
  PaymentNoteID: string;
  FileID: string;
  FileName: string;
  FileCreatedDate: string;
  downloadUrl: string;
  fileContent?: string;
  fileSize?: number;
  error?: string;
}

interface Payment {
  reference_number: string;
  type: string;
  customer_id: string;
  application_date: string;
  payment_amount: number;
  status: string;
}

export default function PaymentCheckImages({ onBack }: PaymentCheckImagesProps) {
  // SECURITY: Credentials are stored in edge functions, NOT in frontend code
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const [payments, setPayments] = useState<Payment[]>([]);
  const [allPaymentsForBatch, setAllPaymentsForBatch] = useState<Payment[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [acumaticaFiles, setAcumaticaFiles] = useState<AcumaticaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [convertedImages, setConvertedImages] = useState<{ pageNumber: number; base64Data: string }[]>([]);
  const [converting, setConverting] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);
  const [batchLogs, setBatchLogs] = useState<Array<{
    paymentRef: string;
    status: 'processing' | 'success' | 'error' | 'no-files';
    message: string;
    filesCount: number;
    timestamp: Date;
    attachments?: Array<{
      id: string;
      file_name: string;
      storage_path: string;
      file_type: string;
      file_size: number;
    }>;
  }>>([]);
  const [showBatchLogs, setShowBatchLogs] = useState(false);

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    if (selectedPayment) {
      loadAttachments();
    }
  }, [selectedPayment]);

  const loadPayments = async (newOffset: number = 0) => {
    setLoading(true);
    try {
      const { count } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: true });

      setTotalPayments(count || 0);

      const { data, error } = await supabase
        .from('acumatica_payments')
        .select('reference_number, type, customer_id, application_date, payment_amount, status')
        .order('application_date', { ascending: false })
        .range(newOffset, newOffset + 99);

      if (error) throw error;
      setPayments(data || []);
      setOffset(newOffset);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadNext1000 = async () => {
    const newOffset = offset + 1000;
    await loadPayments(newOffset);
    setBatchLogs([]);
    setShowBatchLogs(false);
  };

  const loadAttachments = async () => {
    if (!selectedPayment) return;

    try {
      const { data, error } = await supabase
        .from('payment_attachments')
        .select('*')
        .eq('payment_reference_number', selectedPayment)
        .order('synced_at', { ascending: false });

      if (error) throw error;
      setAttachments(data || []);
    } catch (err: any) {
      console.error('Error loading attachments:', err);
    }
  };

  const handleFetchAttachments = async () => {
    if (!selectedPayment) {
      setError('Please select a payment');
      return;
    }

    setFetching(true);
    setError('');
    setSuccess('');
    setConvertedImages([]);

    try {
      setSuccess('Step 1/2: Fetching and downloading payment attachments...');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-payment-attachments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            paymentRefNumber: selectedPayment,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch attachments');
      }

      if (result.filesCount === 0) {
        setSuccess('No files found for this payment in Acumatica.');
        setAcumaticaFiles([]);
        return;
      }

      setAcumaticaFiles(result.files || []);

      const pdfFile = result.files.find((f: any) =>
        f.FileName.toLowerCase().endsWith('.pdf') && f.fileContent
      );

      if (pdfFile && pdfFile.fileContent) {
        setConverting(true);
        setSuccess('Step 2/2: Converting PDF to images...');

        const pdfBytes = Uint8Array.from(atob(pdfFile.fileContent), c => c.charCodeAt(0));
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        const pageCount = pdf.numPages;

        const images: { pageNumber: number; base64Data: string }[] = [];

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            throw new Error('Failed to get canvas context');
          }

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          const base64Jpg = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

          images.push({
            pageNumber: pageNum,
            base64Data: base64Jpg,
          });
        }

        setConvertedImages(images);
        setSuccess(`✅ Successfully found ${result.filesCount} file(s) and converted ${images.length} page(s) to images!`);
      } else {
        setSuccess(`Found ${result.filesCount} file(s) attached to payment ${selectedPayment}!`);
      }

      await loadAttachments();
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching attachments');
    } finally {
      setFetching(false);
      setConverting(false);
    }
  };

  const handleBatchFetchAttachments = async () => {
    setBatchProcessing(true);
    setBatchLogs([]);
    setShowBatchLogs(true);
    setError('');
    setSuccess('');
    setCurrentProcessingIndex(0);

    try {
      const allPayments: Payment[] = [];

      for (let batchNum = 0; batchNum < 10; batchNum++) {
        const currentOffset = offset + (batchNum * 100);

        const { data, error } = await supabase
          .from('acumatica_payments')
          .select('reference_number, type, customer_id, application_date, payment_amount, status')
          .order('application_date', { ascending: false })
          .range(currentOffset, currentOffset + 99);

        if (error) {
          console.error(`Error loading batch ${batchNum + 1}:`, error);
          break;
        }

        if (!data || data.length === 0) {
          break;
        }

        allPayments.push(...data);
      }

      setAllPaymentsForBatch(allPayments);

      for (let i = 0; i < allPayments.length; i++) {
        const payment = allPayments[i];
        const paymentRef = payment.reference_number;
        setCurrentProcessingIndex(i + 1);

        setBatchLogs(prev => [...prev, {
          paymentRef,
          status: 'processing',
          message: `Processing ${i + 1}/${allPayments.length}...`,
          filesCount: 0,
          timestamp: new Date(),
        }]);

        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-payment-attachments`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                paymentRefNumber: paymentRef,
              }),
            }
          );

          const result = await response.json();

          if (!response.ok || !result.success) {
            setBatchLogs(prev => prev.map((log, idx) =>
              idx === prev.length - 1
                ? { ...log, status: 'error', message: result.error || 'Failed to fetch attachments' }
                : log
            ));
            continue;
          }

          if (result.filesCount === 0) {
            setBatchLogs(prev => prev.map((log, idx) =>
              idx === prev.length - 1
                ? { ...log, status: 'no-files', message: 'No attachments found', filesCount: 0 }
                : log
            ));
            continue;
          }

          const { data: savedAttachments } = await supabase
            .from('payment_attachments')
            .select('id, file_name, storage_path, file_type, file_size')
            .eq('payment_reference_number', paymentRef);

          setBatchLogs(prev => prev.map((log, idx) =>
            idx === prev.length - 1
              ? {
                  ...log,
                  status: 'success',
                  message: `Found and saved ${result.filesCount} file(s)`,
                  filesCount: result.filesCount,
                  attachments: savedAttachments || []
                }
              : log
          ));

        } catch (err: any) {
          setBatchLogs(prev => prev.map((log, idx) =>
            idx === prev.length - 1
              ? { ...log, status: 'error', message: err.message || 'Unknown error' }
              : log
          ));
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setSuccess(`Batch processing complete! Processed ${allPayments.length} payment(s) from offset ${offset} to ${offset + allPayments.length}.`);
    } catch (err: any) {
      setError(err.message || 'An error occurred during batch processing');
    } finally {
      setBatchProcessing(false);
      setCurrentProcessingIndex(0);
    }
  };

  const downloadAttachmentFromLog = async (storagePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('payment-check-images')
        .download(storagePath);

      if (error) throw error;
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setError(`Failed to download file: ${err.message}`);
    }
  };

  const viewImage = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('payment-check-images')
        .createSignedUrl(attachment.storage_path, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        setPreviewImage(data.signedUrl);
      }
    } catch (err: any) {
      setError(`Failed to load image: ${err.message}`);
    }
  };

  const downloadImage = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('payment-check-images')
        .download(attachment.storage_path);

      if (error) throw error;
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.file_name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setError(`Failed to download image: ${err.message}`);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (showTest) {
    return <AcumaticaFilesTest />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Payments
          </button>
          <button
            onClick={() => setShowTest(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <TestTube className="w-5 h-5" />
            Test API Access
          </button>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-6">
          <h1 className="text-2xl font-bold text-white mb-6">Payment Check Images</h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select Payment
              </label>
              <select
                value={selectedPayment}
                onChange={(e) => setSelectedPayment(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Choose a payment...</option>
                {payments.map(payment => (
                  <option key={payment.reference_number} value={payment.reference_number}>
                    {payment.reference_number} - {payment.customer_id} - $
                    {payment.payment_amount?.toFixed(2)} ({new Date(payment.application_date).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-green-400 text-sm">{success}</p>
              </div>
            )}

            <button
              onClick={handleFetchAttachments}
              disabled={!selectedPayment || fetching || converting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {fetching || converting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  {converting ? 'Converting PDF to Images...' : 'Fetching Attachments...'}
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Fetch & Convert to Images
                </>
              )}
            </button>

            <div className="pt-4 border-t border-slate-700 space-y-3">
              <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-400">Total Payments:</span>
                  <span className="text-white font-medium">{totalPayments.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-400">Current Range:</span>
                  <span className="text-white font-medium">{offset + 1} - {Math.min(offset + 1000, totalPayments)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Will Process:</span>
                  <span className="text-green-400 font-medium">Up to 1,000 payments</span>
                </div>
              </div>

              <button
                onClick={handleBatchFetchAttachments}
                disabled={totalPayments === 0 || batchProcessing}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {batchProcessing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Processing {currentProcessingIndex}/{allPaymentsForBatch.length} Payments...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Batch Fetch Next 1,000 Payments
                  </>
                )}
              </button>

              {offset + 1000 < totalPayments && !batchProcessing && (
                <button
                  onClick={loadNext1000}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Load Next 1,000 Payments
                </button>
              )}

              <p className="text-slate-500 text-xs text-center">
                Processes payments in chunks of 100, automatically continuing up to 1,000
              </p>
            </div>
          </div>
        </div>

        {showBatchLogs && batchLogs.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <FileImage className="w-6 h-6 text-green-400" />
                <h2 className="text-xl font-bold text-white">
                  Batch Processing Logs ({batchLogs.length})
                </h2>
              </div>
              <button
                onClick={() => setShowBatchLogs(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
              >
                Hide Logs
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {batchLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`bg-slate-900 border rounded-lg p-4 ${
                    log.status === 'success' ? 'border-green-500/30' :
                    log.status === 'error' ? 'border-red-500/30' :
                    log.status === 'no-files' ? 'border-yellow-500/30' :
                    'border-blue-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium">Payment: {log.paymentRef}</span>
                        <span className={`px-2 py-1 text-xs rounded ${
                          log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                          log.status === 'error' ? 'bg-red-500/20 text-red-400' :
                          log.status === 'no-files' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {log.status === 'processing' && <RefreshCw className="w-3 h-3 inline animate-spin mr-1" />}
                          {log.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm">{log.message}</p>
                      <p className="text-slate-500 text-xs mt-1">
                        {log.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  {log.attachments && log.attachments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <p className="text-slate-400 text-xs font-medium mb-2">
                        Attachments ({log.attachments.length}):
                      </p>
                      <div className="space-y-2">
                        {log.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between bg-slate-950 rounded p-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{attachment.file_name}</p>
                              <p className="text-slate-500 text-xs">
                                {attachment.file_type} • {formatFileSize(attachment.file_size)}
                              </p>
                            </div>
                            <button
                              onClick={() => downloadAttachmentFromLog(attachment.storage_path, attachment.file_name)}
                              className="ml-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded flex items-center gap-1 transition-colors"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-green-500/10 rounded p-3">
                  <p className="text-2xl font-bold text-green-400">
                    {batchLogs.filter(log => log.status === 'success').length}
                  </p>
                  <p className="text-slate-400 text-xs">Success</p>
                </div>
                <div className="bg-yellow-500/10 rounded p-3">
                  <p className="text-2xl font-bold text-yellow-400">
                    {batchLogs.filter(log => log.status === 'no-files').length}
                  </p>
                  <p className="text-slate-400 text-xs">No Files</p>
                </div>
                <div className="bg-red-500/10 rounded p-3">
                  <p className="text-2xl font-bold text-red-400">
                    {batchLogs.filter(log => log.status === 'error').length}
                  </p>
                  <p className="text-slate-400 text-xs">Errors</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {convertedImages.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <ImageIcon className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold text-white">
                Converted Check Images ({convertedImages.length} page{convertedImages.length !== 1 ? 's' : ''})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {convertedImages.map((image) => (
                <div
                  key={image.pageNumber}
                  className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden hover:border-purple-500 transition-colors"
                >
                  <div className="p-4 bg-slate-950 border-b border-slate-700 flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      Page {image.pageNumber}
                    </span>
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `data:image/jpeg;base64,${image.base64Data}`;
                        link.download = `payment-${selectedPayment}-page-${image.pageNumber}.jpg`;
                        link.click();
                      }}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2 text-sm transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download JPG
                    </button>
                  </div>
                  <div className="p-4">
                    <img
                      src={`data:image/jpeg;base64,${image.base64Data}`}
                      alt={`Page ${image.pageNumber}`}
                      className="w-full h-auto rounded border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setPreviewImage(`data:image/jpeg;base64,${image.base64Data}`)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {acumaticaFiles.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <FileImage className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-bold text-white">
                Files in Acumatica ({acumaticaFiles.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {acumaticaFiles.map(file => (
                <div
                  key={file.FileID}
                  className="bg-slate-900 border border-slate-700 rounded-lg p-4 hover:border-green-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-white font-medium text-sm mb-1 truncate">
                        {file.FileName}
                      </h3>
                      <span className="inline-block px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                        From Acumatica
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400 mb-4">
                    <p>File ID: {file.FileID.substring(0, 8)}...</p>
                    <p>Payment: {file.PaymentRefNbr}</p>
                    {file.FileCreatedDate && (
                      <p>Created: {new Date(file.FileCreatedDate).toLocaleString()}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedPayment && attachments.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8">
            <div className="flex items-center gap-2 mb-6">
              <FileImage className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold text-white">
                Stored Locally ({attachments.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {attachments.map(attachment => (
                <div
                  key={attachment.id}
                  className="bg-slate-900 border border-slate-700 rounded-lg p-4 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-white font-medium text-sm mb-1 truncate">
                        {attachment.file_name}
                      </h3>
                      {attachment.is_check_image && (
                        <span className="inline-block px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                          Check {attachment.check_side || ''}
                        </span>
                      )}
                      {attachment.converted_from_pdf && (
                        <span className="inline-block px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded ml-2">
                          Converted from PDF
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400 mb-4">
                    <p>Type: {attachment.file_type}</p>
                    <p>Size: {formatFileSize(attachment.file_size)}</p>
                    <p>Synced: {new Date(attachment.synced_at).toLocaleString()}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => viewImage(attachment)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      <ImageIcon className="w-4 h-4" />
                      View
                    </button>
                    <button
                      onClick={() => downloadImage(attachment)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedPayment && attachments.length === 0 && !fetching && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <FileImage className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No attachments found for this payment.</p>
            <p className="text-slate-500 text-sm mt-2">
              Click "Fetch Attachments" to download from Acumatica.
            </p>
          </div>
        )}

        {previewImage && (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"
            onClick={() => setPreviewImage(null)}
          >
            <div className="max-w-5xl max-h-full">
              <img
                src={previewImage}
                alt="Check preview"
                className="max-w-full max-h-screen object-contain rounded-lg"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
