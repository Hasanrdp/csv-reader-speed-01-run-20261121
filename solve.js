// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answers as the reference on every input, reached faster: the reader
// below walks the text once, left to right, but jumps instead of stepping
// one character at a time. Unquoted fields end at the nearest of comma, LF
// or CR, found with one regex scan; a whole line that holds no quote and no
// CR is split at once with String.split; only quoted fields and broken lines
// pay for the careful path. Every rule of the reference is kept:
//
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it is one quote, and each CRLF or lone CR inside
//     it is read as LF; what follows its closing quote, up to the next comma
//     or line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character, and the text
//     after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it, each padded with "" (short_row) or cut
//     (long_row) to the first record's width;
//   - each error is {code, line, row}, in the order met, line the 1-based
//     line its record starts on, row its record's index in rows (null for
//     the header).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters from pos onto `value`, up to the next comma
  // or line break. A CR not followed by LF is dropped (stray_cr). Returns
  // the field, how it ended, and how many characters were kept onto value.
  // The next separator is found with one regex scan, not three indexOf
  // scans, which V8 runs about twice as fast here.
  const SEP = /[,\n\r]/g;
  function readUnquoted(value) {
    const startLen = value.length;
    let start = pos;
    for (;;) {
      SEP.lastIndex = pos;
      const m = SEP.exec(text);
      if (m === null) {
        value += text.slice(start, n);
        pos = n;
        return { value, ended: END, added: value.length - startLen };
      }
      const i = m.index;
      const ch = m[0];
      if (ch === ',') {
        value += text.slice(start, i);
        pos = i + 1;
        return { value, ended: COMMA, added: value.length - startLen };
      }
      if (ch === '\n') {
        value += text.slice(start, i);
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added: value.length - startLen };
      }
      // A CR: a line break when LF follows, else a dropped stray_cr.
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        value += text.slice(start, i);
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added: value.length - startLen };
      }
      error('stray_cr');
      value += text.slice(start, i);
      pos = i + 1;
      start = pos;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let pieces = null; // set once a doubled quote is met
    let seg = pos; // start of the segment still uncollected
    let close = -1;
    let p = pos;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        if (pieces === null) pieces = [];
        pieces.push(text.slice(seg, q));
        pieces.push('"');
        p = q + 2;
        seg = q + 2;
        continue;
      }
      close = q;
      break;
    }
    // The field's raw span, open + 1 .. close, holds no closing quote.
    // When it holds no line break either, its value is the span itself
    // (with "" collapsed above) and the line does not move.
    const nl = text.indexOf('\n', open + 1);
    const cr = text.indexOf('\r', open + 1);
    let value;
    if ((nl === -1 || nl >= close) && (cr === -1 || cr >= close)) {
      value = pieces === null ? text.slice(open + 1, close) : pieces.join('') + text.slice(seg, close);
    } else {
      // Slow path: line breaks inside the quotes. Each CRLF or lone CR is
      // one LF in the value and one line counted.
      const raw = pieces === null ? text.slice(open + 1, close) : pieces.join('') + text.slice(seg, close);
      let count = 0;
      for (let i = 0; i < raw.length; i++) {
        const code = raw.charCodeAt(i);
        if (code === 10) count += 1;
        else if (code === 13 && raw.charCodeAt(i + 1) !== 10) count += 1;
      }
      line += count;
      value = raw.indexOf('\r') === -1 ? raw : raw.replace(/\r\n?/g, '\n');
    }
    pos = close + 1;
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Finishes a record read field by field: width, header and ragged rows.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (pos < n) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a whole line that holds no quote and no CR. Its fields
    // are the line split at commas; the line ends at LF, CRLF or the end
    // of the text. The quote and CR checks run on the line slice, so they
    // never scan past the line's end.
    const eol = text.indexOf('\n', pos);
    let contentEnd = eol === -1 ? n : eol;
    if (eol !== -1 && contentEnd > pos && text.charCodeAt(contentEnd - 1) === 13) contentEnd -= 1;
    const lineStr = text.slice(pos, contentEnd);
    if (lineStr.indexOf('"') === -1 && lineStr.indexOf('\r') === -1) {
      const fields = lineStr.split(',');
      if (eol === -1) pos = n;
      else {
        pos = eol + 1;
        line += 1;
      }
      finishRecord(fields, false);
      continue;
    }

    // Slow path: the line holds a quote or a stray CR, so read it field
    // by field, exactly as the reference does.
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);
    finishRecord(fields, quoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
