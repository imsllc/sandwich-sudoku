export type Difficulty = "Easy" | "Medium" | "Hard" | "Expert";
export type Puzzle = {
  id: string;
  difficulty: Difficulty;
  givens: number[];
  solution: number[];
  rowSums: number[];
  colSums: number[];
};
export const difficulties: Difficulty[] = ["Easy", "Medium", "Hard", "Expert"];
export const MAX_NOTES = 4;

export function completedDigits(board: number[]): Set<number> {
  const counts = Array(10).fill(0);
  for (const digit of board) counts[digit]++;
  return new Set(
    Array.from({ length: 9 }, (_, index) => index + 1).filter(
      (digit) => counts[digit] === 9,
    ),
  );
}
export const peers = (a: number, b: number) =>
  a !== b &&
  (Math.floor(a / 9) === Math.floor(b / 9) ||
    a % 9 === b % 9 ||
    (Math.floor(a / 27) === Math.floor(b / 27) &&
      Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3)));

export type SandwichClues = Pick<Puzzle, "rowSums" | "colSums">;
export function sandwichSum(line: number[]): number {
  const a = line.indexOf(1), b = line.indexOf(9);
  return line.slice(Math.min(a, b) + 1, Math.max(a, b)).reduce((a, b) => a + b, 0);
}
export function calculateClues(board: number[]): SandwichClues {
  return {
    rowSums: Array.from({length: 9}, (_, r) => sandwichSum(board.slice(r * 9, r * 9 + 9))),
    colSums: Array.from({length: 9}, (_, c) => sandwichSum(Array.from({length: 9}, (_, r) => board[r * 9 + c]))),
  };
}
// A line is feasible when its crust positions and a subset of the unused filling
// digits can still satisfy the clue. Empty cells are never treated as zeroes.
const subsets = Array.from({length: 512}, (_, mask) => {
  const sums = Array.from({length: 8}, () => new Set<number>());
  for (let sub = mask; ; sub = (sub - 1) & mask) {
    let count = 0, sum = 0;
    for (let d = 2; d <= 8; d++) if (sub & (1 << (d - 1))) {count++; sum += d;}
    sums[count].add(sum);
    if (!sub) break;
  }
  return sums;
});
const lineCache = new Map<string, boolean>();
export function lineFeasible(line: number[], target: number): boolean {
  const key = line.join("") + ":" + target;
  const cached = lineCache.get(key);
  if (cached !== undefined) return cached;
  const check = () => {
    const fixed = line.filter(Boolean);
    if (new Set(fixed).size !== fixed.length) return false;
    let available = 254; // digits 2..8
    for (const d of fixed) available &= ~(1 << (d - 1));
    const one = line.indexOf(1), nine = line.indexOf(9);
    for (let a = 0; a < 9; a++) {
      if (one >= 0 ? a !== one : line[a] !== 0) continue;
      for (let b = 0; b < 9; b++) {
        if (a === b || (nine >= 0 ? b !== nine : line[b] !== 0)) continue;
        let sum = 0, empty = 0;
        for (let i = Math.min(a,b) + 1; i < Math.max(a,b); i++) {
          sum += line[i]; if (!line[i]) empty++;
        }
        if (subsets[available][empty].has(target - sum)) return true;
      }
    }
    return false;
  };
  const result = check();
  if (lineCache.size > 100000) lineCache.clear();
  lineCache.set(key, result);
  return result;
}
export function candidates(board: number[], clues: SandwichClues, cell: number): number[] {
  const used = new Set(board.filter((_, i) => peers(cell, i)));
  const r = Math.floor(cell / 9), c = cell % 9;
  const row = board.slice(r * 9, r * 9 + 9);
  const col = Array.from({length: 9}, (_, i) => board[i * 9 + c]);
  return Array.from({length: 9}, (_, i) => i + 1).filter(n => {
    if (used.has(n)) return false;
    row[c] = n; col[r] = n;
    return lineFeasible(row, clues.rowSums[r]) && lineFeasible(col, clues.colSums[c]);
  });
}
export function conflicts(board: number[], clues: SandwichClues): Set<number> {
  return new Set(board.flatMap((v, i) => v && !candidates(board, clues, i).includes(v) ? [i] : []));
}

// MRV search, bounded at two solutions for uniqueness checks. Never mutates the input.
export function countSolutions(
  input: number[],
  clues: SandwichClues,
  limit = 2,
): number {
  if (conflicts(input, clues).size) return 0;
  const board = [...input];
  let count = 0;
  const search = () => {
    if (count >= limit) return;
    let best = -1,
      options: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const ns = candidates(board, clues, i);
      if (!ns.length) return;
      if (best === -1 || ns.length < options.length) {
        best = i;
        options = ns;
      }
      if (ns.length === 1) break;
    }
    if (best === -1) {
      count++;
      return;
    }
    for (const n of options) {
      board[best] = n;
      search();
      if (count >= limit) break;
    }
    board[best] = 0;
  };
  search();
  return count;
}

export function transformPuzzle(
  puzzle: Puzzle,
  rotation: number,
  mirror: boolean,
  complement: boolean,
): Puzzle {
  const map = (i: number) => {
    let r = Math.floor(i / 9),
      c = i % 9;
    if (mirror) c = 8 - c;
    for (let k = 0; k < rotation; k++) [r, c] = [c, 8 - r];
    return r * 9 + c;
  };
  const grid = (values: number[]) => {
    const out = Array(81).fill(0);
    values.forEach((v, i) => {
      out[map(i)] = complement && v ? 10 - v : v;
    });
    return out;
  };
  return {
    ...puzzle,
    id: `${puzzle.id}-${rotation}${+mirror}${+complement}`,
    givens: grid(puzzle.givens),
    solution: grid(puzzle.solution),
    ...calculateClues(grid(puzzle.solution)),
  };
}

export type Snapshot = { board: number[]; notes: number[][] };
export function enterValue(
  snapshot: Snapshot,
  givens: number[],
  clues: SandwichClues,
  cell: number,
  value: number,
  pencil: boolean,
): Snapshot {
  if (givens[cell]) return snapshot;
  if (
    !pencil &&
    snapshot.board[cell] === value &&
    snapshot.notes[cell].length === 0
  )
    return snapshot;
  const board = [...snapshot.board],
    notes = snapshot.notes.map((n) => [...n]);
  if (pencil && value) {
    if (board[cell]) return snapshot;
    if (!notes[cell].includes(value) && notes[cell].length >= MAX_NOTES)
      return snapshot;
    notes[cell] = notes[cell].includes(value)
      ? notes[cell].filter((n) => n !== value)
      : [...notes[cell], value];
  } else {
    board[cell] = value;
    notes[cell] = [];
  }
  return { board, notes };
}
