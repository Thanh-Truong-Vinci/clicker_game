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

  @ViewChild('introOverlay', { static: true })
  introOverlay!: ElementRef<HTMLDivElement>;

  @ViewChild('resetDialog')
  resetDialog?: ElementRef<HTMLDivElement>;

  private lastMoney = 0;
  private moneyWatcherId: any;
  private sparkleIntervalId: any;

  // Combo system
  protected combo = signal(0);
  protected comboTimeProgress = signal(0);
  private lastClickTime = 0;
  private comboTimeoutId: any;
  private comboProgressInterval: any;
  private lastTier = 0;
  private readonly COMBO_WINDOW = 1500;
  private readonly BASE_TRAPEZOIDS = 4;
  private currentTrapCount = 4;

  protected showResetDialog = signal(false);

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

  Math = Math;

  getTierForCombo(combo: number): number {
    if (combo < 10) return 0;
    if (combo < 25) return 1;
    if (combo < 50) return 2;
    if (combo < 85) return 3;
    return 4;
  }

  getProgressInTier(combo: number): number {
    const tier = this.getTierForCombo(combo);
    const ranges = [
      { min: 0, max: 10 },
      { min: 10, max: 25 },
      { min: 25, max: 50 },
      { min: 50, max: 85 },
      { min: 85, max: 150 },
    ];

    const range = ranges[tier];
    const comboInTier = Math.min(combo - range.min, range.max - range.min);
    const tierSize = range.max - range.min;

    return (comboInTier / tierSize) * 100;
  }

  getDisplayedTier(): number {
    return this.lastTier;
  }

  getDisplayedMultiplier(): string {
    const multipliers = ['x1.0', 'x1.5', 'x2.0', 'x2.5', 'x3.0 MAX'];
    return multipliers[this.lastTier] || 'x1.0';
  }

  constructor(private game: GameService) {
    effect(() => {
      const currentCombo = this.combo();
      const trapCount = this.getTrapezoidCount();

      if (trapCount !== this.currentTrapCount) {
        this.updateTrapezoids();
      }
    });
  }

  ngOnInit(): void {
    this.game.start();
    this.lastMoney = this.game.money();

    this.moneyWatcherId = setInterval(() => {
      this.checkMoneyDelta();
    }, 100);
  }

  ngAfterViewInit(): void {
    const btn = this.clickButton.nativeElement;

    // Intro: overlay + contenu animé
    if (this.introOverlay) {
      const overlay = this.introOverlay.nativeElement;
      const content = overlay.querySelector('.intro-content') as
        | HTMLElement
        | null;

      gsap.set(overlay, {
        opacity: 1,
        pointerEvents: 'auto',
      });

      if (content) {
        gsap.set(content, {
          opacity: 0,
          scale: 0.9,
          y: 24,
        });

        const tl = gsap.timeline();

        tl.to(content, {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.7,
          ease: 'back.out(1.7)',
        }).to(overlay, {
          opacity: 0,
          duration: 1.1,
          ease: 'power2.out',
          delay: 0.5,
          onComplete: () => {
            overlay.style.display = 'none';
          },
        });
      } else {
        gsap.to(overlay, {
          opacity: 0,
          duration: 1.2,
          ease: 'power2.out',
          delay: 0.3,
          onComplete: () => {
            overlay.style.display = 'none';
          },
        });
      }
    }

    // état initial du bouton : hors écran, un peu plus petit
    gsap.set(btn, {
      opacity: 0,
      y: -150,
      scale: 0.9,
    });

    gsap.to(btn, {
      y: 0,
      opacity: 1,
      scale: 1,
      duration: 1.2,
      ease: 'power2.out',
      delay: 0.6,
      onComplete: () => {
        try {
          const gem = btn.querySelector('.mascot') as HTMLElement | null;
          if (gem) {
            gem.setAttribute('draggable', 'false');
            gem.addEventListener('dragstart', (e) => e.preventDefault());
          }
        } catch {
          // noop
        }

        this.startSparkles();
        try {
          this.updateTrapezoids();
        } catch {
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

  // ---------- RESET AVEC POPUP ----------

  reset(): void {
    this.openResetDialog();
  }

  private performReset(): void {
    this.game.reset();
    this.lastMoney = this.game.money();
  }

  openResetDialog(): void {
    this.showResetDialog.set(true);

    setTimeout(() => {
      const dlg = this.resetDialog?.nativeElement;
      if (!dlg) return;

      gsap.fromTo(
        dlg,
        { scale: 0.85, opacity: 0, y: 12 },
        {
          scale: 1,
          opacity: 1,
          y: 0,
          duration: 0.25,
          ease: 'power2.out',
        },
      );
    });
  }

  confirmReset(): void {
    const dlg = this.resetDialog?.nativeElement;

    if (dlg) {
      gsap.to(dlg, {
        scale: 0.9,
        opacity: 0,
        y: 10,
        duration: 0.18,
        ease: 'power1.in',
        onComplete: () => {
          this.showResetDialog.set(false);
          this.performReset();
        },
      });
    } else {
      this.showResetDialog.set(false);
      this.performReset();
    }
  }

  cancelReset(): void {
    const dlg = this.resetDialog?.nativeElement;

    if (dlg) {
      gsap.to(dlg, {
        scale: 0.9,
        opacity: 0,
        y: 10,
        duration: 0.18,
        ease: 'power1.in',
        onComplete: () => this.showResetDialog.set(false),
      });
    } else {
      this.showResetDialog.set(false);
    }
  }

  // ---------- INTERACTIONS ----------

  click(): void {
    const now = Date.now();
    const previousCombo = this.combo();

    if (previousCombo === 0) {
      this.combo.set(1);
    } else {
      this.combo.update((c) => c + 1);
    }

    const currentCombo = this.combo();
    this.lastClickTime = now;

    const currentTier = this.getTierForCombo(currentCombo);
    const previousTier = this.getTierForCombo(previousCombo);

    let effectiveTier = previousTier;

    if (currentTier > previousTier) {
      this.comboTimeProgress.set(100);

      setTimeout(() => {
        this.lastTier = currentTier;
        const tierProgress = this.getProgressInTier(currentCombo);
        this.comboTimeProgress.set(tierProgress);
      }, 150);
    } else {
      const tierProgress = this.getProgressInTier(currentCombo);
      this.comboTimeProgress.set(tierProgress);
      effectiveTier = currentTier;
    }

    if (this.comboTimeoutId) {
      clearTimeout(this.comboTimeoutId);
    }
    if (this.comboProgressInterval) {
      clearInterval(this.comboProgressInterval);
    }

    this.startComboDrain();

    const multiplier = this.getTierMultiplier(effectiveTier);

    this.game.click(multiplier);

    const btnElem = this.clickButton.nativeElement as HTMLElement;
    const gem = btnElem.querySelector('.mascot') as HTMLElement | null;
    const crack = btnElem.querySelector('.mascot.crack') as HTMLElement | null;
    if (gem) {
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
        },
      );
    }
    if (crack) {
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
        },
      );
    }
  }

  buyGenerator(id: string): void {
    this.game.buyGenerator(id);
  }

  buyUpgrade(id: string): void {
    this.game.buyUpgrade(id);
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

  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(
      255,
      ((num >> 16) & 0xff) + Math.floor((255 * percent) / 100),
    );
    const g = Math.min(
      255,
      ((num >> 8) & 0xff) + Math.floor((255 * percent) / 100),
    );
    const b = Math.min(
      255,
      (num & 0xff) + Math.floor((255 * percent) / 100),
    );
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(
      0,
      ((num >> 16) & 0xff) - Math.floor((255 * percent) / 100),
    );
    const g = Math.max(
      0,
      ((num >> 8) & 0xff) - Math.floor((255 * percent) / 100),
    );
    const b = Math.max(
      0,
      (num & 0xff) - Math.floor((255 * percent) / 100),
    );
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  // ---------- FX : SPARKLES ----------

  private startSparkles(): void {
    if (this.sparkleIntervalId) return;

    this.sparkleIntervalId = setInterval(() => {
      this.spawnSparkle();
    }, 300);
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

  // ---------- COMBO & TRAPEZOIDS ----------

  private getComboMultiplier(): number {
    const c = this.combo();
    if (c < 10) return 1.0;
    if (c < 25) return 1.5;
    if (c < 50) return 2.0;
    if (c < 85) return 2.5;
    return 3.0;
  }

  private getTierMultiplier(tier: number): number {
    const multipliers = [1.0, 1.5, 2.0, 2.5, 3.0];
    return multipliers[tier] || 3.0;
  }

  private getTrapezoidCount(): number {
    const c = this.combo();
    const gemLevel = this.game.currentGemLevel();

    const baseCount = 4 + Math.floor(c / 5);

    const multiplier = Math.pow(1.5, gemLevel);
    const scaledCount = Math.floor(baseCount * multiplier);

    return Math.min(scaledCount, 100);
  }

  private updateTrapezoids(): void {
    if (!this.trapezoidLayer || !this.clickButton) return;

    const targetCount = this.getTrapezoidCount();
    const layer = this.trapezoidLayer.nativeElement;
    const currentCount = layer.querySelectorAll('.trapezoid').length;

    if (targetCount > currentCount) {
      for (let i = currentCount; i < targetCount; i++) {
        this.createSingleTrapezoid(i, targetCount);
      }
    } else if (targetCount < currentCount) {
      const trapezoids = layer.querySelectorAll('.trapezoid');
      for (let i = targetCount; i < currentCount; i++) {
        const trapToRemove = trapezoids[i];
        if (trapToRemove) {
          gsap.to(trapToRemove, {
            opacity: 0,
            scale: 0.5,
            duration: 0.3,
            onComplete: () => trapToRemove.remove(),
          });
        }
      }
    }

    this.currentTrapCount = targetCount;
  }

  private createSingleTrapezoid(index: number, totalCount: number): void {
    if (!this.trapezoidLayer || !this.clickButton) return;
    const layer = this.trapezoidLayer.nativeElement;

    const el = document.createElement('div');
    el.classList.add('trapezoid');

    const w = this.randomRange(40, 120);
    const h = this.randomRange(140, 320);

    const angle = this.randomRange(0, 360);
    const distance = this.randomRange(15, 45);
    const leftOffset = Math.cos((angle * Math.PI) / 180) * distance;
    const topOffset = Math.sin((angle * Math.PI) / 180) * distance;

    const rot = angle - 90 + this.randomRange(-15, 15);
    const dur = `${this.randomRange(5, 16).toFixed(2)}s`;

    const tier = this.getTierForCombo(this.combo());
    const baseOpacity = [45, 55, 65, 75, 80][tier] || 45;
    const opacity = (
      this.randomRange(baseOpacity, Math.min(95, baseOpacity + 15)) / 100
    ).toFixed(2);

    el.style.setProperty('--tr-w', `${w}%`);
    el.style.setProperty('--tr-h', `${h}%`);
    el.style.setProperty('--tr-rot', `${rot}deg`);
    el.style.setProperty('--tr-dur', dur);
    el.style.setProperty('--tr-opacity', `${opacity}`);
    el.style.setProperty('--tr-left', `calc(50% + ${leftOffset}px)`);
    el.style.setProperty('--tr-top', `calc(40% + ${topOffset}px)`);
    el.style.setProperty(
      '--tr-z',
      `${Math.floor(this.randomRange(-5, 5))}`,
    );

    layer.appendChild(el);

    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.7 },
      {
        opacity: parseFloat(opacity),
        scale: 1,
        duration: 0.4,
        ease: 'power2.out',
      },
    );
  }

  private createTrapezoids(count = 4): void {
    if (!this.trapezoidLayer || !this.clickButton) return;
    const layer = this.trapezoidLayer.nativeElement;
    layer.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.classList.add('trapezoid');

      const w = this.randomRange(40, 120);
      const h = this.randomRange(140, 320);

      const angle = (i / count) * 360 + this.randomRange(-25, 25);
      const distance = this.randomRange(15, 45);
      const leftOffset = Math.cos((angle * Math.PI) / 180) * distance;
      const topOffset = Math.sin((angle * Math.PI) / 180) * distance;

      const rot = angle - 90 + this.randomRange(-15, 15);
      const dur = `${this.randomRange(5, 16).toFixed(2)}s`;

      const tier = this.getTierForCombo(this.combo());
      const baseOpacity = [45, 55, 65, 75, 80][tier] || 45;
      const opacity = (
        this.randomRange(baseOpacity, Math.min(95, baseOpacity + 15)) / 100
      ).toFixed(2);

      el.style.setProperty('--tr-w', `${w}%`);
      el.style.setProperty('--tr-h', `${h}%`);
      el.style.setProperty('--tr-rot', `${rot}deg`);
      el.style.setProperty('--tr-dur', dur);
      el.style.setProperty('--tr-opacity', `${opacity}`);
      el.style.setProperty('--tr-left', `calc(50% + ${leftOffset}px)`);
      el.style.setProperty('--tr-top', `calc(40% + ${topOffset}px)`);
      el.style.setProperty(
        '--tr-z',
        `${Math.floor(this.randomRange(-5, 5))}`,
      );

      layer.appendChild(el);

      gsap.set(el, {
        opacity: parseFloat(opacity),
        scale: 1,
      });
    }

    this.currentTrapCount = count;
  }

  // ---------- COMBO DRAIN SYSTEM ----------

  private startComboDrain(): void {
    const startTime = Date.now();
    const startCombo = this.combo();

    if (startCombo === 0) {
      return;
    }

    const currentTier = this.getTierForCombo(startCombo);
    const drainRates = [400, 300, 220, 160, 160];
    const drainRate = drainRates[currentTier] || 160;

    this.comboProgressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const combosLost = Math.floor(elapsed / drainRate);
      const newCombo = Math.max(0, startCombo - combosLost);

      if (newCombo !== this.combo()) {
        this.combo.set(newCombo);

        const newTier = this.getTierForCombo(newCombo);
        this.lastTier = newTier;

        const tierProgress = this.getProgressInTier(newCombo);
        this.comboTimeProgress.set(tierProgress);

        if (newCombo === 0) {
          clearInterval(this.comboProgressInterval);
          this.comboTimeProgress.set(0);
          this.lastTier = 0;
          return;
        }
      } else {
        const currentComboValue = this.combo();
        const nextCombo = Math.max(0, currentComboValue - 1);

        const currentTierCheck = this.getTierForCombo(currentComboValue);
        const nextTierCheck = this.getTierForCombo(nextCombo);

        if (currentTierCheck === nextTierCheck) {
          const partialProgress = (elapsed % drainRate) / drainRate;
          const currentComboProgress = this.getProgressInTier(
            currentComboValue,
          );
          const nextComboProgress = this.getProgressInTier(nextCombo);
          const interpolatedProgress =
            currentComboProgress -
            (currentComboProgress - nextComboProgress) * partialProgress;
          this.comboTimeProgress.set(Math.max(0, interpolatedProgress));
        }
      }
    }, 16);

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
