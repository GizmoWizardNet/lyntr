function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Allowed URL schemes for links
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return '#';
}

// ── Inline-level rendering ──────────────────────────────────────────────
// Raw text in, safe HTML out. See escaping model note above.
function inlineMarkdown(raw: string): string {
  const stash: string[] = [];
  const save = (html: string) => {
    stash.push(html);
    return `\u0000INL${stash.length - 1}\u0000`;
  };

  let text = raw;

  // 1. Backslash-escaped literal characters — stashed immediately so none
  //    of the markup regexes below can ever interpret them as syntax.
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!~>|])/g, (_, ch) => save(escapeHtml(ch)));

  // 2. Code spans `code` — frozen as final HTML before anything else runs,
  //    so bold/italic markers *inside* a code span are never touched.
  text = text.replace(/`([^`\n]+)`/g, (_, code) => save(`<code>${escapeHtml(code)}</code>`));

  // 3. Explicit markdown links [text](url) — label is recursively inline-
  //    processed (so **bold** / *italic* link text works), url validated.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    save(`<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${inlineMarkdown(label)}</a>`)
  );

  // 4. Bare URLs (not already inside an href we just built)
  text = text.replace(/(^|[^"=])(https?:\/\/[^\s<>"]+)/g, (_, pre, url) =>
    `${pre}${save(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)}`
  );

  // 5. Whatever's left at this point is genuine plain text — escape once.
  text = escapeHtml(text);

  // 6. Bold / italic / strikethrough on the now-safe plain text. The
  //    marker characters (* ~) survive escapeHtml untouched, so this is
  //    safe to run after step 5.
  text = text
    .replace(/\*{3}(.+?)\*{3}/g, '<strong><em>$1</em></strong>')
    .replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');

  // 7. Restore stashed fragments — already fully built/escaped, safe as-is.
  text = text.replace(/\u0000INL(\d+)\u0000/g, (_, idx) => stash[Number(idx)]);

  return text;
}

// ── List items ───────────────────────────────────────────────────────────
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const TASK_RE = /^\[( |x|X)\]\s+(.*)$/;

// ── Subtext / subscript — Discord-style "-# text" lines, rendered smaller
// and de-emphasized (visually a subscript line). Deliberately requires a
// space right after "-#" so it never collides with LIST_ITEM_RE (which
// needs whitespace immediately after its "-" marker too, and therefore
// never matches "-#" in the first place — but this stays explicit rather
// than relying on that as an accident of ordering).
const SUBTEXT_RE = /^-#\s+(.*)$/;

function renderListItemText(text: string): string {
  const task = text.match(TASK_RE);
  if (task) {
    const checked = task[1].toLowerCase() === 'x';
    return `<label class="task-item"><input type="checkbox" disabled ${checked ? 'checked' : ''}><span${checked ? ' class="done"' : ''}>${inlineMarkdown(task[2])}</span></label>`;
  }
  return inlineMarkdown(text);
}

interface RawListItem { level: number; ordered: boolean; start: number; text: string }

// Renders a flat, indentation-tagged run of list items into nested
// <ul>/<ol> HTML. A run of items where the ordered/unordered marker type
// changes (e.g. a `-` list immediately followed by a `1.` list, with no
// blank line between) is rendered as separate sibling lists rather than
// merged into one — losing the numbering there would be worse than the
// extra complexity of handling it.
function renderListBlock(items: RawListItem[]): string {
  let i = 0;

  function renderLevel(level: number): string {
    const ordered = items[i].ordered;
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && items[i].start !== 1 ? ` start="${items[i].start}"` : '';
    let html = `<${tag}${startAttr}>`;

    while (i < items.length && items[i].level === level && items[i].ordered === ordered) {
      const item = items[i];
      i++;
      let inner = renderListItemText(item.text);
      if (i < items.length && items[i].level > level) {
        inner += renderLevel(items[i].level);
      }
      html += `<li>${inner}</li>`;
    }

    html += `</${tag}>`;
    return html;
  }

  let html = '';
  while (i < items.length) {
    html += renderLevel(items[i].level);
  }
  return html;
}

// ── Tables (GFM pipe syntax) ─────────────────────────────────────────────
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitTableRow(row: string): string[] {
  let trimmed = row.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function cellAlignment(sepCell: string): string | null {
  const trimmed = sepCell.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function renderTable(headerLine: string, sepLine: string, bodyLines: string[]): string {
  const headers = splitTableRow(headerLine);
  const aligns = splitTableRow(sepLine).map(cellAlignment);

  const styleFor = (idx: number) => {
    const align = aligns[idx];
    return align ? ` style="text-align:${align}"` : '';
  };

  let html = '<table><thead><tr>';
  headers.forEach((h, idx) => {
    html += `<th${styleFor(idx)}>${inlineMarkdown(h)}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (const line of bodyLines) {
    const cells = splitTableRow(line);
    html += '<tr>';
    headers.forEach((_, idx) => {
      html += `<td${styleFor(idx)}>${inlineMarkdown(cells[idx] ?? '')}</td>`;
    });
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

// Used by paragraph collection to decide when to stop merging lines —
// any of these starting a line means "this is a new block", even without
// a blank-line separator first (matches how headers/lists/quotes/hr can
// interrupt a paragraph in most markdown flavours).
// Note: table starts are deliberately NOT included here — detecting a
// table requires looking at the *next* line too, so (as a simplification)
// tables must be preceded by a blank line rather than interrupting a
// paragraph mid-flow.
function isBlockStart(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^#{1,4}\s+/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim()) ||
    SUBTEXT_RE.test(line) ||
    LIST_ITEM_RE.test(line)
  );
}

export function renderMarkdown(raw: string): string {
  if (!raw) return '';

  const lines = raw.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ```
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      out.push(`<pre${langAttr}><code>${codeLines.join('\n')}</code></pre>`);
      i++; // skip closing ```
      continue;
    }

    // ── Blockquote >
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${quoteLines.map((l) => inlineMarkdown(l)).join('<br>')}</blockquote>`);
      continue;
    }

    // ── ATX Headers # – ######
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      out.push(`<h${level}>${inlineMarkdown(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // ── Subtext / subscript: "-# text" — each line stands alone rather
    // than merging with neighbours, matching how Discord treats it.
    const subMatch = line.match(SUBTEXT_RE);
    if (subMatch) {
      out.push(`<p class="lynt-subtext">${inlineMarkdown(subMatch[1])}</p>`);
      i++;
      continue;
    }

    // ── Horizontal rule ---
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      out.push('<hr>');
      i++;
      continue;
    }

    // ── Tables: a row containing a pipe, immediately followed by a
    //    valid separator row (---|---), starts a table block.
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      const headerLine = line;
      const sepLine = lines[i + 1];
      i += 2;
      const bodyLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        bodyLines.push(lines[i]);
        i++;
      }
      out.push(renderTable(headerLine, sepLine, bodyLines));
      continue;
    }

    // ── Lists (bullet or ordered, with nesting + task checkboxes)
    if (LIST_ITEM_RE.test(line)) {
      const items: RawListItem[] = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM_RE);
        if (!m) break;
        const [, indent, marker, text] = m;
        const ordered = /^\d+\.$/.test(marker);
        items.push({
          level: Math.floor(indent.replace(/\t/g, '  ').length / 2),
          ordered,
          start: ordered ? parseInt(marker, 10) : 1,
          text
        });
        i++;
      }
      out.push(renderListBlock(items));
      continue;
    }

    // ── Blank line → paragraph break
    if (line.trim() === '') {
      out.push('<br>');
      i++;
      continue;
    }

    // ── Paragraph — merge contiguous plain lines into one <p>, joined by
    //    soft line breaks, instead of one <p> per line.
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p>${paraLines.map((l) => inlineMarkdown(l)).join('<br>')}</p>`);
  }

  return out.join('');
}
