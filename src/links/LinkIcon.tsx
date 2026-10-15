import { IconPlay } from '../components/Icons';
import { BRAND_PATHS } from './brandPaths';
import { linkInfo, type LinkKind } from './linkKind';

/*
 * Zeichen vor einem Link: Markenzeichen, wenn der Dienst bekannt ist, sonst ein allgemeines Zeichen für die Art
 * (Lucide-Formen wie in Icons.tsx: headphones, file-text, map, music, globe). Rein schmückend, der Screenreader liest
 * den Namen des Links.
 */
const line = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const
});

function KindIcon({ kind, size }: { kind: LinkKind; size: number }) {
  switch (kind) {
    case 'chat':
      return <svg {...line(size)}><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></svg>;
    case 'video':
      return <IconPlay size={size} />;
    case 'docs':
      return <svg {...line(size)}><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>;
    case 'table':
      return <svg {...line(size)}><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" /></svg>;
    case 'music':
      return <svg {...line(size)}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
    default:
      return <svg {...line(size)}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>;
  }
}

export function LinkIcon({ url, size = 18 }: { url: string; size?: number }) {
  const { kind, brand } = linkInfo(url);
  return (
    <span className="link-icon" aria-hidden="true">
      {brand
        ? <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={BRAND_PATHS[brand].path} /></svg>
        : <KindIcon kind={kind} size={size} />}
    </span>
  );
}
