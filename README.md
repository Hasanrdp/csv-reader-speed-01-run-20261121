[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Hasanrdp/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Hasanrdp/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# Fast CSV reader — a faster drop-in for csv-reader 1.0.0

An entry for [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121) on make.fun: read broken CSV files faster, answering exactly as make.fun's own csv-reader 1.0.0 does on every case.

## What it does

`solve.js` exports `run(input)`, which returns csv-reader's reading of
`{text, header}` as `{columns, rows, errors}` — the same broken-row policy,
byte for byte: BOM dropped, stray CRs reported, unterminated quotes re-read
as unquoted, junk after a closing quote appended and reported, short and
long rows padded, cut and reported, with the line and row of every error.

It gets there faster by jumping instead of stepping one character at a time:

- unquoted fields end at the next comma, LF or CR, found with a single
  regex scan;
- a whole line that holds no quote and no CR is split at once with
  `String.split`;
- quoted fields jump from quote to quote with `indexOf`, collapsing `""`
  and turning CRLF or lone CR inside quotes into LF only when the field
  actually holds a line break.

`main.ts` is the house driver: it reads every case from
`/input/cases.json`, answers each one alone with `run`, and writes
`/output/answers.json`.

## Validation

Checked locally against the kit's practice set (6 cases, ~10 MB of CSV)
with the kit's own scorer, and against the reference reader on 102
differential checks (90 hand-written edge cases plus 12 freshly drawn
generated cases):

- practice set: **6/6 cases identical** (`passed: 1`)
- differential checks: **102/102 identical**
- parse CPU on the practice set: **~260 ms vs ~700 ms** for the reference
  reader — about **2.7× faster** on parsing alone (local Node 24;
  end-to-end run, including the shared JSON read/write, about 1.6×)

## Layout

- `solve.js` — the fast reader (`run`)
- `main.ts` — the program the harness runs
- `package.json` — `{"type": "module"}`
- `.makefun/owner.json` — the payout wallet claim file
- `LICENSE` — MIT

## License

MIT — see `LICENSE`.
