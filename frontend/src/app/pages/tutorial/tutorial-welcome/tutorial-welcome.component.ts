import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';

@Component({
  selector: 'app-tutorial-welcome',
  standalone: true,
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './tutorial-welcome.component.html',
  styleUrl: './tutorial-welcome.component.css',
})
export class TutorialWelcomeComponent {
  protected readonly auth = inject(AuthService);
}
