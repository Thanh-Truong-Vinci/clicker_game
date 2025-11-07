import {
  Component,
  OnDestroy,
  OnInit,
  AfterViewInit,
  ElementRef,
  ViewChild,
  signal,
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

  private lastMoney = 0;
  private moneyWatcherId: any;
  private sparkleIntervalId: any;

  get money() {
    return this.game.money;
  }
  get perClick() {
    return this.game.perClick;
  }
  get cps() {
    return this.game.cps;
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

  constructor(private game: GameService) {}

  ngOnInit(): void {
    this.game.start();

    this.lastMoney = this.game.money();

    // surveillance de l'augmentation des éclats
    this.moneyWatcherId = setInterval(() => {
      this.checkMoneyDelta();
    }, 100);
  }

  ngAfterViewInit(): void {
    const btn = this.clickButton.nativeElement;

    // état initial : hors écran, un peu plus petit
    gsap.set(btn, {
      opacity: 0,
      y: -150,
      scale: 0.9,
      rotation: 0,
      transformOrigin: '50% 50%',
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
        // rotation complète infinie
        gsap.to(btn, {
          rotation: 360,
          duration: 8,
          repeat: -1,
          ease: 'none',
          transformOrigin: '50% 50%',
        });

        // démarrage des étincelles lumineuses autour du joyau
        this.startSparkles();
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
  }

  click(): void {
    this.game.click();

    // petit pop au clic, la rotation tourne déjà en continu
    gsap.to(this.clickButton.nativeElement, {
      scale: 1.05,
      duration: 0.08,
      yoyo: true,
      repeat: 1,
      ease: 'power1.out',
    });
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

  // ----- surveillance de l’augmentation des éclats -----

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

  // ----- FX shards (éclats de cristal) -----

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

  // ----- FX étincelles lumineuses (sparkles) -----

  private startSparkles(): void {
    if (!this.fxLayer || !this.clickButton) return;
    if (this.sparkleIntervalId) return;

    // une petite étincelle régulièrement
    this.sparkleIntervalId = setInterval(() => {
      this.spawnSparkle();
    }, 600);
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

    // position ALÉATOIRE SUR LE JOYAU (à l'intérieur du disque)
    const angleDeg = this.randomRange(0, 360);
    const angleRad = (angleDeg * Math.PI) / 180;

    // rayon réduit pour rester dans la gemme (0 = centre, 1 = bord)
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

    // apparition rapide sur le joyau
    gsap.to(sparkle, {
      duration: 0.22,
      scale: midScale,
      opacity: 1,
      ease: 'power2.out',
    });

    // disparition
    gsap.to(sparkle, {
      duration: 0.3,
      scale: startScale * 0.6,
      opacity: 0,
      ease: 'power1.in',
      delay: 0.22,
      onComplete: () => sparkle.remove(),
    });
  }

  // ----- utilitaires random -----

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(this.randomRange(min, max + 1));
  }
}
