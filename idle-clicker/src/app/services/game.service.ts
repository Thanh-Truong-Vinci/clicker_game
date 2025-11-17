import { Injectable, signal, computed, effect } from '@angular/core';

type SaveShape = {
  money: number;
  health: number;
  gemLevel: number;
  generators: { id: string; quantity: number }[];
  upgrades: { id: string; quantity: number }[];
  auto?: boolean;
};

export interface GeneratorDef {
  id: string;
  name: string;
  baseCost: number;
  costMultiplier: number;
  cps: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  clickBonus?: number;
  cpsBonus?: number;
  unlockAutoClicker?: boolean;
}

export type Owned<T extends object> = T & {
  quantity: number;
  nextCost: number;
};

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly STORAGE_KEY = 'idle-clicker-save-v1';
  private tickHandle: any = null;
  private tickAutoHandle: any = null;

  // Plus de baseClick ici, juste maxHealth + visuel
  private gemDefs = [
    { name: 'Ruby', image: 'Ruby.png', maxHealth: 50, color: '#ff4561' },
    { name: 'Topaz', image: 'Topaz.png', maxHealth: 10_000, color: '#ffa726' },
    { name: 'Emerald', image: 'Emrald.png', maxHealth: 100_000, color: '#66bb6a' },
    { name: 'Sapphire', image: 'Sapphire.png', maxHealth: 1_000_000, color: '#42a5f5' },
    { name: 'Diamond', image: 'Diamond.png', maxHealth: 10_000_000, color: '#e0e0e0' },
  ];

  private _currentGemLevel = signal(0);
  currentGemLevel = this._currentGemLevel.asReadonly();

  currentGem = computed(() => this.gemDefs[this._currentGemLevel()]);

  private _money = signal(0);
  money = this._money.asReadonly();

  private _health = signal(this.gemDefs[0].maxHealth);
  health = this._health.asReadonly();

  maxHealth = computed(() => this.currentGem().maxHealth);

  private _autoClickerUnlocked = signal(false);
  autoClickerUnlocked = this._autoClickerUnlocked.asReadonly();

  private generatorDefs: GeneratorDef[] = [
    { id: 'miner', name: 'Mineur', baseCost: 15, costMultiplier: 1.15, cps: 0.1 },
    { id: 'drone', name: 'Drone', baseCost: 100, costMultiplier: 1.15, cps: 1 },
    { id: 'factory', name: 'Usine', baseCost: 1100, costMultiplier: 1.15, cps: 8 },
  ];

  private upgradeDefs: UpgradeDef[] = [
    {
      id: 'finger-1',
      name: 'Doigt musclé',
      description: '+1 par clic',
      baseCost: 50,
      costMultiplier: 2.5,
      clickBonus: 1,
    },
    {
      id: 'finger-2',
      name: 'Gant turbo',
      description: '+5 par clic',
      baseCost: 500,
      costMultiplier: 2.5,
      clickBonus: 5,
    },
    {
      id: 'finger-3',
      name: 'Marteau lourd',
      description: '+25 par clic',
      baseCost: 5000,
      costMultiplier: 2.5,
      clickBonus: 25,
    },
    {
      id: 'finger-4',
      name: 'Poing de titan',
      description: '+100 par clic',
      baseCost: 50_000,
      costMultiplier: 2.5,
      clickBonus: 100,
    },
    {
      id: 'efficiency',
      name: 'Efficacité',
      description: '+10% cps global',
      baseCost: 750,
      costMultiplier: 3,
      cpsBonus: 0.1,
    },
    {
      id: 'auto-clicker',
      name: 'Auto-cliqueur',
      description: 'Clique automatiquement 1 fois/s',
      baseCost: 2000,
      costMultiplier: 1e9,
      unlockAutoClicker: true,
    },
  ];

  private _generators = signal<Owned<GeneratorDef>[]>(
    this.generatorDefs.map((g) => ({
      ...g,
      quantity: 0,
      nextCost: g.baseCost,
    })),
  );
  generators = this._generators.asReadonly();

  private _upgrades = signal<Owned<UpgradeDef>[]>(
    this.upgradeDefs.map((u) => ({
      ...u,
      quantity: 0,
      nextCost: u.baseCost,
    })),
  );
  upgrades = this._upgrades.asReadonly();

  // Clic = 1 de base + upgrades, indépendant du joyau
  perClick = computed(() => {
    const add = this._upgrades().reduce(
      (sum, u) => sum + (u.clickBonus ?? 0) * u.quantity,
      0,
    );
    return 1 + add;
  });

  cps = computed(() => {
    const base = this._generators().reduce(
      (sum, g) => sum + g.cps * g.quantity,
      0,
    );
    const mult = this._upgrades().reduce(
      (m, u) => m * (u.cpsBonus ? 1 + u.cpsBonus * u.quantity : 1),
      1,
    );
    return base * mult;
  });

  // Regen affichée dans le HUD (par seconde)
  healthRegen = computed(() => {
    const level = this._currentGemLevel();
    const base = this.currentGem().maxHealth;

    // Ruby = pas de regen, facile à tuer pour la démo
    if (level === 0) {
      return 0;
    }

    const regenRate = 0.15; // 15% / sec pour les autres
    return base * regenRate;
  });

  constructor() {
    this.load();

    effect(() => {
      this.save();
    });

    if (this._autoClickerUnlocked()) {
      this.startAutoClicker();
    }
  }

  start() {
    if (this.tickHandle) return;
    const stepMs = 200; // 5 ticks / sec

    this.tickHandle = setInterval(() => {
      // Production passive
      const income = this.cps() * (stepMs / 1000);
      if (income > 0) {
        this._money.update((m) => m + income);
      }

      // Regen de vie côté logique
      const level = this._currentGemLevel();
      let regenRate = 0;

      if (level > 0) {
        regenRate = 0.15;
      }

      if (regenRate > 0) {
        const regenAmount =
          this.currentGem().maxHealth * regenRate * (stepMs / 1000);

        this._health.update((h) =>
          Math.min(this.currentGem().maxHealth, h + regenAmount),
        );
      }
    }, stepMs);
  }

  stop() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.stopAutoClicker();
  }

  click(comboMultiplier: number = 1.0) {
    const damage = this.perClick() * comboMultiplier;

    this._health.update((h) => {
      const newHealth = h - damage;

      // Gem détruit → on passe au suivant si possible
      if (newHealth <= 0) {
        const currentLevel = this._currentGemLevel();
        if (currentLevel < this.gemDefs.length - 1) {
          const nextLevel = currentLevel + 1;
          this._currentGemLevel.set(nextLevel);
          return this.gemDefs[nextLevel].maxHealth;
        }
        // Dernier gem : reste à 0
        return 0;
      }

      return Math.max(0, newHealth);
    });

    this._money.update((m) => m + damage);
  }

  buyGenerator(id: string) {
    const gens = this._generators();
    const idx = gens.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const g = gens[idx];
    if (this._money() < g.nextCost) return;

    this._money.update((m) => m - g.nextCost);
    const newQty = g.quantity + 1;

    const updated: Owned<GeneratorDef> = {
      ...g,
      quantity: newQty,
      nextCost: this.computeCost(g.baseCost, g.costMultiplier, newQty),
    };

    const newList = [...gens];
    newList[idx] = updated;
    this._generators.set(newList);
  }

  buyUpgrade(id: string) {
    const ups = this._upgrades();
    const idx = ups.findIndex((u) => u.id === id);
    if (idx < 0) return;
    const u = ups[idx];

    if (u.unlockAutoClicker && u.quantity >= 1) return;
    if (this._money() < u.nextCost) return;

    this._money.update((m) => m - u.nextCost);
    const newQty = u.quantity + 1;

    const updated: Owned<UpgradeDef> = {
      ...u,
      quantity: newQty,
      nextCost: this.computeCost(u.baseCost, u.costMultiplier, newQty),
    };

    const newList = [...ups];
    newList[idx] = updated;
    this._upgrades.set(newList);

    if (u.unlockAutoClicker) {
      this._autoClickerUnlocked.set(true);
      this.startAutoClicker();
    }
  }

  reset() {
    this._money.set(0);
    this._currentGemLevel.set(0);
    this._health.set(this.gemDefs[0].maxHealth);

    this._generators.set(
      this.generatorDefs.map((g) => ({
        ...g,
        quantity: 0,
        nextCost: g.baseCost,
      })),
    );

    this._upgrades.set(
      this.upgradeDefs.map((u) => ({
        ...u,
        quantity: 0,
        nextCost: u.baseCost,
      })),
    );

    this._autoClickerUnlocked.set(false);
    this.stopAutoClicker();
    this.save();
  }

  private computeCost(base: number, mult: number, quantity: number): number {
    return Math.floor(base * Math.pow(mult, quantity));
  }

  private save() {
    const data: SaveShape = {
      money: this._money(),
      health: this._health(),
      gemLevel: this._currentGemLevel(),
      generators: this._generators().map((g) => ({
        id: g.id,
        quantity: g.quantity,
      })),
      upgrades: this._upgrades().map((u) => ({
        id: u.id,
        quantity: u.quantity,
      })),
      auto: this._autoClickerUnlocked(),
    };

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // osef
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as SaveShape;

      if (typeof data.money === 'number') this._money.set(data.money);
      if (typeof data.health === 'number') this._health.set(data.health);
      if (typeof data.gemLevel === 'number') {
        const lvl = Math.min(
          Math.max(0, data.gemLevel),
          this.gemDefs.length - 1,
        );
        this._currentGemLevel.set(lvl);
      }

      if (Array.isArray(data.generators)) {
        const map = new Map<string, number>(
          data.generators.map((g) => [g.id, g.quantity]),
        );
        this._generators.set(
          this.generatorDefs.map((g) => {
            const qty = map.get(g.id) ?? 0;
            return {
              ...g,
              quantity: qty,
              nextCost: this.computeCost(g.baseCost, g.costMultiplier, qty),
            };
          }),
        );
      }

      if (Array.isArray(data.upgrades)) {
        const map = new Map<string, number>(
          data.upgrades.map((u) => [u.id, u.quantity]),
        );
        this._upgrades.set(
          this.upgradeDefs.map((u) => {
            const qty = map.get(u.id) ?? 0;
            return {
              ...u,
              quantity: qty,
              nextCost: this.computeCost(u.baseCost, u.costMultiplier, qty),
            };
          }),
        );
      }

      if (typeof data.auto === 'boolean') {
        this._autoClickerUnlocked.set(data.auto);
      }
    } catch {
      // ignore
    }
  }

  formatNumber(n: number): string {
    if (!isFinite(n)) return '0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    const units = [
      { v: 1e12, s: 'T' },
      { v: 1e9, s: 'G' },
      { v: 1e6, s: 'M' },
      { v: 1e3, s: 'k' },
    ];
    for (const u of units) {
      if (abs >= u.v) return `${sign}${(abs / u.v).toFixed(1)}${u.s}`;
    }
    return `${sign}${abs.toFixed(0)}`;
  }

  private startAutoClicker() {
    if (this.tickAutoHandle) return;
    this.tickAutoHandle = setInterval(() => {
      this.click();
    }, 1000);
  }

  private stopAutoClicker() {
    if (this.tickAutoHandle) {
      clearInterval(this.tickAutoHandle);
      this.tickAutoHandle = null;
    }
  }
}
