import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import Papa from 'papaparse';
import { 
  Upload, 
  Search, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Fingerprint, 
  Zap, 
  Layers, 
  Eye, 
  Maximize2,
  RefreshCw,
  Crosshair,
  Binary,
  FileText,
  Download,
  Scale,
  Activity,
  History,
  Info,
  ChevronDown,
  ChevronUp,
  Filter,
  CheckCircle2,
  Table as TableIcon,
  LayoutGrid,
  Trash2
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import MetadataPanel from './components/MetadataPanel';
import VerdictCard from './components/VerdictCard';
import EvidenceList from './components/EvidenceList';
import { generateForensicReport } from './utils/pdfGenerator';
import { generateCaseId, REPORT_STYLES } from './utils/reportTemplates';

interface AnalysisResult {
  classification: string;
  aiLikelihood: number;
  realLikelihood: number;
  editedLikelihood: number;
  consistencyScore: number;
  confidenceLevel: 'Low' | 'Medium' | 'High';
  keyEvidence: string[];
  detectedIssues: string[];
  mostLikelySource: string;
  forensicSummary: string;
  finalVerdict: string;
  deepScan?: boolean;
  elaScore?: number | null;
  elaInterpretation?: string | null;
}

interface BatchResult extends AnalysisResult {
  id: string;
  filename: string;
  timestamp: string;
  thumbnail: string;
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  errorDetail?: string;
}

type SortField = 'filename' | 'classification' | 'aiLikelihood' | 'timestamp' | 'consistencyScore';
type SortOrder = 'asc' | 'desc';

export default function App() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exifData, setExifData] = useState<any>(null);
  
  // Batch State
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [viewMode, setViewMode] = useState<'single' | 'batch'>('single');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterClassification, setFilterClassification] = useState<string>('all');
  
  const [singleDeepScan, setSingleDeepScan] = useState(false);
  const [batchDeepScan, setBatchDeepScan] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE = 15 * 1024 * 1024;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Unsupported file type: ${file.type}. Use JPEG, PNG, or WebP.`);
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(`File too large: ${file.name}. Maximum 15MB.`);
        return;
      }
    }

    if (files.length > 1) {
      handleMultipleUploads(Array.from(files));
      setViewMode('batch');
      return;
    }

    const file = files[0];
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setSelectedImage(base64);
      setResult(null);
      setError(null);
      setViewMode('single');
      
      // Extract EXIF via server
      try {
        const base64Data = base64.split(',')[1];
        const metaResponse = await fetch('/api/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data }),
        });
        if (metaResponse.ok) {
          const metaData = await metaResponse.json();
          setExifData(metaData);
        }
      } catch (err) {
        console.warn("Server-side metadata extraction failed", err);
        setExifData(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMultipleUploads = (files: File[]) => {
    const entries: { id: string; file: File }[] = files.map(file => ({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
      file,
    }));

    const newItems: BatchResult[] = entries.map(entry => ({
      id: entry.id,
      filename: entry.file.name,
      timestamp: new Date().toISOString(),
      thumbnail: '',
      status: 'pending',
      classification: 'Mixed/Uncertain',
      aiLikelihood: 0,
      realLikelihood: 0,
      editedLikelihood: 0,
      consistencyScore: 0,
      confidenceLevel: 'Low',
      keyEvidence: [],
      detectedIssues: [],
      mostLikelySource: '',
      forensicSummary: '',
      finalVerdict: ''
    }));

    entries.forEach((entry) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBatchResults(prev => prev.map(item =>
          item.id === entry.id ? { ...item, thumbnail: reader.result as string } : item
        ));
      };
      reader.readAsDataURL(entry.file);
    });

    setBatchResults(prev => [...newItems, ...prev]);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnalyzing) {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const runAnalysis = async () => {
    if (!selectedImage) return;

    setIsAnalyzing(true);
    setError(null);
    try {
      const base64 = selectedImage.split(',')[1];
      const mimeType = selectedImage.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType, deepScan: singleDeepScan }),
      });

      if (!response.ok) throw new Error('Analysis failed.');
      const data = await response.json();
      setResult({ ...data, deepScan: singleDeepScan });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runBatchAnalysis = async () => {
    const pendingItems = batchResults.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    setBatchProgress({ current: 0, total: pendingItems.length });

    for (let idx = 0; idx < pendingItems.length; idx++) {
      const item = pendingItems[idx];
      setBatchResults(prev => prev.map(i => i.id === item.id ? { ...i, status: 'analyzing' } : i));
      setBatchProgress({ current: idx + 1, total: pendingItems.length });

      try {
        const base64 = item.thumbnail.split(',')[1];
        const mimeType = item.thumbnail.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';

        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType, deepScan: batchDeepScan }),
        });

        if (!response.ok) throw new Error(`Analysis failed (${response.status})`);
        const data = await response.json();

        setBatchResults(prev => prev.map(i => i.id === item.id ? { ...i, ...data, status: 'completed', deepScan: batchDeepScan } : i));
      } catch (err: any) {
        setBatchResults(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', errorDetail: err.message } : i));
      }
    }

    setBatchProgress({ current: 0, total: 0 });
  };

  const retryFailed = () => {
    setBatchResults(prev => prev.map(i =>
      i.status === 'error' ? { ...i, status: 'pending', errorDetail: undefined } : i
    ));
    setTimeout(() => runBatchAnalysis(), 100);
  };

  const sortedAndFilteredBatch = useMemo(() => {
    let list = [...batchResults];
    
    if (filterClassification !== 'all') {
      list = list.filter(item => item.classification === filterClassification);
    }

    return list.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [batchResults, sortField, sortOrder, filterClassification]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleGeneratePDF = (item?: BatchResult) => {
    const data = item || result;
    const img = item ? item.thumbnail : selectedImage;
    if (!data || !img) return;

    const doc = generateForensicReport({
      classification: data.classification,
      aiLikelihood: data.aiLikelihood,
      realLikelihood: data.realLikelihood,
      editedLikelihood: data.editedLikelihood,
      consistencyScore: data.consistencyScore,
      confidenceLevel: data.confidenceLevel,
      keyEvidence: data.keyEvidence,
      detectedIssues: data.detectedIssues,
      forensicSummary: data.forensicSummary,
      finalVerdict: data.finalVerdict,
      mostLikelySource: data.mostLikelySource,
      filename: (data as any).filename || 'evidence',
      hash: exifData?.hash,
    }, img);

    doc.save(`ForensicTrace_Report_${Date.now()}.pdf`);
  };

  const exportCaseArchive = async () => {
    const data = result;
    const img = selectedImage;
    if (!data || !img) return;
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const base64Data = img.split(',')[1];
      const mimeType = img.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
      const extension = mimeType.split('/')[1] || 'jpg';
      zip.file(`evidence_original.${extension}`, base64Data, { base64: true });

      zip.file("report_metadata.json", JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        version: "2.4.0",
        case_id: `FG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
      }, null, 2));

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `FG_Case_Archive_${Date.now()}.zip`);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  const exportBatchToCSV = () => {
    const csv = Papa.unparse(batchResults.map(r => ({
      Filename: r.filename,
      Classification: r.classification,
      Confidence: r.confidenceLevel,
      AI_Likelihood: `${r.aiLikelihood}%`,
      Real_Likelihood: `${r.realLikelihood}%`,
      Edited_Likelihood: `${r.editedLikelihood}%`,
      Consistency_Score: `${r.consistencyScore}%`,
      Source: r.mostLikelySource,
      Timestamp: new Date(r.timestamp).toLocaleString(),
      Status: r.status,
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `ForensicTrace_Batch_${Date.now()}.csv`);
  };

  const exportBatchPDF = () => {
    const doc = new jsPDF();
    const caseId = generateCaseId();

    doc.setFillColor(...REPORT_STYLES.darkBg);
    doc.rect(0, 0, 210, 50, 'F');
    doc.setTextColor(...REPORT_STYLES.primaryColor);
    doc.setFontSize(24);
    doc.text('FORENSICTRACE', 15, 25);
    doc.setFontSize(10);
    doc.setTextColor(...REPORT_STYLES.textColor);
    doc.text(`Batch Analysis Report — ${batchResults.length} images`, 15, 35);
    doc.text(`Case: ${caseId}`, 15, 42);

    const completedItems = batchResults.filter(r => r.status === 'completed');
    const aiCount = completedItems.filter(r => r.classification === 'AI-generated').length;
    const realCount = completedItems.filter(r => r.classification === 'Real').length;
    const uncertainCount = completedItems.filter(r => r.classification === 'Mixed/Uncertain').length;

    autoTable(doc, {
      startY: 60,
      body: [
        ['AI-Generated', `${aiCount} (${completedItems.length > 0 ? Math.round(aiCount / completedItems.length * 100) : 0}%)`],
        ['Real', `${realCount} (${completedItems.length > 0 ? Math.round(realCount / completedItems.length * 100) : 0}%)`],
        ['Uncertain', `${uncertainCount} (${completedItems.length > 0 ? Math.round(uncertainCount / completedItems.length * 100) : 0}%)`],
        ['Total', `${batchResults.length}`],
      ],
      theme: 'grid',
      margin: { left: 15, right: 15 },
    });

    doc.addPage();
    const tableData = batchResults.map(r => [
      r.filename,
      r.classification,
      `${r.aiLikelihood}%`,
      r.confidenceLevel,
      r.status,
    ]);

    autoTable(doc, {
      startY: 15,
      head: [['Filename', 'Classification', 'AI%', 'Confidence', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: REPORT_STYLES.lightBg, textColor: REPORT_STYLES.primaryColor },
      margin: { left: 15, right: 15 },
    });

    doc.save(`ForensicTrace_Batch_${caseId}.pdf`);
  };

  const exportBatchArchive = async () => {
    const zip = new JSZip();
    const caseId = generateCaseId();

    const csv = Papa.unparse(batchResults.map(r => ({
      Filename: r.filename,
      Classification: r.classification,
      Confidence: r.confidenceLevel,
      AI_Likelihood: `${r.aiLikelihood}%`,
      Real_Likelihood: `${r.realLikelihood}%`,
      Edited_Likelihood: `${r.editedLikelihood}%`,
    })));
    zip.file('batch_results.csv', csv);

    for (const item of batchResults) {
      if (item.thumbnail) {
        const base64 = item.thumbnail.split(',')[1];
        zip.file(`evidence/${item.filename}`, base64, { base64: true });
        zip.file(`reports/${item.filename}.json`, JSON.stringify({
          classification: item.classification,
          aiLikelihood: item.aiLikelihood,
          realLikelihood: item.realLikelihood,
          editedLikelihood: item.editedLikelihood,
          consistencyScore: item.consistencyScore,
          confidenceLevel: item.confidenceLevel,
          evidence: item.keyEvidence,
          issues: item.detectedIssues,
          source: item.mostLikelySource,
          deepScan: item.deepScan,
        }, null, 2));
      }
    }

    const completed = batchResults.filter(r => r.status === 'completed');
    zip.file('case_summary.json', JSON.stringify({
      caseId,
      date: new Date().toISOString(),
      totalImages: batchResults.length,
      completedCount: completed.length,
      aiCount: completed.filter(r => r.classification === 'AI-generated').length,
      realCount: completed.filter(r => r.classification === 'Real').length,
      uncertainCount: completed.filter(r => r.classification === 'Mixed/Uncertain').length,
    }, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `ForensicTrace_Archive_${caseId}.zip`);
  };

  const reset = () => {
    setSelectedImage(null);
    setResult(null);
    setError(null);
    setExifData(null);
    setBatchResults([]);
    setViewMode('single');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeItem = (id: string) => {
    setBatchResults(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-white">
      
      {/* HUD Header */}
      <header className="border-b border-[#141414] p-4 flex justify-between items-center bg-[#050505]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-[#F27D26] p-1.5 rounded">
            <Fingerprint className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase">RPE BY HARISH</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 font-mono">Digital Forensics Analyst v2.4.0</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex border border-[#141414] rounded-lg p-1 bg-black/40">
            <button 
              onClick={() => setViewMode('single')}
              className={`px-3 py-1.5 rounded text-[10px] flex items-center gap-2 transition-all uppercase tracking-widest ${viewMode === 'single' ? 'bg-[#F27D26] text-black font-bold' : 'opacity-40 hover:opacity-100'}`}
            >
              <LayoutGrid className="w-3 h-3" />
              Single Focus
            </button>
            <button 
              onClick={() => setViewMode('batch')}
              className={`px-3 py-1.5 rounded text-[10px] flex items-center gap-2 transition-all uppercase tracking-widest ${viewMode === 'batch' ? 'bg-[#F27D26] text-black font-bold' : 'opacity-40 hover:opacity-100'}`}
            >
              <TableIcon className="w-3 h-3" />
              Batch Matrix
            </button>
          </div>
          <a 
            href="/api/download-source"
            download
            className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-widest text-[#F27D26] hover:text-[#ffb17a] transition-all border border-[#F27D26]/40 px-3 py-2 rounded-lg bg-[#F27D26]/10 font-bold shadow-[0_0_10px_rgba(242,125,38,0.1)] hover:shadow-[0_0_20px_rgba(242,125,38,0.2)] active:scale-95"
          >
            <Download className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Download Source Zip</span>
            <span className="xs:hidden">Source</span>
          </a>
          {(selectedImage || batchResults.length > 0) && (
            <button 
              onClick={reset}
              className="flex items-center gap-2 text-xs uppercase tracking-wider hover:text-red-400 transition-colors opacity-60 hover:opacity-100"
            >
              <RefreshCw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {!selectedImage && batchResults.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-12 max-w-2xl mx-auto"
          >
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = e.dataTransfer.files;
                if (files.length > 0) handleMultipleUploads(Array.from(files));
              }}
              className="group relative border-2 border-dashed border-[#141414] hover:border-[#F27D26] rounded-2xl p-12 text-center transition-all cursor-pointer bg-[#0A0A0A]"
            >
              <div className="absolute inset-0 bg-[#F27D26]/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
              <div className="flex flex-col items-center gap-6">
                <div className="flex gap-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 bg-[#141414] rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                  >
                    <Upload className="w-8 h-8 text-[#F27D26]" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Ingest Visual Evidence</h2>
                  <p className="text-sm opacity-50 max-w-xs mx-auto">
                    Drag and drop or click to upload forensic imagery. 
                    Supports batch uploading for large-scale analysis.
                  </p>
                </div>
                <div className="flex gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest mt-4">
                  <span className="px-2 py-1 bg-[#F27D26]/10 border border-[#F27D26]/20 rounded">Batch Processing</span>
                  <span className="px-2 py-1 bg-[#F27D26]/10 border border-[#F27D26]/20 rounded">Noise Patterns</span>
                  <span className="px-2 py-1 bg-[#F27D26]/10 border border-[#F27D26]/20 rounded">Judicial Integrity</span>
                </div>
              </div>
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleImageUpload}
                accept="image/*"
                multiple
              />
            </div>
            
            <div className="mt-12 p-6 border border-[#141414] rounded-xl bg-[#0A0A0A]/50 flex gap-4">
              <Scale className="w-8 h-8 text-[#F27D26] flex-shrink-0" />
              <div className="text-xs opacity-50 space-y-2">
                <p className="uppercase font-bold tracking-widest">Judicial Code of Conduct</p>
                <p>This system performs professional-grade digital forensic analysis. Users must maintain the chain of custody for all digital evidence. All reports generated are timestamped and include integrity verification strings suitable for court submission.</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {viewMode === 'single' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Single View Logic (Same as before but with selectedImage handling) */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="relative rounded-2xl overflow-hidden border border-[#141414] bg-black group shadow-2xl">
                    <img 
                      src={selectedImage || batchResults[0]?.thumbnail} 
                      alt="Forensic Evidence"
                      className="w-full h-auto object-contain max-h-[70vh]"
                    />
                    {isAnalyzing && (
                      <motion.div 
                        initial={{ top: 0 }}
                        animate={{ top: '100%' }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="absolute left-0 right-0 h-0.5 bg-[#F27D26] shadow-[0_0_15px_#F27D26] z-10"
                      />
                    )}
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3"
                    >
                      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-red-500 uppercase tracking-wider">Analysis Error</p>
                        <p className="text-xs opacity-80 mt-1">{error}</p>
                      </div>
                      <button
                        onClick={() => setError(null)}
                        className="text-red-400 hover:text-red-300 text-xs font-bold uppercase"
                      >
                        Dismiss
                      </button>
                    </motion.div>
                  )}

                  {!result && !isAnalyzing && !error && (
                    <div className="flex flex-col gap-4">
                      <label className="flex items-center gap-2 cursor-pointer bg-[#0A0A0A] p-3 rounded-xl border border-[#141414] hover:border-[#F27D26] transition-all">
                        <input type="checkbox" checked={singleDeepScan} onChange={(e) => setSingleDeepScan(e.target.checked)} className="accent-[#F27D26]" />
                        <span className="text-xs uppercase font-bold tracking-widest text-white/70">Enable Deep Scan <span className="text-[9px] opacity-50">(Noise Analysis & Edge Gradient)</span></span>
                      </label>
                      <button
                        onClick={runAnalysis}
                        className="w-full py-4 bg-[#F27D26] text-black font-bold uppercase tracking-widest rounded-xl hover:bg-[#ff9447] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-lg shadow-[#F27D26]/20"
                      >
                        <Search className="w-5 h-5" />
                        Initialize Forensic Analysis
                      </button>
                    </div>
                  )}

                  {error && !result && (
                    <button
                      onClick={runAnalysis}
                      className="w-full py-3 bg-[#141414] border border-[#F27D26]/30 text-[#F27D26] font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-[#1f1f1f] transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry Analysis
                    </button>
                  )}

                  {isAnalyzing && (
                    <div className="p-6 border border-[#141414] rounded-xl bg-[#0A0A0A] space-y-4">
                      <div className="flex justify-between items-center text-[10px] font-mono text-[#F27D26] uppercase">
                        <span>Analyzing... {elapsedSeconds}s</span>
                        <Activity className="w-3 h-3 animate-pulse" />
                      </div>
                      <div className="h-1 bg-[#141414] rounded-full overflow-hidden">
                        <motion.div className="h-full bg-[#F27D26]" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 3 }} />
                      </div>
                    </div>
                  )}

                  {result && (
                    <div className="flex gap-4">
                      <button onClick={() => handleGeneratePDF()} className="flex-1 py-3 bg-[#141414] border border-[#F27D26]/30 text-white font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-[#1f1f1f] transition-all flex items-center justify-center gap-2">
                        <FileText className="w-4 h-4 text-[#F27D26]" /> Generate Court Report
                      </button>
                      <button onClick={exportCaseArchive} disabled={isExporting} className="flex-1 py-3 bg-[#141414] border border-white/10 text-white font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-[#1f1f1f] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                        <Download className={`w-4 h-4 text-[#F27D26] ${isExporting ? 'animate-bounce' : ''}`} /> {isExporting ? 'Packaging...' : 'Export Case (ZIP)'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5">
                  <AnimatePresence mode="wait">
                    {result ? (
                      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <VerdictCard
                          classification={result.classification}
                          aiLikelihood={result.aiLikelihood}
                          realLikelihood={result.realLikelihood}
                          editedLikelihood={result.editedLikelihood}
                          consistencyScore={result.consistencyScore}
                          confidenceLevel={result.confidenceLevel}
                          deepScan={result.deepScan}
                        />
                        <EvidenceList
                          keyEvidence={result.keyEvidence}
                          detectedIssues={result.detectedIssues}
                          forensicSummary={result.forensicSummary}
                        />
                        {result.elaScore !== null && result.elaScore !== undefined && (
                          <div className="p-4 border border-[#141414] rounded-xl bg-[#0A0A0A]">
                            <p className="text-[9px] uppercase font-mono text-[#F27D26] mb-2">Error Level Analysis</p>
                            <div className="flex items-center gap-3">
                              <span className="text-xs opacity-70">Score: {result.elaScore}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded ${
                                result.elaInterpretation === 'uniform' ? 'bg-green-500/10 text-green-500' :
                                result.elaInterpretation === 'suspicious' ? 'bg-yellow-500/10 text-yellow-500' :
                                'bg-red-500/10 text-red-500'
                              }`}>
                                {result.elaInterpretation}
                              </span>
                            </div>
                            <p className="text-[9px] mt-2 opacity-30">Higher scores suggest image splicing or editing</p>
                          </div>
                        )}
                        {exifData && <MetadataPanel data={exifData} />}
                      </motion.div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-[#141414] rounded-2xl bg-[#0A0A0A] min-h-[400px] opacity-30">
                        <Maximize2 className="w-12 h-12 mb-4" />
                        <p className="text-sm uppercase tracking-widest font-mono">Select image for detailed matrix view</p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Batch Dashboard Controls */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0A0A0A] p-4 rounded-xl border border-[#141414]">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-mono text-[#F27D26]">
                      <Activity className="w-4 h-4" />
                      Batch Matrix Status: {batchResults.filter(i => i.status === 'completed').length}/{batchResults.length} Processed
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-black border border-white/5 rounded-lg px-3 py-1.5">
                      <Filter className="w-3 h-3 opacity-40 text-[#F27D26]" />
                      <select 
                        value={filterClassification}
                        onChange={(e) => setFilterClassification(e.target.value)}
                        className="bg-transparent text-[10px] uppercase font-mono tracking-widest outline-none border-none"
                      >
                        <option value="all">Filter: All</option>
                        <option value="AI-generated">AI-Generated</option>
                        <option value="Real">Real Capture</option>
                        <option value="Uncertain">Uncertain</option>
                      </select>
                    </div>
                    
                    <label className="flex items-center gap-2 cursor-pointer bg-[#0A0A0A] p-2 px-3 rounded-lg border border-[#141414] hover:border-[#F27D26] transition-all">
                      <input type="checkbox" checked={batchDeepScan} onChange={(e) => setBatchDeepScan(e.target.checked)} className="accent-[#F27D26]" />
                      <span className="text-[10px] uppercase font-bold tracking-widest">Enable Deep Scan</span>
                    </label>
                    <button 
                      onClick={runBatchAnalysis}
                      disabled={batchResults.every(item => item.status === 'completed' || item.status === 'analyzing')}
                      className="px-4 py-2 bg-[#F27D26] text-black font-bold text-[10px] uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-[#ff9447] transition-all disabled:opacity-30"
                    >
                      <Zap className="w-3 h-3" />
                      Process Pending Matrix
                    </button>
                    
                    <button 
                      onClick={exportBatchToCSV}
                      className="px-4 py-2 bg-[#141414] border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-white/5"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                    <button 
                      onClick={exportBatchPDF}
                      className="px-4 py-2 bg-[#141414] border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-white/5"
                    >
                      <FileText className="w-3 h-3" />
                      Export PDF
                    </button>
                    <button 
                      onClick={exportBatchArchive}
                      className="px-4 py-2 bg-[#141414] border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-white/5"
                    >
                      <Download className="w-3 h-3" />
                      Export ZIP
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-[#141414] border border-[#F27D26]/20 text-white font-bold text-[10px] uppercase tracking-widest rounded-lg flex items-center gap-2"
                    >
                      <Upload className="w-3 h-3" />
                      Append Evidence
                    </button>
                  </div>
                </div>

                {/* Batch Progress */}
                {batchProgress.total > 0 && (
                  <div className="p-4 bg-[#0A0A0A] border border-[#141414] rounded-xl">
                    <div className="flex justify-between text-[10px] font-mono text-[#F27D26] mb-2">
                      <span>Processing batch... {batchProgress.current}/{batchProgress.total}</span>
                      <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-[#141414] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-[#F27D26]"
                        initial={{ width: 0 }}
                        animate={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {batchResults.some(item => item.status === 'error') && (
                    <button
                      onClick={retryFailed}
                      className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-[10px] uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-red-500/20"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry Failed
                    </button>
                  )}
                </div>

                {/* Batch Table */}
                <div className="overflow-x-auto rounded-xl border border-[#141414] bg-[#0A0A0A]">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-black/60 border-b border-[#141414]">
                        <th className="p-4 w-16">Preview</th>
                        <th 
                          className="p-4 text-[10px] uppercase font-mono tracking-[0.2em] opacity-40 cursor-pointer hover:opacity-100 transition-opacity"
                          onClick={() => toggleSort('filename')}
                        >
                          <div className="flex items-center gap-2">Evidence {sortField === 'filename' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                        </th>
                        <th 
                          className="p-4 text-[10px] uppercase font-mono tracking-[0.2em] opacity-40 cursor-pointer hover:opacity-100 transition-opacity"
                          onClick={() => toggleSort('classification')}
                        >
                          <div className="flex items-center gap-2">Classification {sortField === 'classification' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                        </th>
                        <th 
                          className="p-4 text-[10px] uppercase font-mono tracking-[0.2em] opacity-40 cursor-pointer hover:opacity-100 transition-opacity text-center"
                          onClick={() => toggleSort('aiLikelihood')}
                        >
                          <div className="flex items-center justify-center gap-2">AI Likelihood {sortField === 'aiLikelihood' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                        </th>
                        <th 
                          className="p-4 text-[10px] uppercase font-mono tracking-[0.2em] opacity-40 cursor-pointer hover:opacity-100 transition-opacity text-center"
                          onClick={() => toggleSort('consistencyScore')}
                        >
                          <div className="flex items-center justify-center gap-2">Consistency {sortField === 'consistencyScore' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                        </th>
                        <th className="p-4 text-[10px] uppercase font-mono tracking-[0.2em] opacity-40">Status</th>
                        <th className="p-4 text-[10px] uppercase font-mono tracking-[0.2em] opacity-40 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#141414]">
                      {sortedAndFilteredBatch.map((item) => (
                        <motion.tr 
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          key={item.id} 
                          className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedImage(item.thumbnail);
                            if (item.status === 'completed') {
                              setResult({
                                classification: item.classification,
                                aiLikelihood: item.aiLikelihood,
                                realLikelihood: item.realLikelihood,
                                editedLikelihood: item.editedLikelihood,
                                consistencyScore: item.consistencyScore,
                                confidenceLevel: item.confidenceLevel,
                                keyEvidence: item.keyEvidence,
                                detectedIssues: item.detectedIssues,
                                mostLikelySource: item.mostLikelySource,
                                forensicSummary: item.forensicSummary,
                                finalVerdict: item.finalVerdict,
                                deepScan: item.deepScan,
                              });
                            }
                            setViewMode('single');
                          }}
                        >
                          <td className="p-4">
                            <div 
                              className="w-12 h-12 rounded border border-[#141414] overflow-hidden bg-black cursor-pointer"
                              onClick={() => {
                                setSelectedImage(item.thumbnail);
                                setResult(item.status === 'completed' ? item : null);
                                setViewMode('single');
                              }}
                            >
                              <img src={item.thumbnail} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" alt="thumb" />
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="text-xs font-bold leading-none mb-1">{item.filename}</div>
                            <div className="text-[9px] font-mono opacity-30 uppercase">{new Date(item.timestamp).toLocaleString()}</div>
                          </td>
                          <td className="p-4">
                            {item.status === 'completed' ? (
                              <>
                              <span className={`text-[10px] font-bold uppercase italic px-2 py-1 rounded ${
                                item.classification === 'AI-generated' ? 'text-[#F27D26] bg-[#F27D26]/10' : 
                                item.classification === 'Real' ? 'text-green-500 bg-green-500/10' : 'text-white/50 bg-white/5'
                              }`}>
                                {item.classification}
                              </span>
                              {item.deepScan && (
                                <span className="ml-1.5 px-1 py-0.5 text-[7px] font-mono uppercase tracking-widest bg-[#F27D26]/20 text-[#F27D26] border border-[#F27D26]/30 rounded">DS</span>
                              )}
                              </>
                            ) : (
                              <span className="text-[10px] uppercase opacity-30">Analysis Pending</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <span className="font-mono text-sm">{item.status === 'completed' ? `${item.aiLikelihood}%` : '--'}</span>
                          </td>
                          <td className="p-4 text-center">
                             <div className="flex flex-col items-center gap-1">
                               <span className="font-mono text-sm">{item.status === 'completed' ? `${item.consistencyScore}%` : '--'}</span>
                               {item.status === 'completed' && (
                                 <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                   <div className="h-full bg-blue-500" style={{ width: `${item.consistencyScore}%` }} />
                                 </div>
                               )}
                             </div>
                          </td>
                          <td className="p-4">
                            {item.status === 'analyzing' ? (
                              <div className="flex items-center gap-2 text-[10px] text-[#F27D26] uppercase font-mono animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Analyzing
                              </div>
                            ) : item.status === 'completed' ? (
                              <div className="flex items-center gap-2 text-[10px] text-green-500 uppercase font-mono">
                                <CheckCircle2 className="w-3 h-3" /> Secure
                              </div>
                            ) : item.status === 'error' ? (
                              <div className="flex items-center gap-2 text-[10px] text-red-500 uppercase font-mono">
                                <AlertTriangle className="w-3 h-3" /> Failed
                              </div>
                            ) : (
                              <div className="text-[10px] uppercase opacity-20 font-mono">Queued</div>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              {item.status === 'completed' && (
                                <button 
                                  onClick={() => handleGeneratePDF(item)}
                                  className="p-2 hover:text-[#F27D26] transition-colors bg-white/5 rounded-lg border border-white/5"
                                  title="Export Report"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={() => removeItem(item.id)}
                                className="p-2 hover:text-red-500 transition-colors bg-white/5 rounded-lg border border-white/5"
                                title="Purge Evidence"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-20 border-t border-[#141414] p-8 text-center text-[10px] opacity-30 font-mono uppercase tracking-[0.4em]">
        Signal Processed via Gemini Neural Core • 2026 Virtual Forensics Div.
      </footer>
    </div>
  );
}

