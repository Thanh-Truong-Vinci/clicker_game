import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-hud',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hud.html',
  styleUrl: './hud.scss',
})
export class Hud {
  @Input() title = 'Idle Clicker';

  @Input() money = 0;
  @Input() perClick = 0;
  @Input() cps = 0;
  @Input() autoClickerUnlocked = false;

  // fonction de formatage passée par le parent (App)
  @Input() fmt!: (v: number) => string;

  @Output() resetRequested = new EventEmitter<void>();

  onResetClick(): void {
    this.resetRequested.emit();
  }
}
