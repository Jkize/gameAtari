import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';

export type RoomDialogMode = 'create' | 'join';
export interface RoomCredentials {
  name: string;
  password: string;
}

@Component({
  selector: 'app-room-access-dialog',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './room-access-dialog.component.html',
  styleUrl: './room-access-dialog.component.css',
})
export class RoomAccessDialogComponent implements OnChanges {
  @Input() open = false;
  @Input() mode: RoomDialogMode = 'create';
  @Input() pending = false;
  @Input() errorMessage = '';

  @Output() dismissed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<RoomCredentials>();

  @ViewChild('nameInput') private nameInput?: ElementRef<HTMLInputElement>;

  name = '';
  password = '';

  ngOnChanges(changes: SimpleChanges): void {
    const justOpened = changes['open']?.currentValue === true
      && changes['open']?.previousValue !== true;
    const changedModeWhileOpen = this.open && Boolean(changes['mode']);
    if (!justOpened && !changedModeWhileOpen) return;
    this.name = '';
    this.password = '';
    setTimeout(() => this.nameInput?.nativeElement.focus());
  }

  submit(): void {
    const name = this.name.trim().replace(/\s+/g, ' ');
    if (this.pending || name.length < 3 || this.password.length < 4) return;
    this.submitted.emit({ name, password: this.password });
  }

  close(): void {
    if (!this.pending) this.dismissed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }
}
