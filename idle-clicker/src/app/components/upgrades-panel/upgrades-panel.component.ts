import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { UpgradeDef, Owned } from '../../services/game.service';

@Component({
  standalone: true,
  selector: 'app-upgrades-panel',
  imports: [CommonModule],
  templateUrl: './upgrades-panel.component.html',
  styleUrl: './upgrades-panel.component.scss',
})
export class UpgradesPanelComponent {
  @Input({ required: true }) upgrades!: Owned<UpgradeDef>[];
  @Input({ required: true }) money!: number;
  @Input({ required: true }) fmt!: (v: number) => string;

  @Output() buy = new EventEmitter<string>();

  onBuy(id: string): void {
    this.buy.emit(id);
  }
}
