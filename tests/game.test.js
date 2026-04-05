/**
 * Green Tower - Unit Tests
 * Tests for core game logic using a headless (non-DOM) approach.
 * We extract the class logic and test it with mock game data.
 */

'use strict';

// ---- Minimal DOM stubs so the class can be instantiated without a browser ----
global.document = {
  getElementById: () => null,
  createElement: () => ({
    className: '',
    innerHTML: '',
    innerText: '',
    style: {},
    classList: { add: () => {}, remove: () => {} },
    dataset: {},
    addEventListener: () => {},
    appendChild: () => {},
    click: () => {},
    prepend: () => {}
  }),
  querySelectorAll: () => []
};
global.URL = {
  _counter: 0,
  createObjectURL: () => `blob:mock-${++global.URL._counter}`,
  revokeObjectURL: () => {}
};
global.Blob = class Blob {};
global.fetch = () => Promise.reject(new Error('fetch not available in test env'));
global.setInterval = () => {};
global.confirm = () => true;

// ---- Load the GreenTower class ----
const path = require('path');
const { GreenTower } = require(path.join(__dirname, '../src/script.js'));

// ---- Shared mock game data matching data/game-data.json schema ----
const mockData = {
  difficulties: [
    { id: 'easy',   label: 'Cadet',     disasterRate: 0.05, fundsStart: 500000, staffCostMult: 0.8 },
    { id: 'medium', label: 'Commander', disasterRate: 0.12, fundsStart: 250000, staffCostMult: 1.0 },
    { id: 'hard',   label: 'Overlord',  disasterRate: 0.22, fundsStart: 100000, staffCostMult: 1.3 }
  ],
  floorTypes: [
    { id: 'office',       label: 'Office Space',    zone: 'commercial', cost: 20000, income: 2000, happiness: 5, capacity: 50, staffNeeded: ['cleaner','maintenance'] },
    { id: 'restaurant',   label: 'Restaurant',      zone: 'commercial', cost: 15000, income: 1200, happiness: 8, capacity: 40, staffNeeded: ['cleaner','security'] },
    { id: 'waste_storage',label: 'Waste Storage',   zone: 'utility',    cost: 5000,  income: 0,    happiness: 1, capacity: 0,  staffNeeded: ['waste_crew'], basementOnly: true },
    { id: 'greenhouse',   label: 'Greenhouse',      zone: 'leisure',    cost: 35000, income: 800,  happiness: 10, capacity: 20, staffNeeded: ['maintenance'], unlockStars: 5 }
  ],
  staffTypes: [
    { id: 'security',   label: 'Security Guard', cost: 3000, range: 5, effect: 'security',  icon: '🛡' },
    { id: 'cleaner',    label: 'Cleaner',        cost: 1500, range: 2, effect: 'hygiene',   icon: '🧹' },
    { id: 'waste_crew', label: 'Waste Removal',  cost: 2000, range: 3, effect: 'waste',     icon: '🗑' },
    { id: 'special_tech', label: 'Special Tech', cost: 8000, range: 10, effect: 'all',      icon: '👽' }
  ],
  systems: [
    { id: 'fire_suppression', label: 'Fire Suppression', cost: 15000, range: 4, protects: ['fire'] },
    { id: 'emp_defense',      label: 'EMP Defense Grid',  cost: 30000, range: 10, protects: ['emp','alien_invasion'] }
  ],
  elevators: [
    { id: 'regular', label: 'Regular Elevator', capacity: 20, accessLevel: 'all',  cost: 10000, staffOnly: false },
    { id: 'vip',     label: 'VIP Teleporter',   capacity: 1,  accessLevel: 'vip',  cost: 100000, staffOnly: false, unlockStars: 8 }
  ],
  disasters: [
    { id: 'fire',          label: 'Fire Outbreak',  severity: 3, counters: ['fire_suppression','fire_alarm','security'] },
    { id: 'alien_invasion',label: 'Alien Invasion', severity: 5, counters: ['emp_defense','cameras','security','special_tech'] }
  ]
};

/** Helper: create a GreenTower with mock data already loaded (skips async init). */
function makeGame(difficultyId = 'medium') {
  const game = Object.create(GreenTower.prototype);
  game._dragSourceId = null;
  game.data = mockData;
  game.state = {
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
    difficulty: difficultyId
  };
  game.setupInitialState();
  return game;
}

// ============================================================
// Tests: setupInitialState
// ============================================================
describe('setupInitialState', () => {
  test('sets funds from difficulty config', () => {
    const game = makeGame('easy');
    expect(game.state.funds).toBe(500000);
  });

  test('sets funds for medium difficulty', () => {
    const game = makeGame('medium');
    expect(game.state.funds).toBe(250000);
  });

  test('adds a ground-floor office at level 0', () => {
    const game = makeGame();
    expect(game.state.floors).toHaveLength(1);
    expect(game.state.floors[0]).toMatchObject({ type: 'office', level: 0 });
  });
});

// ============================================================
// Tests: getTowerCount / getBasementCount
// ============================================================
describe('getTowerCount / getBasementCount', () => {
  test('ground floor counts as tower level', () => {
    const game = makeGame();
    expect(game.getTowerCount()).toBe(1);
    expect(game.getBasementCount()).toBe(0);
  });

  test('basement floors are counted separately', () => {
    const game = makeGame();
    game.state.floors.push({ id: 99, type: 'waste_storage', level: -1, happiness: 10, staffCount: 0 });
    expect(game.getBasementCount()).toBe(1);
    expect(game.getTowerCount()).toBe(1);
  });
});

// ============================================================
// Tests: calculateStars
// ============================================================
describe('calculateStars', () => {
  test('starts at 1 star with 1 floor and high happiness', () => {
    const game = makeGame();
    game.calculateStars();
    expect(game.state.stars).toBe(1);
  });

  test('gains base stars every 5 floors (up to 5 base)', () => {
    const game = makeGame();
    // Add 4 more floors to total 5
    for (let i = 1; i < 5; i++) {
      game.state.floors.push({ id: i, type: 'office', level: i, happiness: 100, staffCount: 0 });
    }
    game.state.happiness = 80; // No happiness bonus
    game.calculateStars();
    expect(game.state.stars).toBe(1); // floor(5/5)=1, no bonus
  });

  test('happiness bonus adds 1 star when happiness > 90', () => {
    const game = makeGame();
    // 5 floors → baseStars=1, happiness>90 → +1 = 2
    for (let i = 1; i < 5; i++) {
      game.state.floors.push({ id: i, type: 'office', level: i, happiness: 100, staffCount: 0 });
    }
    game.state.happiness = 95;
    game.calculateStars();
    expect(game.state.stars).toBe(2);
  });

  test('stars are capped at 10', () => {
    const game = makeGame();
    // formula: baseStars = min(5, floor(floors/5)), happiness bonus = 1 if >90
    // Max possible: 5 base + 1 bonus = 6, clamped to min(10, 6) = 6
    // Ensure the result never exceeds 10 (the Math.min(10, ...) guard works)
    game.state.floors = Array.from({ length: 50 }, (_, i) => ({ id: i, type: 'office', level: i, happiness: 100, staffCount: 0 }));
    game.state.happiness = 100;
    game.calculateStars();
    expect(game.state.stars).toBeLessThanOrEqual(10);
    expect(game.state.stars).toBeGreaterThanOrEqual(1);
  });

  test('stars minimum is 1', () => {
    const game = makeGame();
    game.state.floors = [];
    game.state.happiness = 0;
    game.calculateStars();
    expect(game.state.stars).toBe(1);
  });
});

// ============================================================
// Tests: buildFloor
// ============================================================
describe('buildFloor', () => {
  test('deducts cost and adds floor', () => {
    const game = makeGame('medium'); // starts with $250,000
    game.buildFloor('restaurant'); // costs $15,000
    expect(game.state.funds).toBe(235000);
    expect(game.state.floors.some(f => f.type === 'restaurant')).toBe(true);
  });

  test('refuses build if insufficient funds', () => {
    const game = makeGame('medium');
    game.state.funds = 100; // Not enough for anything
    const floorsBefore = game.state.floors.length;
    game.buildFloor('office');
    expect(game.state.floors.length).toBe(floorsBefore); // No new floor added
  });

  test('basement floors get negative levels', () => {
    const game = makeGame('medium');
    game.buildFloor('waste_storage'); // basementOnly: true
    const basement = game.state.floors.find(f => f.type === 'waste_storage');
    expect(basement).toBeDefined();
    expect(basement.level).toBeLessThan(0);
  });

  test('tower floors get positive levels above existing count', () => {
    const game = makeGame('medium');
    const prevCount = game.getTowerCount(); // 1 (ground floor)
    game.buildFloor('restaurant');
    const newFloor = game.state.floors.find(f => f.type === 'restaurant');
    expect(newFloor.level).toBe(prevCount + 1);
  });

  test('calls calculateStars after building', () => {
    const game = makeGame('medium');
    const spy = jest.spyOn(game, 'calculateStars');
    game.buildFloor('restaurant');
    expect(spy).toHaveBeenCalled();
  });

  test('ignores unknown floor type', () => {
    const game = makeGame('medium');
    const fundsBefore = game.state.funds;
    game.buildFloor('nonexistent_type');
    expect(game.state.funds).toBe(fundsBefore);
  });
});

// ============================================================
// Tests: hireStaff
// ============================================================
describe('hireStaff', () => {
  test('deducts cost and adds staff member', () => {
    const game = makeGame('medium');
    game.hireStaff('cleaner'); // costs $1500
    expect(game.state.funds).toBe(248500);
    expect(game.state.staff.some(s => s.type === 'cleaner')).toBe(true);
  });

  test('refuses hire if insufficient funds', () => {
    const game = makeGame('medium');
    game.state.funds = 0;
    game.hireStaff('cleaner');
    expect(game.state.staff.length).toBe(0);
  });

  test('calls calculateStars after hiring', () => {
    const game = makeGame('medium');
    const spy = jest.spyOn(game, 'calculateStars');
    game.hireStaff('cleaner');
    expect(spy).toHaveBeenCalled();
  });
});

// ============================================================
// Tests: installSystem
// ============================================================
describe('installSystem', () => {
  test('deducts cost and installs system', () => {
    const game = makeGame('medium');
    game.installSystem('fire_suppression'); // $15,000
    expect(game.state.funds).toBe(235000);
    expect(game.state.systems.some(s => s.type === 'fire_suppression')).toBe(true);
  });

  test('refuses install if insufficient funds', () => {
    const game = makeGame('medium');
    game.state.funds = 0;
    game.installSystem('fire_suppression');
    expect(game.state.systems.length).toBe(0);
  });

  test('ignores unknown system type', () => {
    const game = makeGame('medium');
    const fundsBefore = game.state.funds;
    game.installSystem('nonexistent_system');
    expect(game.state.funds).toBe(fundsBefore);
  });

  test('can install multiple copies of the same system', () => {
    const game = makeGame('easy'); // more funds
    game.installSystem('fire_suppression');
    game.installSystem('fire_suppression');
    expect(game.state.systems.filter(s => s.type === 'fire_suppression').length).toBe(2);
  });
});

// ============================================================
// Tests: addElevator
// ============================================================
describe('addElevator', () => {
  test('deducts cost and adds elevator', () => {
    const game = makeGame('medium');
    game.addElevator('regular'); // $10,000
    expect(game.state.funds).toBe(240000);
    expect(game.state.elevators.some(e => e.type === 'regular')).toBe(true);
  });

  test('refuses add if insufficient funds', () => {
    const game = makeGame('medium');
    game.state.funds = 0;
    game.addElevator('regular');
    expect(game.state.elevators.length).toBe(0);
  });

  test('refuses locked elevator when stars insufficient', () => {
    const game = makeGame('easy'); // plenty of funds
    game.state.stars = 1; // VIP requires 8 stars
    game.addElevator('vip');
    expect(game.state.elevators.length).toBe(0);
  });

  test('allows locked elevator when stars sufficient', () => {
    const game = makeGame('easy');
    game.state.stars = 8;
    game.addElevator('vip');
    expect(game.state.elevators.some(e => e.type === 'vip')).toBe(true);
  });
});

// ============================================================
// Tests: setDifficulty
// ============================================================
describe('setDifficulty', () => {
  test('changes the difficulty state', () => {
    const game = makeGame('medium');
    game.setDifficulty('hard');
    expect(game.state.difficulty).toBe('hard');
  });

  test('ignores unknown difficulty id', () => {
    const game = makeGame('medium');
    game.setDifficulty('impossible');
    expect(game.state.difficulty).toBe('medium');
  });
});

// ============================================================
// Tests: resetGame
// ============================================================
describe('resetGame', () => {
  test('resets funds, floors, staff, and systems to initial state', () => {
    const game = makeGame('medium');
    game.buildFloor('restaurant');
    game.hireStaff('security');
    game.installSystem('fire_suppression');
    game.resetGame();
    expect(game.state.floors).toHaveLength(1); // Only the starting ground floor
    expect(game.state.staff).toHaveLength(0);
    expect(game.state.systems).toHaveLength(0);
    expect(game.state.morningCycle).toBe(0);
  });

  test('preserves difficulty setting across reset', () => {
    const game = makeGame('hard');
    game.resetGame();
    expect(game.state.difficulty).toBe('hard');
  });

  test('restores correct starting funds for difficulty', () => {
    const game = makeGame('easy');
    game.state.funds = 0; // drain funds
    game.resetGame();
    expect(game.state.funds).toBe(500000);
  });
});

// ============================================================
// Tests: updateEconomy
// ============================================================
describe('updateEconomy', () => {
  test('adds income from floors minus staff expenses', () => {
    const game = makeGame('medium');
    // Starting floor: office, income=2000
    const startFunds = game.state.funds;
    game.updateEconomy();
    // 1 floor: income=2000, 0 staff: expenses=0 → net +2000
    expect(game.state.funds).toBe(startFunds + 2000);
  });

  test('generates waste per floor per tick', () => {
    const game = makeGame('medium');
    game.updateEconomy();
    expect(game.state.waste).toBe(2); // 1 floor × 2 waste
  });

  test('deducts staff costs each tick', () => {
    const game = makeGame('medium');
    game.state.staff.push({ id: 1, type: 'security', level: 0 }); // $3000/tick
    const startFunds = game.state.funds;
    game.updateEconomy();
    // 1 floor income=2000, 1 security cost=3000 → net -1000
    expect(game.state.funds).toBe(startFunds - 1000);
  });
});

// ============================================================
// Tests: morningCycle
// ============================================================
describe('morningCycle', () => {
  test('increments morningCycle counter', () => {
    const game = makeGame();
    game.morningCycle();
    expect(game.state.morningCycle).toBe(1);
  });

  test('waste crews reduce waste', () => {
    const game = makeGame();
    game.state.waste = 200;
    game.state.staff.push({ id: 1, type: 'waste_crew', level: 0 });
    game.morningCycle(); // 1 crew × 50 = 50 removed → 150
    expect(game.state.waste).toBe(150);
  });

  test('waste does not go below zero', () => {
    const game = makeGame();
    game.state.waste = 10;
    game.state.staff.push({ id: 1, type: 'waste_crew', level: 0 });
    game.morningCycle(); // crew removes 50 but only 10 exists
    expect(game.state.waste).toBe(0);
  });

  test('happiness drops when waste exceeds 100', () => {
    const game = makeGame();
    game.state.waste = 200;
    const startHappiness = game.state.happiness;
    game.morningCycle();
    expect(game.state.happiness).toBe(startHappiness - 5);
  });
});

// ============================================================
// Tests: triggerDisaster
// ============================================================
describe('triggerDisaster', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('sets activeThreat synchronously', () => {
    const game = makeGame();
    const disaster = mockData.disasters[0]; // fire
    game.triggerDisaster(disaster);
    expect(game.state.activeThreat).toBe(disaster);
  });

  test('neutralizes disaster when counter system is present', () => {
    const game = makeGame();
    game.state.systems.push({ id: 1, type: 'fire_suppression' });
    const disaster = mockData.disasters[0]; // fire, countered by fire_suppression
    game.triggerDisaster(disaster);
    jest.runAllTimers();
    expect(game.state.activeThreat).toBeNull();
  });

  test('reduces happiness and funds when no counter is available', () => {
    const game = makeGame();
    const disaster = mockData.disasters[0]; // fire, no counter installed
    const startHappiness = game.state.happiness;
    const startFunds = game.state.funds;
    game.triggerDisaster(disaster);
    jest.runAllTimers();
    expect(game.state.happiness).toBe(startHappiness - disaster.severity * 10);
    expect(game.state.funds).toBe(startFunds - disaster.severity * 5000);
  });

  test('clamps happiness to 0 on severe disaster', () => {
    const game = makeGame();
    game.state.happiness = 10;
    const disaster = mockData.disasters[1]; // alien invasion, severity 5 → -50
    game.triggerDisaster(disaster);
    jest.runAllTimers();
    expect(game.state.happiness).toBeGreaterThanOrEqual(0);
  });

  test('special_tech counters alien_invasion via effect=all', () => {
    const game = makeGame();
    game.state.staff.push({ id: 1, type: 'special_tech', level: 0 });
    const disaster = mockData.disasters[1]; // alien_invasion, countered by special_tech
    const startHappiness = game.state.happiness;
    game.triggerDisaster(disaster);
    jest.runAllTimers();
    // Should be neutralized → happiness unchanged
    expect(game.state.happiness).toBe(startHappiness);
  });
});

// ============================================================
// Tests: importSave / exportSave
// ============================================================
describe('importSave', () => {
  test('loads a valid save string', () => {
    const game = makeGame('medium');
    const saved = {
      funds: 999,
      stars: 3,
      morningCycle: 5,
      floors: [{ id: 1, type: 'restaurant', level: 1, happiness: 80, staffCount: 0 }],
      staff: [],
      systems: [],
      elevators: [],
      waste: 20,
      happiness: 75,
      activeThreat: null,
      difficulty: 'easy'
    };
    const result = game.importSave(JSON.stringify(saved));
    expect(result).toBe(true);
    expect(game.state.funds).toBe(999);
    expect(game.state.stars).toBe(3);
    expect(game.state.happiness).toBe(75);
  });

  test('returns false for invalid JSON', () => {
    const game = makeGame();
    const result = game.importSave('{invalid json}');
    expect(result).toBe(false);
  });

  test('returns false when required fields are missing', () => {
    const game = makeGame();
    const incomplete = JSON.stringify({ funds: 100 }); // missing most fields
    const result = game.importSave(incomplete);
    expect(result).toBe(false);
  });
});
