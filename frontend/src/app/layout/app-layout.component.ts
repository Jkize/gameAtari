import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from './app-header.component';
import { MobileNavStateService } from './mobile-nav-state.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, AppHeaderComponent],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css',
})
export class AppLayoutComponent {
  constructor(readonly mobileNavState: MobileNavStateService) {}
}
