import { AlertTriangle, FileText } from 'lucide-react';

interface EvidenceListProps {
  keyEvidence: string[];
  detectedIssues: string[];
  forensicSummary: string;
}

export default function EvidenceList({ keyEvidence, detectedIssues, forensicSummary }: EvidenceListProps) {
  return (
    <>
      {keyEvidence.length > 0 && (
        <div className="p-4 border border-[#141414] rounded-xl bg-[#0A0A0A]">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest mb-3">
            <FileText className="w-4 h-4" />
            Supporting Evidence
          </div>
          <ul className="space-y-2">
            {keyEvidence.map((ev, i) => (
              <li key={i} className="text-xs flex gap-3 opacity-80">
                <span className="text-[#F27D26]">✓</span>
                {ev}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {detectedIssues.length > 0 && (
        <div className="p-4 border border-[#141414] rounded-xl bg-[#0A0A0A] mt-4">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest mb-3">
            <AlertTriangle className="w-4 h-4" />
            Detected Issues
          </div>
          <ul className="space-y-2">
            {detectedIssues.map((issue, i) => (
              <li key={i} className="text-xs flex gap-3 opacity-80">
                <span className="text-red-500">!</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {forensicSummary && (
        <div className="p-4 border border-[#141414] rounded-xl bg-[#0A0A0A] mt-4">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest mb-3">
            <FileText className="w-4 h-4" />
            Forensic Summary
          </div>
          <p className="text-xs opacity-80 leading-relaxed">{forensicSummary}</p>
        </div>
      )}
    </>
  );
}