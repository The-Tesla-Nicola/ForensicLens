import { motion } from 'motion/react';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';

interface VerdictCardProps {
  classification: string;
  aiLikelihood: number;
  realLikelihood: number;
  editedLikelihood: number;
  consistencyScore: number;
  confidenceLevel: string;
  deepScan?: boolean;
}

function ScoreBar({ label, value, color, barColor }: { label: string; value: number; color: string; barColor: string }) {
  return (
    <div className="text-center">
      <p className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</p>
      <p className={`text-2xl font-mono font-bold mt-1 ${color}`}>{value}%</p>
      <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-1000`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function VerdictCard({ classification, aiLikelihood, realLikelihood, editedLikelihood, consistencyScore, confidenceLevel, deepScan }: VerdictCardProps) {
  const isAI = classification === 'AI-generated';
  const isReal = classification === 'Real';
  const isUncertain = classification === 'Mixed/Uncertain';

  const borderColor = isAI ? 'border-orange-500/30' : isReal ? 'border-green-500/30' : 'border-yellow-500/30';
  const bgColor = isAI ? 'bg-orange-500/5' : isReal ? 'bg-green-500/5' : 'bg-yellow-500/5';
  const textColor = isAI ? 'text-orange-500' : isReal ? 'text-green-500' : 'text-yellow-500';

  const Icon = isAI ? ShieldAlert : isReal ? ShieldCheck : AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-6 rounded-2xl border ${borderColor} ${bgColor} relative overflow-hidden`}
    >
      <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-5 ${textColor}`}
        style={{ background: `radial-gradient(circle, currentColor 0%, transparent 70%)` }}
      />
      <div className="flex items-start justify-between relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] uppercase font-mono opacity-50 tracking-widest">Final Classification</p>
            {deepScan && (
              <span className="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-widest bg-[#F27D26]/20 text-[#F27D26] border border-[#F27D26]/30 rounded">DEEP SCAN</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Icon className={`w-8 h-8 ${textColor}`} />
            <h3 className={`text-3xl font-black uppercase italic tracking-tighter ${textColor}`}>
              {classification}
            </h3>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-mono opacity-50 tracking-widest mb-1">Confidence</p>
          <span className={`text-2xl font-mono font-bold ${textColor}`}>{confidenceLevel}</span>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <ScoreBar label="AI" value={aiLikelihood} color="text-orange-500" barColor="bg-orange-500" />
        <ScoreBar label="Real" value={realLikelihood} color="text-green-500" barColor="bg-green-500" />
        <ScoreBar label="Edited" value={editedLikelihood} color="text-yellow-500" barColor="bg-yellow-500" />
      </div>
      <div className="mt-4 pt-4 border-t border-white/5">
        <div className="flex justify-between text-xs opacity-50">
          <span>Consistency Score</span>
          <span className="font-mono font-bold">{consistencyScore}%</span>
        </div>
        <div className="mt-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-1000"
            style={{ width: `${consistencyScore}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}
