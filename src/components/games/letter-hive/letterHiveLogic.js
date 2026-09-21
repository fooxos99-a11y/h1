import { BOARD_LETTERS } from './letterHiveData';

function shuffleLetters(letters) {
  const shuffled = [...letters];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export function buildBoardLetters() {
  return shuffleLetters(BOARD_LETTERS);
}

function getNeighbors(index) {
  const row = Math.floor(index / 5);
  const col = index % 5;
  const checks = row % 2 === 0
    ? [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]
    : [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]];

  return checks
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([nextRow, nextCol]) => nextRow >= 0 && nextRow < 5 && nextCol >= 0 && nextCol < 5)
    .map(([nextRow, nextCol]) => nextRow * 5 + nextCol);
}

export function hasWinningPath(color, hexes) {
  const owned = hexes.map((entry, index) => (entry === color ? index : null)).filter((entry) => entry !== null);
  const targets = new Set();
  const startNodes = color === 'red'
    ? owned.filter((index) => index < 5)
    : owned.filter((index) => index % 5 === 0);

  if (color === 'red') {
    owned.filter((index) => index >= 20).forEach((index) => targets.add(index));
  } else {
    owned.filter((index) => index % 5 === 4).forEach((index) => targets.add(index));
  }

  const queue = [...startNodes];
  const visited = new Set(startNodes);

  while (queue.length > 0) {
    const current = queue.shift();
    if (targets.has(current)) return true;
    getNeighbors(current).forEach((neighbor) => {
      if (owned.includes(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    });
  }

  return false;
}
