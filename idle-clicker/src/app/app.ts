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
import { GeneratorsPanelComponent } from './components/generators-panel/generators-panel.component';
import { UpgradesPanelComponent } from './components/upgrades-panel/upgrades-panel.component';
import { Hud } from './components/hud/hud';
import { PlayArea } from './components/play-area/play-area';
import { gsap } from 'gsap';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [
    CommonModule,
    GeneratorsPanelComponent,
    UpgradesPanelComponent,
    Hud,
    PlayArea,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None,
})
export class App implements OnInit, OnDestroy, AfterViewInit {
  protected readonly title = signal('Idle Clicker');

  @ViewChild('introOverlay', { static: true })
  introOverlay!: ElementRef<HTMLDivElement>;

  @ViewChild('resetDialog')
  resetDialog?: ElementRef<HTMLDivElement>;

  protected showResetDialog = signal(false);

  constructor(private game: GameService) {}

  // Exposition vers le template (HUD + panels)
  get money() {
    return this.game.money;
  }
  get perClick() {
    return this.game.perClick;
  }
  get cps() {
    return this.game.cps;
  }
  get autoClickerUnlocked() {
    return this.game.autoClickerUnlocked;
  }
  get generators() {
    return this.game.generators;
  }
  get upgrades() {
    return this.game.upgrades;
  }

  fmt = (v: number) => this.game.formatNumber(v);

  ngOnInit(): void {
    this.game.start();
  }

  ngAfterViewInit(): void {
    // Intro overlay GSAP
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
  }

  ngOnDestroy(): void {
    this.game.stop();
  }

  // ---------- RESET AVEC POPUP ----------

  reset(): void {
    this.openResetDialog();
  }

  private performReset(): void {
    this.game.reset();
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

  // ---------- RELAIS POUR LES PANELS ----------

  buyGenerator(id: string): void {
    this.game.buyGenerator(id);
  }

  buyUpgrade(id: string): void {
    this.game.buyUpgrade(id);
  }
}
