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
      income += type.income;
      this.state.waste += 2; // Every floor generates waste
    });
    
    this.state.staff.forEach(s => {
      const type = this.data.staffTypes.find(t => t.id === s.type);
      expenses += type.cost;
    });
    
    this.state.funds += (income - expenses);
  }

  // --- Build & Management ---
  buildFloor(typeId) {
    const type = this.data.floorTypes.find(t => t.id === typeId);
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
    this.render();
  }

  hireStaff(typeId) {
    const type = this.data.staffTypes.find(t => t.id === typeId);
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
    
    // Check if we have counters in range
    const canCounter = disaster.counters.some(c => {
      const hasSystem = this.state.systems.some(sys => sys.type === c);
      const hasStaff = this.state.staff.some(s => {
        const type = this.data.staffTypes.find(st => st.id === s.type);
        return type.effect === c || type.id === c;
      });
      return hasSystem || hasStaff;
    });
    
    if (canCounter) {
      setTimeout(() => {
        this.log(`${disaster.label} neutralized by defense systems.`, 'success');
        this.state.activeThreat = null;
        this.render();
      }, 3000);
    } else {
      this.state.happiness -= disaster.severity * 10;
      this.state.funds -= disaster.severity * 5000;
      setTimeout(() => {
        this.log(`${disaster.label} caused damage before subsiding.`, 'warn');
        this.state.activeThreat = null;
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
  }

  renderBuildMenu() {
    const menu = document.getElementById('build-menu');
    menu.innerHTML = '';
    
    this.data.floorTypes.forEach(type => {
      if (type.unlockStars && this.state.stars < type.unlockStars) return;
      
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.innerHTML = `
        <div class="name">${type.label}</div>
        <div class="details">$${type.cost.toLocaleString()} | +$${type.income}/tick</div>
      `;
      btn.onclick = () => this.buildFloor(type.id);
      menu.appendChild(btn);
    });
  }

  renderTower() {
    const stack = document.getElementById('tower-stack');
    stack.innerHTML = '';
    
    // Sort floors by level
    const sortedFloors = [...this.state.floors].sort((a, b) => a.level - b.level);
    
    sortedFloors.forEach(f => {
      const type = this.data.floorTypes.find(t => t.id === f.type);
      const div = document.createElement('div');
      div.className = `floor-item ${f.level < 0 ? 'basement' : ''}`;
      div.draggable = true;
      div.innerHTML = `
        <span>Lvl ${f.level}: ${type.label}</span>
        <span>😊 ${f.happiness}%</span>
      `;
      stack.appendChild(div);
    });
  }

  renderStaffMenu() {
    const menu = document.getElementById('staff-menu');
    menu.innerHTML = '';
    
    this.data.staffTypes.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.innerHTML = `${type.icon} ${type.label} ($${type.cost})`;
      btn.onclick = () => this.hireStaff(type.id);
      menu.appendChild(btn);
    });
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

  exportSave() {
    const data = JSON.stringify(this.state);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'green-tower-save.json';
    a.click();
  }
}

window.game = new GreenTower();
