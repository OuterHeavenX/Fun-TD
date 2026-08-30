export class SpatialGrid {
  constructor(cellSize = 96) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.result = [];
  }

  rebuild(enemies) {
    for (const cell of this.cells.values()) cell.length = 0;
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.active || enemy.hp <= 0) continue;
      const cx = Math.floor(enemy.x / this.cellSize);
      const cy = Math.floor(enemy.y / this.cellSize);
      const key = `${cx},${cy}`;
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, (cell = []));
      cell.push(enemy);
    }
  }

  query(x, y, radius) {
    const result = this.result;
    result.length = 0;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) for (let i = 0; i < cell.length; i++) result.push(cell[i]);
      }
    }
    return result;
  }
}
