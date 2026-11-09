import { writeFileSync, mkdirSync } from "node:fs";
import { countSolutions, calculateClues, difficulties, type Puzzle } from "../src/engine";
let seed = 30102026;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const shuffle = <T>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const puzzles: Puzzle[] = [];
for (const difficulty of difficulties) {
  const level = difficulties.indexOf(difficulty);
  for (let index = 0; index < 12; index++) {
    const units = () =>
      shuffle([0, 1, 2]).flatMap((b) =>
        shuffle([0, 1, 2]).map((i) => b * 3 + i),
      );
    const rows = units(),
      cols = units(),
      digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const solution = rows.flatMap((r) =>
      cols.map((c) => digits[(r * 3 + Math.floor(r / 3) + c) % 9]),
    );
    const clues = calculateClues(solution);
    const givens = [...solution];
    const target = [38, 30, 24, 20][level];
    let givenCount = 81;
    for (const i of shuffle(Array.from({ length: 81 }, (_, i) => i))) {
      if (givenCount <= target) break;
      const old = givens[i];
      givens[i] = 0;
      if (countSolutions(givens, clues) !== 1) givens[i] = old;
      else givenCount--;
    }
    puzzles.push({
      id: `${difficulty.toLowerCase()}-${index + 1}`,
      difficulty,
      givens,
      solution,
      ...clues,
    });
    console.log(
      difficulty,
      index + 1,
      givenCount,
      "clues",
      "sandwich sums",
    );
  }
}
mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/puzzles.json", JSON.stringify(puzzles));

