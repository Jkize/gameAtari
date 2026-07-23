import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from '../app-header/app-header.component';
import { MobileNavStateService } from '../mobile-nav-state.service';
import { APP_AUTHOR, APP_VERSION } from '@shared/config/app-version';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, AppHeaderComponent],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css',
})
export class AppLayoutComponent {
  protected readonly appVersion = APP_VERSION;
  protected readonly appAuthor = APP_AUTHOR;

  constructor(readonly mobileNavState: MobileNavStateService) {}
}
