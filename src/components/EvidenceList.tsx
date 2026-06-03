import { useState } from 'react';
import { FileSearch, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EvidenceListProps {
  keyEvidence: string[];
  detectedIssues: string[];
  forensicSummary: string;
}

export default function EvidenceList({ keyEvidence, detectedIssues, forensicSummary }: EvidenceListProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[#141414] rounded-xl bg-[#0A0A0A] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest">
          <FileSearch className="w-4 h-4" />
          Forensic Evidence ({keyEvidence.length + detectedIssues.length} items)
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 space-y-3"
          >
            {keyEvidence.length > 0 && (
              <div>
                <p className="text-[9px] uppercase font-mono text-green-500 mb-2 flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" /> Supporting Evidence
                </p>
                <ul className="space-y-1.5">
                  {keyEvidence.map((ev, i) => (
                    <li key={i} className="text-xs flex gap-2 opacity-80">
                      <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                      {ev}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detectedIssues.length > 0 && (
              <div>
                <p className="text-[9px] uppercase font-mono text-red-500 mb-2 flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" /> Detected Issues
                </p>
                <ul className="space-y-1.5">
                  {detectedIssues.map((issue, i) => (
                    <li key={i} className="text-xs flex gap-2 opacity-80">
                      <span className="text-red-500 flex-shrink-0 mt-0.5">!</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pt-3 border-t border-white/5">
              <p className="text-[9px] uppercase font-mono text-[#F27D26] mb-1">Forensic Summary</p>
              <p className="text-xs opacity-70 leading-relaxed">{forensicSummary}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
