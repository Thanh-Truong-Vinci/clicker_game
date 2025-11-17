import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { GeneratorDef, Owned } from '../../services/game.service';

@Component({
  standalone: true,
  selector: 'app-generators-panel',
  imports: [CommonModule],
  templateUrl: './generators-panel.component.html',
  styleUrl: './generators-panel.component.scss',
})
export class GeneratorsPanelComponent {
  @Input({ required: true }) generators!: Owned<GeneratorDef>[];
  @Input({ required: true }) money!: number;
  @Input({ required: true }) fmt!: (v: number) => string;

  @Output() buy = new EventEmitter<string>();

  onBuy(id: string): void {
    this.buy.emit(id);
  }
}
