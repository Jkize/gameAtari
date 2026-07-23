import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  imports: [],
  templateUrl: './loading-skeleton.component.html',
  styleUrl: './loading-skeleton.component.css',
})
export class LoadingSkeletonComponent {
  @Input() rows = 2;
  @Input() ariaLabel = '';

  get rowIndexes(): number[] {
    return Array.from({ length: this.rows }, (_, i) => i);
  }
}
