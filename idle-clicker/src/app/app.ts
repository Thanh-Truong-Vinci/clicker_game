import { Component, computed, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from './services/game.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  template: `
  <main class="game">
    <header class="hud">
      <div class="brand">
        <div class="logo" aria-hidden="true">
          <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="g" x1="0" x2="1">
                <stop offset="0%" stop-color="#7C4DFF" />
                <stop offset="100%" stop-color="#00E5FF" />
              </linearGradient>
            </defs>
            <path fill="url(#g)" d="M32 3l7.8 15.8L57 21l-12.5 12 3 17-15.5-8.2L16.5 50l3-17L7 21l17.2-2.2L32 3z"/>
          </svg>
        </div>
        <h1>{{ title() }}</h1>
      </div>
      <div class="stats">
        <div class="stat"><span class="label">Éclats</span><span class="value">{{ fmt(money()) }}</span></div>
        <div class="stat" title="Par clic"><span class="label">/clic</span><span class="value">{{ fmt(perClick()) }}</span></div>
        <div class="stat" title="Par seconde"><span class="label">/sec</span><span class="value">{{ fmt(cps()) }}</span></div>
        @if (autoClickerUnlocked()) {
          <div class="stat" title="Auto-cliqueur actif"><span class="label">Auto</span><span class="value">ON</span></div>
        }
        <button class="ghost" (click)="reset()" aria-label="Réinitialiser">↺</button>
      </div>
    </header>

    <section class="play">
      <button class="big-button" (click)="click()" aria-label="Cliquer pour gagner des éclats">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="mascot">
          <defs>
            <radialGradient id="shine" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9" />
              <stop offset="60%" stop-color="#80DEEA" stop-opacity="0.35" />
              <stop offset="100%" stop-color="#7C4DFF" stop-opacity="0.6" />
            </radialGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="url(#shine)" />
          <path d="M60 18l10 20 22 3-16 15 4 22-20-10-20 10 4-22-16-15 22-3 10-20z" fill="#fff" opacity="0.95"/>
        </svg>
        <span>CLIC !</span>
      </button>
    </section>

    <section class="panels">
      <div class="panel">
        <h2>Générateurs</h2>
        <ul class="list">
          @for (g of generators(); track g.id) {
            <li>
              <div class="item-main">
                <div class="icon" aria-hidden="true">⚙️</div>
                <div class="meta">
                  <div class="name">{{ g.name }}</div>
                  <div class="desc">+{{ fmt(g.cps) }} / sec</div>
                </div>
              </div>
              <div class="item-actions">
                <div class="price">{{ fmt(g.nextCost) }}</div>
                <button (click)="buyGenerator(g.id)" [disabled]="money() < g.nextCost">Acheter</button>
                <div class="qty">x{{ g.quantity }}</div>
              </div>
            </li>
          }
        </ul>
      </div>

      <div class="panel">
        <h2>Améliorations</h2>
        <ul class="list">
          @for (u of upgrades(); track u.id) {
            <li>
              <div class="item-main">
                <div class="icon" aria-hidden="true">✨</div>
                <div class="meta">
                  <div class="name">{{ u.name }}</div>
                  <div class="desc">{{ u.description }}</div>
                </div>
              </div>
              <div class="item-actions">
                <div class="price">{{ fmt(u.nextCost) }}</div>
                <button (click)="buyUpgrade(u.id)" [disabled]="money() < u.nextCost || (u.id === 'auto-clicker' && u.quantity >= 1)">Acheter</button>
                <div class="qty">x{{ u.quantity }}</div>
              </div>
            </li>
          }
        </ul>
      </div>
    </section>

    <footer class="footer">
      <p>Projet démo — sauvegarde locale automatique. Aucune donnée personnelle.</p>
    </footer>
  </main>
  `,
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('Idle Clicker');

  // Exposition des signaux utiles à la vue (via getters pour éviter l’accès avant init)
  get money() { return this.game.money; }
  get perClick() { return this.game.perClick; }
  get cps() { return this.game.cps; } // unités par seconde
  get generators() { return this.game.generators; }
  get upgrades() { return this.game.upgrades; }
  get autoClickerUnlocked() { return this.game.autoClickerUnlocked; }

  // Formatage lisible des nombres
  fmt = (v: number) => this.game.formatNumber(v);

  constructor(private game: GameService) {}

  ngOnInit(): void {
    this.game.start();
  }

  ngOnDestroy(): void {
    this.game.stop();
  }

  click(): void {
    this.game.click();
  }

  buyGenerator(id: string): void {
    this.game.buyGenerator(id);
  }

  buyUpgrade(id: string): void {
    this.game.buyUpgrade(id);
  }

  reset(): void {
    if (confirm('Réinitialiser la partie ?')) {
      this.game.reset();
    }
  }
}
