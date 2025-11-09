import {
  Component,
  OnDestroy,
  OnInit,
  AfterViewInit,
  ElementRef,
  ViewChild,
  signal,
  effect,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from './services/game.service';
import { gsap } from 'gsap';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None,
})
export class App implements OnInit, OnDestroy, AfterViewInit {
  protected readonly title = signal('Idle Clicker');

  @ViewChild('clickButton', { static: true })
  clickButton!: ElementRef<HTMLButtonElement>;

  @ViewChild('fxLayer', { static: true })
  fxLayer!: ElementRef<HTMLDivElement>;
  
  @ViewChild('trapezoidLayer', { static: true })
  trapezoidLayer!: ElementRef<HTMLDivElement>;

  private lastMoney = 0;
  private moneyWatcherId: any;
  private sparkleIntervalId: any;

  // Combo system
  protected combo = signal(0);
  protected comboTimeProgress = signal(0); // Percentage of progress in current tier
  private lastClickTime = 0;
  private comboTimeoutId: any;
  private comboProgressInterval: any;
  private lastTier = 0; // Track tier changes
  private readonly COMBO_WINDOW = 1500; // ms - time window to maintain combo
  private readonly BASE_TRAPEZOIDS = 4; // minimum trapezoids
  private currentTrapCount = 4;

  // Exposition vers le template
  get health() {
    return this.game.health;
  }
  get maxHealth() {
    return this.game.maxHealth;
  }
  get currentGem() {
    return this.game.currentGem;
  }
  get gemColor() {
    return this.game.currentGem().color;
  }
  get money() {
    return this.game.money;
  }
  get perClick() {
    return this.game.perClick;
  }
  get cps() {
    return this.game.cps;
  }
  get healthRegen() {
    return this.game.healthRegen;
  }
  get generators() {
    return this.game.generators;
  }
  get upgrades() {
    return this.game.upgrades;
  }
  get autoClickerUnlocked() {
    return this.game.autoClickerUnlocked;
  }

  fmt = (v: number) => this.game.formatNumber(v);
  
  // Expose Math for template
  Math = Math;

  // Helper methods for combo bars
  getTierForCombo(combo: number): number {
    if (combo < 10) return 0;  // Tier 0: 0-9
    if (combo < 25) return 1;  // Tier 1: 10-24
    if (combo < 50) return 2;  // Tier 2: 25-49
    if (combo < 85) return 3;  // Tier 3: 50-84
    return 4;                  // Tier 4: 85+
  }

  // Get progress within current tier (0-100%)
  getProgressInTier(combo: number): number {
    const tier = this.getTierForCombo(combo);
    const ranges = [
      { min: 0, max: 10 },    // tier 0: 0-9
      { min: 10, max: 25 },   // tier 1: 10-24
      { min: 25, max: 50 },   // tier 2: 25-49
      { min: 50, max: 85 },   // tier 3: 50-84
      { min: 85, max: 150 },  // tier 4: 85+ (infinite tier, capped for progress calc)
    ];

    const range = ranges[tier];
    const comboInTier = Math.min(combo - range.min, range.max - range.min);
    const tierSize = range.max - range.min;
    
    return (comboInTier / tierSize) * 100;
  }

  // Get the displayed tier (uses lastTier during transitions)
  getDisplayedTier(): number {
    return this.lastTier;
  }

  // Get the displayed multiplier text
  getDisplayedMultiplier(): string {
    const multipliers = ['x1.0', 'x1.5', 'x2.0', 'x2.5', 'x3.0 MAX'];
    return multipliers[this.lastTier] || 'x1.0';
  }

  constructor(private game: GameService) {
    // Watch for combo changes and update trapezoids only when count changes
    effect(() => {
      const currentCombo = this.combo();
      const trapCount = this.getTrapezoidCount();
      
      // Only update if trapezoid count actually changed
      if (trapCount !== this.currentTrapCount) {
        this.updateTrapezoids();
      }
    });
  }

  ngOnInit(): void {
    this.game.start();
    this.lastMoney = this.game.money();

    // surveille l'augmentation des éclats (clic + auto-farm)
    this.moneyWatcherId = setInterval(() => {
      this.checkMoneyDelta();
    }, 100);
  }

  ngAfterViewInit(): void {
    const btn = this.clickButton.nativeElement;

    // état initial du bouton : hors écran, un peu plus petit
    gsap.set(btn, {
      opacity: 0,
      y: -150,
      scale: 0.9,
    });

    // apparition verticale
    gsap.to(btn, {
      y: 0,
      opacity: 1,
      scale: 1,
      duration: 1.2,
      ease: 'power2.out',
      delay: 0.2,
      onComplete: () => {
        // empêcher le drag de l'image mascotte (sécurité multi-navigateurs)
        try {
          const gem = btn.querySelector('.mascot') as HTMLElement | null;
          if (gem) {
            gem.setAttribute('draggable', 'false');
            gem.addEventListener('dragstart', (e) => e.preventDefault());
          }
        } catch (e) {
          // noop
        }

        // démarrer les sparkles
        this.startSparkles();
        // créer les trapèzes initiaux
        try {
          this.updateTrapezoids();
        } catch (e) {
          // noop
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.game.stop();
    if (this.moneyWatcherId) {
      clearInterval(this.moneyWatcherId);
    }
    if (this.sparkleIntervalId) {
      clearInterval(this.sparkleIntervalId);
    }
    if (this.comboTimeoutId) {
      clearTimeout(this.comboTimeoutId);
    }
    if (this.comboProgressInterval) {
      clearInterval(this.comboProgressInterval);
    }
  }

  click(): void {
    // Combo system: track clicks and increase combo
    const now = Date.now();
    const previousCombo = this.combo();
    
    // Always increment combo (unless at 0, then start at 1)
    if (previousCombo === 0) {
      this.combo.set(1);
    } else {
      this.combo.update(c => c + 1);
    }
    
    const currentCombo = this.combo();
    this.lastClickTime = now;

    // Check if we changed tier (went up)
    const currentTier = this.getTierForCombo(currentCombo);
    const previousTier = this.getTierForCombo(previousCombo);
    
    // Use previous tier for multiplier calculation (before tier up visual)
    let effectiveTier = previousTier;
    
    if (currentTier > previousTier) {
      // Show bar at 100% for a brief moment before tier up
      this.comboTimeProgress.set(100);
      
      // After a short delay, move to new tier and reset bar
      setTimeout(() => {
        this.lastTier = currentTier;
        const tierProgress = this.getProgressInTier(currentCombo);
        this.comboTimeProgress.set(tierProgress);
      }, 150); // 150ms delay to show full bar
    } else {
      // Calculate actual progress in current tier (0-100% based on combo position in tier range)
      const tierProgress = this.getProgressInTier(currentCombo);
      this.comboTimeProgress.set(tierProgress);
      effectiveTier = currentTier;
    }
    
    // Reset combo timeout and progress interval
    if (this.comboTimeoutId) {
      clearTimeout(this.comboTimeoutId);
    }
    if (this.comboProgressInterval) {
      clearInterval(this.comboProgressInterval);
    }
    
    // Start continuous drain
    this.startComboDrain();

    // Calculate combo multiplier based on effective tier (previous tier during transition)
    const multiplier = this.getTierMultiplier(effectiveTier);
    
    // Apply combo multiplier to damage
    this.game.click(multiplier);

    // Trapezoids are now updated automatically by the effect() in constructor

    const btnElem = this.clickButton.nativeElement as HTMLElement;
    const gem = btnElem.querySelector('.mascot') as HTMLElement | null;
    const crack = btnElem.querySelector('.mascot.crack') as HTMLElement | null;
    if (gem) {
      // évite l'empilement de tweens et assure un comportement prédictible
      gsap.killTweensOf(gem);
      gsap.fromTo(
        gem,
        { scale: 1 },
        {
          scale: 1.05,
          duration: 0.08,
          yoyo: true,
          repeat: 1,
          ease: 'power1.out',
          overwrite: 'auto',
        }
      );
    }
    if (crack) {
      // évite l'empilement de tweens et assure un comportement prédictible
      gsap.killTweensOf(crack);
      gsap.fromTo(
        crack,
        { scale: 1 },
        {         
          scale: 1.05,
          duration: 0.08,
          yoyo: true,
          repeat: 1,
          ease: 'power1.out',
          overwrite: 'auto',
        }
      );
    }
    // shards = gérés par l’augmentation de money, pas par le clic directement
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
      this.lastMoney = this.game.money();
    }
  }

  // ---------- SURVEILLANCE DES ÉCLATS ----------

  private checkMoneyDelta(): void {
    const current = this.game.money();

    const prevInt = Math.floor(this.lastMoney);
    const currInt = Math.floor(current);

    if (currInt > prevInt) {
      const delta = currInt - prevInt;
      const count = Math.min(delta, 10);

      for (let i = 0; i < count; i++) {
        this.spawnShards();
      }
    }

    this.lastMoney = current;
  }

  // ---------- FX : SHARDS ----------

  private spawnShards(): void {
    if (!this.fxLayer || !this.clickButton) return;

    const layer = this.fxLayer.nativeElement;
    const btn = this.clickButton.nativeElement;

    const layerRect = layer.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    const centerX = btnRect.left + btnRect.width / 2 - layerRect.left;
    const centerY = btnRect.top + btnRect.height / 2 - layerRect.top;
    const radius = btnRect.width / 2;

    const shard = document.createElement('div');
    shard.classList.add('shard');
    
    // Apply gem color to shard
    const gemColor = this.game.currentGem().color;
    const lighterColor = this.lightenColor(gemColor, 40);
    const darkerColor = this.darkenColor(gemColor, 30);
    shard.style.background = `linear-gradient(135deg, ${lighterColor} 0%, ${gemColor} 45%, ${darkerColor} 100%)`;
    shard.style.boxShadow = `0 6px 18px ${gemColor}48, 0 0 26px ${gemColor}38`;
    
    layer.appendChild(shard);

    const angleDeg = this.randomRange(0, 360);
    const angleRad = (angleDeg * Math.PI) / 180;

    const startX = centerX + Math.cos(angleRad) * radius;
    const startY = centerY + Math.sin(angleRad) * radius;

    const distance = this.randomRange(60, 130);
    const targetX = centerX + Math.cos(angleRad) * (radius + distance);
    const targetY = centerY + Math.sin(angleRad) * (radius + distance);

    const startScale = this.randomRange(0.8, 1.1);
    const endScale = this.randomRange(1.1, 1.6);

    gsap.set(shard, {
      x: startX,
      y: startY,
      scale: startScale,
      opacity: 1,
      rotate: this.randomRange(-30, 30),
    });

    gsap.to(shard, {
      duration: this.randomRange(0.55, 0.85),
      x: targetX,
      y: targetY,
      scale: endScale,
      opacity: 0,
      rotate: this.randomRange(-180, 180),
      ease: 'power2.out',
      onComplete: () => shard.remove(),
    });
  }

  // Helper functions to adjust colors
  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + Math.floor(255 * percent / 100));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.floor(255 * percent / 100));
    const b = Math.min(255, (num & 0xff) + Math.floor(255 * percent / 100));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - Math.floor(255 * percent / 100));
    const g = Math.max(0, ((num >> 8) & 0xff) - Math.floor(255 * percent / 100));
    const b = Math.max(0, (num & 0xff) - Math.floor(255 * percent / 100));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  // ---------- FX : SPARKLES (ÉTOILES SUR LE JOYAU) ----------

  private startSparkles(): void {
    if (this.sparkleIntervalId) return;

    this.sparkleIntervalId = setInterval(() => {
      this.spawnSparkle();
    }, 300); // Doubled frequency (was 600ms, now 300ms)
  }

  private spawnSparkle(): void {
    if (!this.fxLayer || !this.clickButton) return;

    const layer = this.fxLayer.nativeElement;
    const btn = this.clickButton.nativeElement;

    const layerRect = layer.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    const centerX = btnRect.left + btnRect.width / 2 - layerRect.left;
    const centerY = btnRect.top + btnRect.height / 2 - layerRect.top;
    const radius = btnRect.width / 2;

    const sparkle = document.createElement('div');
    sparkle.classList.add('sparkle');
    layer.appendChild(sparkle);

    // Position aléatoire À L’INTÉRIEUR du joyau
    const angleDeg = this.randomRange(0, 360);
    const angleRad = (angleDeg * Math.PI) / 180;
    const innerRadius = radius * this.randomRange(0.1, 0.7);

    const x = centerX + Math.cos(angleRad) * innerRadius;
    const y = centerY + Math.sin(angleRad) * innerRadius;

    const startScale = this.randomRange(0.4, 0.7);
    const midScale = this.randomRange(0.9, 1.3);

    gsap.set(sparkle, {
      x,
      y,
      scale: startScale,
      opacity: 0,
      rotate: this.randomRange(0, 360),
    });

    gsap.to(sparkle, {
      duration: 0.22,
      scale: midScale,
      opacity: 1,
      ease: 'power2.out',
    });

    gsap.to(sparkle, {
      duration: 0.3,
      scale: startScale * 0.6,
      opacity: 0,
      ease: 'power1.in',
      delay: 0.22,
      onComplete: () => sparkle.remove(),
    });
  }

  // Combo helper methods
  private getComboMultiplier(): number {
    const c = this.combo();
    if (c < 10) return 1.0;  // Tier 0: x1.0
    if (c < 25) return 1.5;  // Tier 1: x1.5
    if (c < 50) return 2.0;  // Tier 2: x2.0
    if (c < 85) return 2.5;  // Tier 3: x2.5
    return 3.0;              // Tier 4: x3.0
  }

  private getTierMultiplier(tier: number): number {
    const multipliers = [1.0, 1.5, 2.0, 2.5, 3.0];
    return multipliers[tier] || 3.0;
  }

  private getTrapezoidCount(): number {
    // Trapezoids increase gradually with combo count
    const c = this.combo();
    const gemLevel = this.game.currentGemLevel(); // 0-4 (Ruby to Diamond)
    
    // Base count: start at 4, add 1 every 5 combos
    const baseCount = 4 + Math.floor(c / 5);
    
    // Multiply by 1.5 for each gem level (1.0x, 1.5x, 2.25x, 3.375x, 5.0625x)
    const multiplier = Math.pow(1.5, gemLevel);
    const scaledCount = Math.floor(baseCount * multiplier);
    
    // Cap at reasonable maximum to avoid performance issues
    return Math.min(scaledCount, 100);
  }

  private updateTrapezoids(): void {
    if (!this.trapezoidLayer || !this.clickButton) return;
    
    const targetCount = this.getTrapezoidCount();
    const layer = this.trapezoidLayer.nativeElement;
    const currentCount = layer.querySelectorAll('.trapezoid').length;
    
    // Add new trapezoids if we need more
    if (targetCount > currentCount) {
      for (let i = currentCount; i < targetCount; i++) {
        this.createSingleTrapezoid(i, targetCount);
      }
    }
    // Remove excess trapezoids if we need less
    else if (targetCount < currentCount) {
      const trapezoids = layer.querySelectorAll('.trapezoid');
      for (let i = targetCount; i < currentCount; i++) {
        const trapToRemove = trapezoids[i];
        if (trapToRemove) {
          gsap.to(trapToRemove, {
            opacity: 0,
            scale: 0.5,
            duration: 0.3,
            onComplete: () => trapToRemove.remove()
          });
        }
      }
    }
    
    this.currentTrapCount = targetCount;
  }

  // Create a single trapezoid
  private createSingleTrapezoid(index: number, totalCount: number): void {
    if (!this.trapezoidLayer || !this.clickButton) return;
    const layer = this.trapezoidLayer.nativeElement;
    
    const el = document.createElement('div');
    el.classList.add('trapezoid');

    // random size and position - ensure they all extend outside the ruby
    const w = this.randomRange(40, 120); // percent width
    const h = this.randomRange(140, 320); // percent height - very tall to extend far beyond ruby
    
    // Position trapezoids randomly around the ruby in a full circle
    // Use completely random angle for better distribution
    const angle = this.randomRange(0, 360); // fully random angle for even distribution
    const distance = this.randomRange(15, 45); // distance from center in px
    const leftOffset = Math.cos(angle * Math.PI / 180) * distance;
    const topOffset = Math.sin(angle * Math.PI / 180) * distance;
    
    // Make each trapezoid point outward from its position (align rotation with angle)
    // The trapezoid shape in CSS points downward by default, so subtract 90° to make it point right at 0°
    const rot = angle - 90 + this.randomRange(-15, 15); // rotation matches position angle + slight variation
    const dur = `${this.randomRange(5, 16).toFixed(2)}s`;
    
    // Opacity increases with tier (more visible at higher combos)
    const tier = this.getTierForCombo(this.combo());
    const baseOpacity = [45, 55, 65, 75, 80][tier] || 45; // opacity increases per tier (max 80)
    const opacity = (this.randomRange(baseOpacity, Math.min(95, baseOpacity + 15)) / 100).toFixed(2);

    el.style.setProperty('--tr-w', `${w}%`);
    el.style.setProperty('--tr-h', `${h}%`);
    el.style.setProperty('--tr-rot', `${rot}deg`);
    el.style.setProperty('--tr-dur', dur);
    el.style.setProperty('--tr-opacity', `${opacity}`);
    el.style.setProperty('--tr-left', `calc(50% + ${leftOffset}px)`);
    el.style.setProperty('--tr-top', `calc(40% + ${topOffset}px)`);
    el.style.setProperty('--tr-z', `${Math.floor(this.randomRange(-5, 5))}`); // behind ruby (ruby has z-index: 1)

    layer.appendChild(el);

    // Gentle entrance animation for new trapezoids
    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.7 },
      { opacity: parseFloat(opacity), scale: 1, duration: 0.4, ease: 'power2.out' }
    );
  }

  // create multiple trapezoid accents with random sizes and directions (used for initial setup only)
  private createTrapezoids(count = 4): void {
    if (!this.trapezoidLayer || !this.clickButton) return;
    const layer = this.trapezoidLayer.nativeElement;
    // clear existing
    layer.innerHTML = '';

    // Create all initial trapezoids without animation
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.classList.add('trapezoid');

      // random size and position - ensure they all extend outside the ruby
      const w = this.randomRange(40, 120); // percent width
      const h = this.randomRange(140, 320); // percent height - very tall to extend far beyond ruby
      
      // Position trapezoids around the ruby perimeter, not just center
      // Use polar coordinates to spread them in a circle around the ruby
      const angle = (i / count) * 360 + this.randomRange(-25, 25); // evenly spaced + randomness
      const distance = this.randomRange(15, 45); // distance from center in px
      const leftOffset = Math.cos(angle * Math.PI / 180) * distance;
      const topOffset = Math.sin(angle * Math.PI / 180) * distance;
      
      // Make each trapezoid point outward from its position (align rotation with angle)
      // The trapezoid shape in CSS points downward by default, so subtract 90° to make it point right at 0°
      const rot = angle - 90 + this.randomRange(-15, 15); // rotation matches position angle + slight variation
      const dur = `${this.randomRange(5, 16).toFixed(2)}s`;
      
      // Opacity increases with tier (more visible at higher combos)
      const tier = this.getTierForCombo(this.combo());
      const baseOpacity = [45, 55, 65, 75, 80][tier] || 45; // opacity increases per tier (max 80)
      const opacity = (this.randomRange(baseOpacity, Math.min(95, baseOpacity + 15)) / 100).toFixed(2);

      el.style.setProperty('--tr-w', `${w}%`);
      el.style.setProperty('--tr-h', `${h}%`);
      el.style.setProperty('--tr-rot', `${rot}deg`);
      el.style.setProperty('--tr-dur', dur);
      el.style.setProperty('--tr-opacity', `${opacity}`);
      el.style.setProperty('--tr-left', `calc(50% + ${leftOffset}px)`);
      el.style.setProperty('--tr-top', `calc(40% + ${topOffset}px)`);
      el.style.setProperty('--tr-z', `${Math.floor(this.randomRange(-5, 5))}`); // behind ruby (ruby has z-index: 1)

      layer.appendChild(el);

      // Set initial state immediately (no entrance animation for initial setup)
      gsap.set(el, {
        opacity: parseFloat(opacity),
        scale: 1
      });
    }
    
    this.currentTrapCount = count;
  }

  // ---------- COMBO DRAIN SYSTEM ----------

  private startComboDrain(): void {
    const startTime = Date.now();
    const startCombo = this.combo();
    
    if (startCombo === 0) {
      return; // Nothing to drain
    }
    
    const currentTier = this.getTierForCombo(startCombo);
    
    // Time to lose 1 combo point (faster drain = harder to maintain)
    const drainRates = [400, 300, 220, 160, 160]; // ms per combo point lost (tier 4 same as tier 3)
    const drainRate = drainRates[currentTier] || 160;
    
    this.comboProgressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const combosLost = Math.floor(elapsed / drainRate);
      const newCombo = Math.max(0, startCombo - combosLost);
      
      if (newCombo !== this.combo()) {
        this.combo.set(newCombo);
        
        // Update lastTier to reflect the new tier
        const newTier = this.getTierForCombo(newCombo);
        this.lastTier = newTier;
        
        // Update progress bar to reflect new combo position
        const tierProgress = this.getProgressInTier(newCombo);
        this.comboTimeProgress.set(tierProgress);
        
        // Trapezoids are now updated automatically by the effect() in constructor
        
        if (newCombo === 0) {
          // Combo fully depleted
          clearInterval(this.comboProgressInterval);
          this.comboTimeProgress.set(0);
          this.lastTier = 0;
          return;
        }
      } else {
        // Only interpolate if we're still on the same combo (not during click)
        const currentComboValue = this.combo();
        const nextCombo = Math.max(0, currentComboValue - 1);
        
        // Check if we're about to change tier
        const currentTierCheck = this.getTierForCombo(currentComboValue);
        const nextTierCheck = this.getTierForCombo(nextCombo);
        
        if (currentTierCheck === nextTierCheck) {
          // Same tier, safe to interpolate
          const partialProgress = (elapsed % drainRate) / drainRate;
          const currentComboProgress = this.getProgressInTier(currentComboValue);
          const nextComboProgress = this.getProgressInTier(nextCombo);
          const interpolatedProgress = currentComboProgress - (currentComboProgress - nextComboProgress) * partialProgress;
          this.comboTimeProgress.set(Math.max(0, interpolatedProgress));
        }
      }
      
    }, 16); // ~60fps
    
    // Timeout to ensure cleanup (30 seconds max)
    this.comboTimeoutId = setTimeout(() => {
      if (this.comboProgressInterval) {
        clearInterval(this.comboProgressInterval);
      }
    }, 30000);
  }

  // ---------- UTILITAIRES ----------

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
