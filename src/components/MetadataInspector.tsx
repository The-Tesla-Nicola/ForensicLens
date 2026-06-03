import React from 'react';
import { Camera, Layers, Info } from 'lucide-react';

export default function MetadataInspector({ data }: { data: any }) {
  if (!data) return null;

  const fields = [
    { label: 'Camera Model', value: data.Model || 'Unknown' },
    { label: 'Focal Length', value: data.FocalLength ? `${data.FocalLength}mm` : 'Unknown' },
    { label: 'ISO', value: data.ISO || 'Unknown' },
    { label: 'Exposure Time', value: data.ExposureTime ? `${data.ExposureTime}s` : 'Unknown' },
    { label: 'Date Taken', value: data.DateTimeOriginal ? new Date(data.DateTimeOriginal).toLocaleString() : 'Unknown' }
  ];

  return (
    <div className="p-4 border border-[#141414] rounded-xl bg-[#0A0A0A] space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-mono text-[#F27D26] uppercase tracking-widest"><Camera className="w-4 h-4" /> EXIF Metadata</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {fields.map((f, i) => (
          <div key={i}>
            <p className="text-[9px] opacity-40 uppercase">{f.label}</p>
            <p className="text-xs font-mono">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
