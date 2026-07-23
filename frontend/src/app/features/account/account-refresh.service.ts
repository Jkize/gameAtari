import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AccountRefreshService {
  readonly key = signal(0);

  bump(): void {
    this.key.update(value => value + 1);
  }
}
