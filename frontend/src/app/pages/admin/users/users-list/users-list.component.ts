import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { EmptyStateComponent } from '@shared/ui/empty-state/empty-state.component';
import { LoadingSkeletonComponent } from '@shared/ui/loading-skeleton/loading-skeleton.component';
import { AdminUserItem } from '../users.models';
import { UsersService } from '../users.service';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslocoPipe, EmptyStateComponent, LoadingSkeletonComponent],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.css',
})
export class UsersListComponent implements OnInit {
  readonly items = signal<AdminUserItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly sortBy = signal<'createdAt' | 'lastConnectionAt'>('createdAt');
  readonly order = signal<'asc' | 'desc'>('desc');

  private readonly transloco = inject(TranslocoService);

  constructor(private readonly users: UsersService) {}

  ngOnInit(): void { this.load(); }

  setSort(sortBy: 'createdAt' | 'lastConnectionAt', order: 'asc' | 'desc'): void {
    this.sortBy.set(sortBy);
    this.order.set(order);
    this.items.set([]);
    this.nextCursor.set(null);
    this.load();
  }

  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.users.getUsers(this.nextCursor(), this.sortBy(), this.order()).subscribe({
      next: page => {
        this.items.set([...this.items(), ...page.items]);
        this.nextCursor.set(page.nextCursor ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('users.loadError'));
        this.loading.set(false);
      },
    });
  }
}
