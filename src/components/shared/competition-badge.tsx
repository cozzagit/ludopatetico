interface CompetitionBadgeProps {
  name: string;
  code?: string;
  emblem?: string | null;
  size?: 'sm' | 'md';
}

const competitionColors: Record<string, string> = {
  SA: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  SB: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  PL: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  PD: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  BL1: 'bg-red-500/10 text-red-400 border-red-500/20',
  FL1: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  CL: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  EL: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  ECL: 'bg-green-500/10 text-green-400 border-green-500/20',
  EC: 'bg-green-500/10 text-green-400 border-green-500/20',
  WCQ: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  WCQ_EU: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

export function CompetitionBadge({ name, code, emblem, size = 'md' }: CompetitionBadgeProps) {
  const colorClass = code ? competitionColors[code] || 'bg-[var(--card-hover)] text-[var(--text-secondary)] border-[var(--border)]' : 'bg-[var(--card-hover)] text-[var(--text-secondary)] border-[var(--border)]';
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${colorClass} ${sizeClass}`}>
      {emblem && (
        <img src={emblem} alt="" className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      )}
      {name}
    </span>
  );
}
