import { Injectable, signal, computed, effect } from '@angular/core';

type SaveShape = {
  money: number;
  health: number;
  generators: { id: string; quantity: number }[];
  upgrades: { id: string; quantity: number }[];
  auto?: boolean;
};

export interface GeneratorDef {
  id: string;
  name: string;
  baseCost: number;
  costMultiplier: number; // e.g. 1.15
  cps: number; // production par élément
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costMultiplier: number; // e.g. 2.5
  clickBonus?: number; // +X par clic (par achat)
  cpsBonus?: number; // +X% cps global (par achat, multiplicatif)
  unlockAutoClicker?: boolean; // achat unique qui active l'auto-cliqueur
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

  // Gem progression system
  private gemDefs = [
    { name: 'Ruby',    image: 'Ruby.png',    baseClick: 1,   maxHealth: 50,         color: '#ff4561' },
    { name: 'Topaz',   image: 'Topaz.png',   baseClick: 5,   maxHealth: 10000,      color: '#ffa726' },
    { name: 'Emerald', image: 'Emrald.png',  baseClick: 25,  maxHealth: 100000,     color: '#66bb6a' },
    { name: 'Sapphire',image: 'Sapphire.png',baseClick: 125, maxHealth: 1000000,    color: '#42a5f5' },
    { name: 'Diamond', image: 'Diamond.png', baseClick: 625, maxHealth: 10000000,   color: '#e0e0e0' },
  ];

  private _currentGemLevel = signal(0); // 0 = Ruby, 1 = Topaz, etc.
  currentGemLevel = this._currentGemLevel.asReadonly();

  currentGem = computed(() => this.gemDefs[this._currentGemLevel()]);

  // Données réactives
  private _money = signal(0);
  money = this._money.asReadonly();

  // Santé initiale alignée sur le premier gem (Ruby)
  private _health = signal(this.gemDefs[0].maxHealth);
  health = this._health.asReadonly();

  maxHealth = computed(() => this.currentGem().maxHealth);

  private _autoClickerUnlocked = signal(false);
  autoClickerUnlocked = this._autoClickerUnlocked.asReadonly();

  private generatorDefs: GeneratorDef[] = [
    { id: 'miner',   name: 'Mineur',  baseCost: 15,   costMultiplier: 1.15, cps: 0.1 },
    { id: 'drone',   name: 'Drone',   baseCost: 100,  costMultiplier: 1.15, cps: 1 },
    { id: 'factory', name: 'Usine',   baseCost: 1100, costMultiplier: 1.15, cps: 8 },
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
      baseCost: 50000,
      costMultiplier: 2.5,
      clickBonus: 100,
    },
    {
      id: 'efficiency',
      name: 'Efficacité',
      description: '+10% cps global',
      baseCost: 750,
      costMultiplier: 3,
      cpsBonus: 0.10,
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
    }))
  );
  generators = this._generators.asReadonly();

  private _upgrades = signal<Owned<UpgradeDef>[]>(
    this.upgradeDefs.map((u) => ({
      ...u,
      quantity: 0,
      nextCost: u.baseCost,
    }))
  );
  upgrades = this._upgrades.asReadonly();

  // Calculs dérivés
  perClick = computed(() => {
    const gemBase = this.currentGem().baseClick;
    const add = this._upgrades().reduce(
      (sum, u) => sum + (u.clickBonus ?? 0) * u.quantity,
      0,
    );
    return gemBase + add;
  });

  cps = computed(() => {
    const base = this._generators().reduce(
      (sum, g) => sum + g.cps * g.quantity,
      0,
    );
    const mult = this._upgrades().reduce((m, u) => {
      return m * (u.cpsBonus ? 1 + u.cpsBonus * u.quantity : 1);
    }, 1);
    return base * mult;
  });

  // Health regeneration per second (0% for Ruby, 15% pour les suivants)
  healthRegen = computed(() => {
    const level = this._currentGemLevel();
    const base = this.currentGem().maxHealth;

    // Premier joyau : pas de régén pour le tutoriel
    if (level === 0) {
      return 0;
    }

    const regenRate = 0.15; // 15% par seconde pour les autres
    return base * regenRate;
  });

  constructor() {
    // Charger une éventuelle sauvegarde
    this.load();

    // Sauvegarde automatique sur toute modification des signaux
    effect(() => {
      this.save();
    });

    // Si l'autoclicker était déjà déverrouillé, on le démarre
    if (this._autoClickerUnlocked()) {
      this.startAutoClicker();
    }
  }

  start() {
    if (this.tickHandle) return;
    const stepMs = 200; // tick 5x/sec pour plus de fluidité

    this.tickHandle = setInterval(() => {
      // Income generation
      const income = this.cps() * (stepMs / 1000);
      if (income > 0) {
        this._money.update((m) => m + income);
      }

      // Health regeneration
      const level = this._currentGemLevel();

      // Premier joyau : pas de régén => facile à "tuer" pour le tuto
      let regenRate = 0;
      if (level > 0) {
        regenRate = 0.15; // 15%/sec pour les joyaux suivants
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

      // Si le gem est détruit et qu'il en reste un suivant, on progresse
      if (newHealth <= 0 && this._currentGemLevel() < this.gemDefs.length - 1) {
        this._currentGemLevel.update((level) => level + 1);
        // Santé du nouveau gem
        return this.currentGem().maxHealth;
      }

      return Math.max(0, newHealth);
    });

    // Gain d'éclats = dégâts infligés
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

    // achat unique pour auto-cliqueur
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
    const data: SaveShape & { gemLevel: number } = {
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
      // ignore
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as any;

      if (typeof data.gemLevel === 'number') {
        this._currentGemLevel.set(data.gemLevel);
      }

      if (typeof data.money === 'number') {
        this._money.set(data.money);
      }

      if (typeof data.health === 'number') {
        this._health.set(data.health);
      } else {
        // fallback au maxHealth du gem courant
        this._health.set(this.currentGem().maxHealth);
      }

      if (Array.isArray(data.generators)) {
        const map = new Map<string, number>(
          data.generators.map((g: any) => [g.id, g.quantity]),
        );
        this._generators.set(
          this.generatorDefs.map((g) => {
            const qty = map.get(g.id) ?? 0;
            return {
              ...g,
              quantity: qty as number,
              nextCost: this.computeCost(g.baseCost, g.costMultiplier, qty),
            };
          }),
        );
      }

      if (Array.isArray(data.upgrades)) {
        const map = new Map<string, number>(
          data.upgrades.map((u: any) => [u.id, u.quantity]),
        );
        this._upgrades.set(
          this.upgradeDefs.map((u) => {
            const qty = map.get(u.id) ?? 0;
            return {
              ...u,
              quantity: qty as number,
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

  // Format court style 1.2K, 3.4M
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
