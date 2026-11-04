/*
 * Kleine PDF-Datei aus Text, ohne Bibliothek: für die Unterlagen der Musterkampagne und des Testmodus, damit
 * „Original öffnen“ eine echte PDF zeigt. Eine Seite je Textseite (A4), Schrift Helvetica, Umbruch nach Wörtern.
 * Zeichen außerhalb von Windows-1252 werden durch „?“ ersetzt. Ohne Laufzeit-Importe (Test: scripts/tests/minipdf.test.mjs).
 */

/** Zeichen, die in Windows-1252 nicht auf ihrer Unicode-Stelle liegen */
const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '›': 0x9b, '‹': 0x8b
};

function encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (CP1252[ch] !== undefined) out.push(CP1252[ch]);
    else if ((c >= 0x20 && c <= 0x7e) || c === 0x0a || c === 0x0d) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else out.push(0x3f);
  }
  return out;
}

/** Text für einen PDF-String: Klammern und Rückstrich schützen, Bytes über 127 als Oktal */
function pdfString(s: string): string {
  return '(' + encode(s).map((b) => {
    if (b === 0x28 || b === 0x29 || b === 0x5c) return '\\' + String.fromCharCode(b);
    if (b > 0x7e) return '\\' + b.toString(8).padStart(3, '0');
    return String.fromCharCode(b);
  }).join('') + ')';
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** PDF aus Seiten mit Text; die erste Zeile der ersten Seite wird als Überschrift gesetzt */
export function textToPdf(pages: string[], title = ''): Uint8Array {
  const LINES_PER_PAGE = 52;
  // Lange Textseiten auf mehrere PDF-Seiten verteilen
  const sheets: string[][] = [];
  for (const page of pages.length ? pages : ['']) {
    const lines = wrap(page.trim(), 88);
    for (let i = 0; i < lines.length || i === 0; i += LINES_PER_PAGE) sheets.push(lines.slice(i, i + LINES_PER_PAGE));
  }

  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  sheets.forEach((lines, si) => {
    const ops = ['BT', '/F1 10.5 Tf', '14 TL', '56 790 Td'];
    lines.forEach((line, li) => {
      if (si === 0 && li === 0) ops.push('/F2 13 Tf', `${pdfString(line)} Tj`, '/F1 10.5 Tf', 'T*');
      else ops.push(`${pdfString(line)} Tj`, 'T*');
    });
    ops.push('ET', 'BT', '/F1 8 Tf', '520 30 Td', `(${si + 1} / ${sheets.length}) Tj`, 'ET');
    const stream = ops.join('\n');
    const content = add(`<< /Length ${encode(stream).length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  return finish(objects, catalog, pagesObj, kids, title, add);
}

function finish(objects: string[], catalog: number, pagesObj: number, kids: number[], title: string, add: (b: string) => number): Uint8Array {
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(title)} /Producer (Taleward Testmodus) >>`);

  // Zusammensetzen; alle Zeichen sind hier schon ASCII (Strings oktal), Längen also in Bytes = Zeichen
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(encode(out));
}

export interface SheetData {
  title: string;
  subtitle: string;
  /** Werte in Kästen, z. B. [„Kraft“, „10“] */
  stats: [string, string][];
  /** Abschnitte mit Überschrift und Zeilen */
  sections: [string, string[]][];
}

/** Gestalteter Bogen auf einer A4-Seite: Titel, Werte in Kästen, Abschnitte mit Linien (nur für Musterdaten) */
export function sheetToPdf(d: SheetData, title = ''): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
  const ink = '0.09 0.19 0.23';
  const ops: string[] = [
    // Rahmen
    `${ink} RG 1.6 w 36 36 523 770 re S`, '0.5 w 42 42 511 758 re S',
    `BT ${ink} rg /F2 26 Tf 60 760 Td ${pdfString(d.title)} Tj ET`,
    `BT 0.3 0.3 0.3 rg /F1 13 Tf 60 738 Td ${pdfString(d.subtitle)} Tj ET`,
    `${ink} RG 1 w 60 726 m 535 726 l S`
  ];
  // Werte
  const bw = 110, gap = 12;
  d.stats.forEach(([label, value], i) => {
    const x = 60 + i * (bw + gap);
    ops.push(`${ink} RG 1.2 w ${x} 630 ${bw} 78 re S`,
      `BT 0.3 0.3 0.3 rg /F1 12 Tf ${x + 10} 690 Td ${pdfString(label)} Tj ET`,
      `BT ${ink} rg /F2 34 Tf ${x + 10} 645 Td ${pdfString(value)} Tj ET`);
  });
  let y = 598;
  for (const [head, lines] of d.sections) {
    ops.push(`BT ${ink} rg /F2 15 Tf 60 ${y} Td ${pdfString(head)} Tj ET`);
    y -= 8;
    ops.push(`0.6 0.6 0.6 RG 0.5 w 60 ${y} m 535 ${y} l S`);
    for (const line of lines.flatMap((l) => wrap(l, 66))) {
      y -= 22;
      ops.push(`BT 0.1 0.1 0.1 rg /F1 14 Tf 66 ${y + 6} Td ${pdfString(line)} Tj ET`, `0.8 0.8 0.8 RG 0.4 w 60 ${y} m 535 ${y} l S`);
    }
    y -= 30;
  }
  const stream = ops.join('\n');
  const content = add(`<< /Length ${encode(stream).length} >>\nstream\n${stream}\nendstream`);
  const kids = [add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`)];
  return finish(objects, catalog, pagesObj, kids, title, add);
}
