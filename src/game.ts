import bank from "./data/puzzles.json";
import {
  transformPuzzle,
  calculateClues,
  conflicts,
  MAX_NOTES,
  type Difficulty,
  type Puzzle,
  type Snapshot,
} from "./engine";
export type Game = Snapshot & {
  puzzle: Puzzle;
  seconds: number;
  history: Snapshot[];
  hints: number;
  status: "playing" | "won" | "solved";
  selected: number;
};
export type Stats = { wins: number; best: Partial<Record<Difficulty, number>> };
export function newGame(difficulty: Difficulty, previous?: string): Game {
  const pool = (bank as Puzzle[]).filter((p) => p.difficulty === difficulty);
  let puzzle: Puzzle;
  do {
    puzzle = transformPuzzle(
      pool[Math.floor(Math.random() * pool.length)],
      Math.floor(Math.random() * 4),
      Math.random() < 0.5,
      Math.random() < 0.5,
    );
  } while (puzzle.id === previous);
  return {
    puzzle,
    board: [...puzzle.givens],
    notes: Array.from({ length: 81 }, () => []),
    seconds: 0,
    history: [],
    hints: 0,
    status: "playing",
    selected: puzzle.givens.findIndex((n) => !n),
  };
}
export function validSavedGame(value: unknown): value is Game {
  if (!value || typeof value !== "object") return false;
  const g = value as Game;
  const grid = (a: unknown): a is number[] =>
    Array.isArray(a) &&
    a.length === 81 &&
    a.every((n) => Number.isInteger(n) && n >= 0 && n <= 9);
  if (
    !g.puzzle ||
    !["Easy", "Medium", "Hard", "Expert"].includes(g.puzzle.difficulty) ||
    !grid(g.board) ||
    !grid(g.puzzle.givens) ||
    !grid(g.puzzle.solution)
  )
    return false;
  if (
    ![g.puzzle.rowSums, g.puzzle.colSums].every(sums =>
      Array.isArray(sums) && sums.length === 9 && sums.every(n => Number.isInteger(n) && n >= 0 && n <= 35))
  ) return false;

  const expected = calculateClues(g.puzzle.solution);
  if (typeof g.puzzle.id !== "string" || g.puzzle.solution.includes(0) ||
      conflicts(g.puzzle.solution, g.puzzle).size ||
      !g.puzzle.givens.every((n, i) => !n || n === g.puzzle.solution[i]) ||
      !expected.rowSums.every((n, i) => n === g.puzzle.rowSums[i]) ||
      !expected.colSums.every((n, i) => n === g.puzzle.colSums[i])) return false;
  if (
    !Array.isArray(g.notes) ||
    g.notes.length !== 81 ||
    !g.notes.every(
      (ns) =>
        Array.isArray(ns) &&
        ns.every((n) => Number.isInteger(n) && n >= 1 && n <= 9),
    )
  )
    return false;
  return (
    Number.isFinite(g.seconds) &&
    g.seconds >= 0 &&
    Number.isInteger(g.selected) &&
    g.selected >= 0 &&
    g.selected < 81 &&
    ["playing", "won", "solved"].includes(g.status) &&
    Array.isArray(g.history) &&
    g.history.every(
      (s) =>
        grid(s.board) &&
        Array.isArray(s.notes) &&
        s.notes.length === 81 &&
        s.notes.every(
          (ns) =>
            Array.isArray(ns) &&
            ns.every((n) => Number.isInteger(n) && n >= 1 && n <= 9),
        ),
    ) &&
    Number.isInteger(g.hints) &&
    g.hints >= 0 &&
    g.puzzle.givens.every((n, i) => !n || g.board[i] === n)
  );
}
export function restoreSavedGame(value: unknown): Game | null {
  if (!validSavedGame(value)) return null;
  const limitNotes = (notes: number[][]) =>
    notes.map((digits) => [...new Set(digits)].slice(0, MAX_NOTES));
  return {
    ...value,
    notes: limitNotes(value.notes),
    history: value.history.map((snapshot) => ({
      ...snapshot,
      notes: limitNotes(snapshot.notes),
    })),
  };
}

export const time = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
