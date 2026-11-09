import { test } from "node:test";
import assert from "node:assert/strict";
import bank from "../src/data/puzzles.json";
import {
  candidates,
  calculateClues,
  sandwichSum,
  lineFeasible,
  conflicts,
  completedDigits,
  countSolutions,
  enterValue,
  transformPuzzle,
  type Puzzle,
} from "../src/engine";
import { newGame, restoreSavedGame, validSavedGame } from "../src/game";

test("notes preserve entry order, stop at four, and allow removal and replacement", () => {
  const empty = {
    board: Array(81).fill(0),
    notes: Array.from({ length: 81 }, () => [] as number[]),
  };
  const givens = Array(81).fill(0);
  let state = empty;
  for (const digit of [9, 2, 7, 1])
    state = enterValue(state, givens, calculateClues(bank[0].solution), 0, digit, true);
  assert.deepEqual(state.notes[0], [9, 2, 7, 1]);
  assert.equal(enterValue(state, givens, calculateClues(bank[0].solution), 0, 5, true), state);
  const removed = enterValue(state, givens, calculateClues(bank[0].solution), 0, 2, true);
  assert.deepEqual(removed.notes[0], [9, 7, 1]);
  const replaced = enterValue(removed, givens, calculateClues(bank[0].solution), 0, 5, true);
  assert.deepEqual(replaced.notes[0], [9, 7, 1, 5]);
  assert.deepEqual(state.notes[0], [9, 2, 7, 1]);
  assert.deepEqual(empty.notes[0], []);
});

test("completed digits include clues and update after erase, replacement, and undo", () => {
  const puzzle = bank[0];
  const state = {
    board: [...puzzle.solution],
    notes: Array.from({ length: 81 }, () => [9]),
  };
  assert.deepEqual([...completedDigits(state.board)], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const cell = puzzle.givens.findIndex((digit) => !digit);
  const digit = state.board[cell];
  const erased = enterValue(state, puzzle.givens, calculateClues(bank[0].solution), cell, 0, false);
  assert.equal(completedDigits(erased.board).has(digit), false);
  assert.equal(completedDigits(state.board).has(digit), true, "Undo restores completion");
  const replacement = digit === 1 ? 2 : 1;
  const changed = enterValue(erased, puzzle.givens, calculateClues(bank[0].solution), cell, replacement, false);
  assert.equal(completedDigits(changed.board).has(replacement), false, "Ten copies are not complete");
  assert.equal(completedDigits(changed.board).has(digit), false);
});

test("older saves retain progress while notes and undo history migrate to four corners", () => {
  const saved = newGame("Easy");
  const cell = saved.board.findIndex((digit) => !digit);
  saved.notes[cell] = [9, 2, 7, 1, 5, 3];
  saved.seconds = 123;
  saved.history = [{ board: [...saved.board], notes: saved.notes.map((digits) => [...digits]) }];
  const restored = restoreSavedGame(saved)!;
  assert.ok(restored);
  assert.deepEqual(restored.notes[cell], [9, 2, 7, 1]);
  assert.deepEqual(restored.history[0].notes[cell], [9, 2, 7, 1]);
  assert.deepEqual(restored.board, saved.board);
  assert.deepEqual(restored.puzzle, saved.puzzle);
  assert.equal(restored.seconds, 123);
  assert.equal(saved.notes[cell].length, 6, "Migration must not mutate input");
  assert.equal(restoreSavedGame({}), null);
});

test("every shipped puzzle has exactly one solution satisfying Sudoku and sandwich rules", () => {
  for (const p of bank as Puzzle[]) {
    assert.equal(p.givens.length, 81);
    assert.equal(new Set(p.solution).size, 9);
    assert.equal(conflicts(p.solution, p).size, 0, p.id);
    assert.ok(p.givens.every((n, i) => !n || n === p.solution[i]));
    assert.equal(countSolutions(p.givens, p), 1, p.id);
    assert.deepEqual(calculateClues(p.solution), {rowSums: p.rowSums, colSums: p.colSums});
  }
});

test("all sixteen puzzle transformations preserve unique solutions", () => {
  for (const p of (bank as Puzzle[]))
    for (let r = 0; r < 4; r++)
      for (const mirror of [false, true])
        for (const complement of [false, true]) {
          const q = transformPuzzle(p, r, mirror, complement);
          assert.equal(conflicts(q.solution, q).size, 0);
          assert.equal(countSolutions(q.givens, q), 1);
        }
});

test("sandwich boundaries, direction, small sums, and incomplete fillings", () => {
  assert.equal(sandwichSum([1,2,5,9,3,4,6,7,8]), 7);
  assert.equal(sandwichSum([9,5,2,1,3,4,6,7,8]), 7);
  assert.ok(lineFeasible([1,9,0,0,0,0,0,0,0], 0));
  assert.ok(!lineFeasible([1,0,9,0,0,0,0,0,0], 0));
  assert.ok(lineFeasible([1,0,9,0,0,0,0,0,0], 2));
  assert.ok(!lineFeasible([1,0,0,9,0,0,0,0,0], 4));
  assert.ok(lineFeasible([1,0,0,0,0,0,0,0,9], 35));
  assert.ok(!lineFeasible([0,1,0,0,0,0,0,0,9], 35));
  const p = bank[0];
  const wrong = {...p, rowSums: p.rowSums.map(n => n === 35 ? 0 : n + 1)};
  assert.ok(conflicts(p.solution, wrong).size > 0);
  assert.equal(countSolutions(p.solution, wrong), 0);
});

test("notes, immutable entries, and erase behave correctly", () => {
  const g = newGame("Easy"),
    i = g.board.findIndex((n) => !n),
    given = g.board.findIndex(Boolean);
  assert.equal(
    enterValue(g, g.puzzle.givens, g.puzzle, given, 5, false),
    g,
  );
  const noted = enterValue(g, g.puzzle.givens, g.puzzle, i, 3, true);
  assert.deepEqual(noted.notes[i], [3]);
  assert.deepEqual(g.notes[i], []);
  const unnoted = enterValue(
    noted,
    g.puzzle.givens,
    g.puzzle,
    i,
    3,
    true,
  );
  assert.deepEqual(unnoted.notes[i], []);
  const filled = enterValue(
    noted,
    g.puzzle.givens,
    g.puzzle,
    i,
    g.puzzle.solution[i],
    false,
  );
  assert.deepEqual(filled.notes[i], []);
  assert.equal(filled.board[i], g.puzzle.solution[i]);
  assert.equal(
    enterValue(filled, g.puzzle.givens, g.puzzle, i, 0, false).board[i],
    0,
  );
});

test("entering a number changes only the selected cell and its own notes", () => {
  const board = Array(81).fill(0);
  board[80] = 9;
  const notes = Array.from({ length: 81 }, () => [1, 2, 3]);
  const before = { board, notes };
  for (const [cell, value, pencil] of [
    [0, 2, false],
    [10, 3, true],
    [80, 0, false],
  ] as const) {
    const after = enterValue(
      before,
      Array(81).fill(0),
      calculateClues(bank[0].solution),
      cell,
      value,
      pencil,
    );
    for (let i = 0; i < 81; i++) {
      if (i === cell) continue;
      assert.equal(
        after.board[i],
        before.board[i],
        "Unselected number at " + i,
      );
      assert.deepEqual(
        after.notes[i],
        before.notes[i],
        "Unselected notes at " + i,
      );
    }
    assert.deepEqual(before.notes[cell], [1, 2, 3]);
  }
});

test("saved games reject malformed data and changed givens", () => {
  const g = newGame("Hard");
  assert.ok(validSavedGame(JSON.parse(JSON.stringify(g))));
  assert.equal(validSavedGame({ ...g, seconds: -1 }), false);
  assert.equal(validSavedGame({ ...g, notes: [[]] }), false);
  assert.equal(
    validSavedGame({ ...g, history: [{ board: [], notes: [] }] }),
    false,
  );
  const changed = [...g.board];
  changed[g.puzzle.givens.findIndex(Boolean)] = 0;
  assert.equal(validSavedGame({ ...g, board: changed }), false);
});

test("saved games reject missing, out-of-range, and inconsistent sandwich clues", () => {
  const g = newGame("Medium");
  for (const rowSums of [undefined, [], Array(9).fill(-1), Array(9).fill(36), g.puzzle.rowSums.map(n => n === 35 ? 0 : n + 1)]) {
    assert.equal(validSavedGame({...g, puzzle: {...g.puzzle, rowSums}}), false);
  }
});
test("partial-line feasibility agrees with exhaustive permutation search", () => {
  const cases = Array.from({length: 24}, (_, n) => {
    const source = bank[n].solution.slice(0, 9);
    return {line: source.map((v, i) => (i + n) % 3 === 0 ? v : 0), target: n % 2 ? sandwichSum(source) : n};
  });
  const possible = cases.map(() => false);
  const permutation: number[] = [];
  const enumerate = (mask: number) => {
    if (permutation.length === 9) {
      const sum = sandwichSum(permutation);
      cases.forEach(({line, target}, n) => {
        if (!possible[n] && target === sum && line.every((v,i) => !v || v === permutation[i])) possible[n] = true;
      });
      return;
    }
    for (let d = 1; d <= 9; d++) if (!(mask & (1 << d))) {
      permutation.push(d); enumerate(mask | (1 << d)); permutation.pop();
    }
  };
  enumerate(0);
  cases.forEach(({line, target}, i) => assert.equal(lineFeasible(line, target), possible[i], JSON.stringify({line,target})));
});
