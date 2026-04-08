interface FormBadgeProps {
  form: string; // e.g. "WWDLW" or "W,D,L,W,W"
  size?: 'sm' | 'md';
}

const resultColors: Record<string, string> = {
  W: 'bg-[var(--emerald)]',
  D: 'bg-[var(--gold)]',
  L: 'bg-[var(--red)]',
};

const resultLabels: Record<string, string> = {
  W: 'V',
  D: 'P',
  L: 'S',
};

export function FormBadge({ form, size = 'md' }: FormBadgeProps) {
  // Support both "WWDLW" and "W,D,L,W,W" formats
  const results = form.includes(',') ? form.split(',') : form.split('');
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <div className="flex items-center gap-1" title={`Forma: ${results.map(r => resultLabels[r] || r).join('')}`}>
      {results.map((result, i) => (
        <div
          key={i}
          className={`${dotSize} rounded-full ${resultColors[result] || 'bg-[var(--border)]'}`}
        />
      ))}
    </div>
  );
}

interface FormBadgeExtendedProps {
  form: string;
}

export function FormBadgeExtended({ form }: FormBadgeExtendedProps) {
  const results = form.includes(',') ? form.split(',') : form.split('');

  return (
    <div className="flex items-center gap-1">
      {results.map((result, i) => (
        <span
          key={i}
          className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
            result === 'W'
              ? 'bg-[var(--emerald)]/20 text-[var(--emerald)]'
              : result === 'D'
              ? 'bg-[var(--gold)]/20 text-[var(--gold)]'
              : 'bg-[var(--red)]/20 text-[var(--red)]'
          }`}>
          {resultLabels[result] || result}
        </span>
      ))}
    </div>
  );
}
