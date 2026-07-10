import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export interface QuickPlayRoom {
  name: string;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  countdownSeconds: number | null;
}

@Component({
  selector: 'app-quick-play-card',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './quick-play-card.component.html',
  styleUrl: './quick-play-card.component.css',
})
export class QuickPlayCardComponent {
  @Input() currentRoom: QuickPlayRoom | null = null;
  @Input() searching = false;
  @Input() errorMessage = '';

  @Output() play = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();
}
