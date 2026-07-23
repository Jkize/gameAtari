import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.css',
})
export class EmptyStateComponent {
  @Input() title = '';
  @Input() message = '';
  @Input() actionLabel = '';

  @Output() action = new EventEmitter<void>();
}
