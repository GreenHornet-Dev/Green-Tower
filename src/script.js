/**
 * Green Tower - Main Game Logic
 * Phase 2 Prototype with JSON data integration, drag-and-drop, and system ranges.
 */

class GreenTower {
  constructor() {
    this.data = null;
    this.state = {
      funds: 0,
      stars: 1,
      morningCycle: 0,
      floors: [],
      staff: [],
      systems: [],
      elevators: [],
      waste: 0,
      happiness: 100,
      activeThreat: null,
      difficulty: 'medium'
    };
    // Track drag-and-drop source floor id
    this._dragSourceId = null;

    this.init();
  }

  async init() {
    try {
      const response = await fetch('../data/game-data.json');
      this.data = await response.json();
      this.setupInitialState();
      this.render();
      this.startLoop();
      this.log('System initialized. Welcome to Green Tower.', 'success');
    } catch (err) {
      console.error('Failed to load game data:', err);
    }
  }

  setupInitialState() {
    const diff = this.data.difficulties.find(d => d.id === this.state.difficulty);
    this.state.funds = diff.fundsStart;

    // Add ground floor by default
    this.state.floors.push({
      id: Date.now(),
      type: 'office',
      level: 0,
      happiness: 100,
      staffCount: 0
    });
  }

  // --- Core Game Loop ---
  startLoop() {
    setInterval(() => {
      this.updateEconomy();
      this.checkDisasters();
      this.render();
    }, 5000); // Tick every 5 seconds
  }

  morningCycle() {
    this.state.morningCycle++;
    this.log(`Morning Cycle ${this.state.morningCycle} started.`, 'info');

    // Waste Removal
    const wasteCrews = this.state.staff.filter(s => s.type === 'waste_crew').length;
    const removalAmount = wasteCrews * 50;
    this.state.waste = Math.max(0, this.state.waste - removalAmount);

    if (this.state.waste > 100) {
      this.state.happiness -= 5;
      this.log('Waste overflow! Happiness dropping.', 'warn');
    }

    this.calculateStars();
    this.render();
  }

  updateEconomy() {
    let income = 0;
    let expenses = 0;

    this.state.floors.forEach(f => {
      const type = this.data.floorTypes.find(t => t.id === f.type);
      if (!type) return;
      income += type.income;
      this.state.waste += 2; // Every floor generates waste
    });

    this.state.staff.forEach(s => {
      const type = this.data.staffTypes.find(t => t.id === s.type);
      if (!type) return;
      expenses += type.cost;
    });

    this.state.funds += (income - expenses);
  }

  // --- Build & Management ---
  buildFloor(typeId) {
    const type = this.data.floorTypes.find(t => t.id === typeId);
    if (!type) return;
    if (this.state.funds < type.cost) {
      this.log('Insufficient funds!', 'error');
      return;
    }

    this.state.funds -= type.cost;
    const level = type.basementOnly ? -(this.getBasementCount() + 1) : (this.getTowerCount() + 1);

    this.state.floors.push({
      id: Date.now(),
      type: typeId,
      level: level,
      happiness: type.happiness * 10,
      staffCount: 0
    });

    this.log(`Built ${type.label} on level ${level}.`, 'success');
    this.calculateStars();
    this.render();
  }

  hireStaff(typeId) {
    const type = this.data.staffTypes.find(t => t.id === typeId);
    if (!type) return;
    if (this.state.funds < type.cost) {
      this.log('Insufficient funds!', 'error');
      return;
    }

    this.state.funds -= type.cost;
    this.state.staff.push({
      id: Date.now(),
      type: typeId,
      level: 0 // Default placement
    });

    this.log(`Hired ${type.label}.`, 'success');
    this.calculateStars();
    this.render();
  }

  /**
   * Purchase and install a defense system.
   * @param {string} typeId - The system id from game-data.json systems array.
   */
  installSystem(typeId) {
    const type = this.data.systems.find(t => t.id === typeId);
    if (!type) return;
    if (this.state.funds < type.cost) {
      this.log('Insufficient funds!', 'error');
      return;
    }

    this.state.funds -= type.cost;
    this.state.systems.push({
      id: Date.now(),
      type: typeId
    });

    this.log(`Installed ${type.label}.`, 'success');
    this.render();
  }

  /**
   * Purchase and add an elevator to the tower.
   * @param {string} typeId - The elevator id from game-data.json elevators array.
   */
  addElevator(typeId) {
    const type = this.data.elevators.find(t => t.id === typeId);
    if (!type) return;
    if (type.unlockStars && this.state.stars < type.unlockStars) {
      this.log(`${type.label} requires ${type.unlockStars} stars to unlock!`, 'warn');
      return;
    }
    if (this.state.funds < type.cost) {
      this.log('Insufficient funds!', 'error');
      return;
    }

    this.state.funds -= type.cost;
    this.state.elevators.push({
      id: Date.now(),
      type: typeId
    });

    this.log(`Added ${type.label}.`, 'success');
    this.render();
  }

  /**
   * Change the game difficulty. Only effective before the game has progressed
   * (no floors beyond the starting floor and no morning cycles run).
   * @param {string} id - Difficulty id: 'easy', 'medium', or 'hard'.
   */
  setDifficulty(id) {
    const diff = this.data.difficulties.find(d => d.id === id);
    if (!diff) return;
    this.state.difficulty = id;
    this.log(`Difficulty set to ${diff.label}.`, 'info');
    this.render();
  }

  /**
   * Reset the game to a fresh state, keeping the current difficulty.
   */
  resetGame() {
    const difficulty = this.state.difficulty;
    this.state = {
      funds: 0,
      stars: 1,
      morningCycle: 0,
      floors: [],
      staff: [],
      systems: [],
      elevators: [],
      waste: 0,
      happiness: 100,
      activeThreat: null,
      difficulty
    };
    this._dragSourceId = null;
    this.setupInitialState();
    this.log('Game reset. Welcome back to Green Tower.', 'success');
    this.render();
  }

  // --- Disaster Management ---
  checkDisasters() {
    if (this.state.activeThreat) return;

    const diff = this.data.difficulties.find(d => d.id === this.state.difficulty);
    if (Math.random() < diff.disasterRate) {
      const disaster = this.data.disasters[Math.floor(Math.random() * this.data.disasters.length)];
      this.triggerDisaster(disaster);
    }
  }

  triggerDisaster(disaster) {
    this.state.activeThreat = disaster;
    this.log(`CRITICAL: ${disaster.label} detected!`, 'error');

    // Show threat indicator overlay
    const indicator = document.getElementById('threat-indicator');
    if (indicator) indicator.style.display = 'block';

    // Check if we have counters in range
    const canCounter = disaster.counters.some(c => {
      const hasSystem = this.state.systems.some(sys => sys.type === c);
      const hasStaff = this.state.staff.some(s => {
        const type = this.data.staffTypes.find(st => st.id === s.type);
        return type && (type.effect === c || type.id === c || type.effect === 'all');
      });
      return hasSystem || hasStaff;
    });

    if (canCounter) {
      setTimeout(() => {
        this.log(`${disaster.label} neutralized by defense systems.`, 'success');
        this.state.activeThreat = null;
        if (indicator) indicator.style.display = 'none';
        this.render();
      }, 3000);
    } else {
      this.state.happiness -= disaster.severity * 10;
      this.state.funds -= disaster.severity * 5000;
      // Clamp happiness to valid range
      this.state.happiness = Math.max(0, this.state.happiness);
      setTimeout(() => {
        this.log(`${disaster.label} caused damage before subsiding.`, 'warn');
        this.state.activeThreat = null;
        if (indicator) indicator.style.display = 'none';
        this.render();
      }, 5000);
    }
  }

  // --- UI & Rendering ---
  render() {
    const app = document.getElementById('app');
    if (!app) return;

    // Update Top Stats
    document.getElementById('funds').innerText = `$${this.state.funds.toLocaleString()}`;
    document.getElementById('stars').innerText = '⭐'.repeat(this.state.stars);
    document.getElementById('happiness').innerText = `${this.state.happiness}%`;
    document.getElementById('waste').innerText = `${this.state.waste} units`;

    this.renderBuildMenu();
    this.renderTower();
    this.renderStaffMenu();
    this.renderSystemsMenu();
    this.renderElevatorStatus();
    this.renderProtectionRings();

    // Update difficulty selector if present
    const diffSelect = document.getElementById('difficulty-select');
    if (diffSelect) diffSelect.value = this.state.difficulty;
  }

  renderBuildMenu() {
    const menu = document.getElementById('build-menu');
    if (!menu) return;
    menu.innerHTML = '';

    this.data.floorTypes.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'build-btn';

      const locked = type.unlockStars && this.state.stars < type.unlockStars;
      const affordable = this.state.funds >= type.cost;
      btn.disabled = locked || !affordable;

      const lockLabel = locked ? ` 🔒 (${type.unlockStars}⭐)` : '';
      btn.innerHTML = `
        <div class="name">${type.label}${lockLabel}</div>
        <div class="details">$${type.cost.toLocaleString()} | +$${type.income}/tick</div>
      `;

      if (!locked) {
        btn.onclick = () => this.buildFloor(type.id);
      }
      menu.appendChild(btn);
    });
  }

  renderTower() {
    const stack = document.getElementById('tower-stack');
    if (!stack) return;
    stack.innerHTML = '';

    // Sort floors: basements at bottom (most negative first), then tower floors ascending
    const sortedFloors = [...this.state.floors].sort((a, b) => a.level - b.level);

    sortedFloors.forEach(f => {
      const type = this.data.floorTypes.find(t => t.id === f.type);
      if (!type) return;

      const div = document.createElement('div');
      div.className = `floor-item ${f.level < 0 ? 'basement' : ''}`;
      div.draggable = true;
      div.dataset.floorId = f.id;
      div.innerHTML = `
        <span>Lvl ${f.level}: ${type.label}</span>
        <span>😊 ${f.happiness}%</span>
      `;

      // Drag-and-drop: swap the types (and happiness) of two floors
      div.addEventListener('dragstart', (e) => {
        this._dragSourceId = f.id;
        div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
      });
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetId = f.id;
        if (this._dragSourceId == null || this._dragSourceId === targetId) return;

        // Swap floor type and happiness between source and target floors
        const src = this.state.floors.find(fl => fl.id === this._dragSourceId);
        const tgt = this.state.floors.find(fl => fl.id === targetId);
        if (!src || !tgt) return;

        // Only allow swapping floors of the same zone (above/below ground)
        if ((src.level < 0) !== (tgt.level < 0)) {
          this.log('Cannot swap basement floors with tower floors.', 'warn');
          return;
        }

        [src.type, tgt.type] = [tgt.type, src.type];
        [src.happiness, tgt.happiness] = [tgt.happiness, src.happiness];
        this._dragSourceId = null;
        this.log('Floors swapped.', 'info');
        this.render();
      });

      stack.appendChild(div);
    });
  }

  renderStaffMenu() {
    const menu = document.getElementById('staff-menu');
    if (!menu) return;
    menu.innerHTML = '';

    this.data.staffTypes.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.disabled = this.state.funds < type.cost;
      btn.innerHTML = `${type.icon} ${type.label} ($${type.cost.toLocaleString()})`;
      btn.onclick = () => this.hireStaff(type.id);
      menu.appendChild(btn);
    });
  }

  /**
   * Render the defense systems and elevators panel in the systems tab.
   * Shows installed counts and purchase buttons for each type.
   */
  renderSystemsMenu() {
    const menu = document.getElementById('systems-menu');
    if (!menu) return;
    menu.innerHTML = '';

    // Section: Defense Systems
    const sysHeader = document.createElement('h3');
    sysHeader.innerText = '🛡 Defense Systems';
    sysHeader.style.marginBottom = '8px';
    menu.appendChild(sysHeader);

    this.data.systems.forEach(type => {
      const installed = this.state.systems.filter(s => s.type === type.id).length;
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.disabled = this.state.funds < type.cost;
      btn.innerHTML = `
        <div class="name">${type.label} (x${installed})</div>
        <div class="details">$${type.cost.toLocaleString()} | Range: ${type.range} floors</div>
      `;
      btn.onclick = () => this.installSystem(type.id);
      menu.appendChild(btn);
    });

    // Section: Elevators
    const elevHeader = document.createElement('h3');
    elevHeader.innerText = '🛗 Elevators';
    elevHeader.style.margin = '12px 0 8px';
    menu.appendChild(elevHeader);

    this.data.elevators.forEach(type => {
      const installed = this.state.elevators.filter(e => e.type === type.id).length;
      const locked = type.unlockStars && this.state.stars < type.unlockStars;
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.disabled = locked || this.state.funds < type.cost;

      const lockLabel = locked ? ` 🔒 (${type.unlockStars}⭐)` : '';
      btn.innerHTML = `
        <div class="name">${type.label}${lockLabel} (x${installed})</div>
        <div class="details">$${type.cost.toLocaleString()} | Cap: ${type.capacity}</div>
      `;
      if (!locked) {
        btn.onclick = () => this.addElevator(type.id);
      }
      menu.appendChild(btn);
    });
  }

  /**
   * Update the elevator status stat card with a summary of installed elevators.
   */
  renderElevatorStatus() {
    const el = document.getElementById('elevator-status');
    if (!el) return;

    if (this.state.elevators.length === 0) {
      el.innerText = 'None installed';
      return;
    }

    // Count by type and summarize
    const counts = {};
    this.state.elevators.forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    const summary = Object.entries(counts).map(([typeId, count]) => {
      const type = this.data.elevators.find(t => t.id === typeId);
      return `${type ? type.label : typeId} x${count}`;
    }).join(', ');

    el.innerText = summary;
  }

  /**
   * Render protection rings around the tower based on installed defense systems.
   * Each system type gets a ring sized by its range value.
   */
  renderProtectionRings() {
    const rings = document.getElementById('rings');
    if (!rings) return;
    rings.innerHTML = '';

    // Gather unique system types installed
    const installedTypes = [...new Set(this.state.systems.map(s => s.type))];

    installedTypes.forEach(typeId => {
      const type = this.data.systems.find(t => t.id === typeId);
      if (!type) return;

      const ring = document.createElement('div');
      ring.className = 'ring';
      // Map protects array to CSS class (use first protection type for color)
      const protectClass = type.protects[0] || 'service';
      ring.classList.add(protectClass);

      // Scale ring size based on range (20px per range unit as baseline)
      const size = type.range * 20;
      ring.style.width = `${size}px`;
      ring.style.height = `${size}px`;
      ring.title = `${type.label} (range: ${type.range})`;
      rings.appendChild(ring);
    });
  }

  /**
   * Export the current game state to a JSON file download.
   */
  exportSave() {
    const data = JSON.stringify(this.state, null, 2);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'green-tower-save.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import a game save from a JSON string and restore the game state.
   * Validates that required state fields are present before applying.
   * @param {string} jsonString - JSON-encoded game state from exportSave().
   */
  importSave(jsonString) {
    try {
      const saved = JSON.parse(jsonString);

      // Validate required top-level fields
      const required = ['funds', 'stars', 'floors', 'staff', 'systems', 'elevators', 'waste', 'happiness', 'difficulty'];
      for (const key of required) {
        if (!(key in saved)) {
          this.log(`Save file missing field: ${key}`, 'error');
          return false;
        }
      }

      this.state = Object.assign({}, this.state, saved);
      this._dragSourceId = null;
      this.log('Save file loaded successfully.', 'success');
      this.render();
      return true;
    } catch (err) {
      this.log('Failed to load save file: invalid JSON.', 'error');
      console.error('importSave error:', err);
      return false;
    }
  }

  // --- Helpers ---
  getTowerCount() { return this.state.floors.filter(f => f.level >= 0).length; }
  getBasementCount() { return this.state.floors.filter(f => f.level < 0).length; }

  calculateStars() {
    const floors = this.state.floors.length;
    const baseStars = Math.min(5, Math.floor(floors / 5));
    const happinessBonus = this.state.happiness > 90 ? 1 : 0;
    this.state.stars = Math.max(1, Math.min(10, baseStars + happinessBonus));
  }

  log(msg, type = 'info') {
    const logPanel = document.getElementById('log-content');
    if (!logPanel) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logPanel.prepend(entry);
  }
}

/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  // Node.js / test environment: export the class for unit testing
  module.exports = { GreenTower };
} else {
  // Browser environment: create the singleton game instance
  window.game = new GreenTower();
}
