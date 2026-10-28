import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface MangaCoverProps {
  src: string;
  title: string;
  className?: string;
}

export const MangaCover: React.FC<MangaCoverProps> = ({ src, title, className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`bg-gradient-to-br from-slate-800 via-[#131822] to-[#0B0E14] flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
      >
        <BookOpen className="w-8 h-8 text-blue-400/80 mb-2 shrink-0" />
        <span className="text-xs font-semibold text-slate-200 line-clamp-3 leading-snug">
          {title}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${title} cover artwork`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
};
