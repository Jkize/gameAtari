import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TankCustomizationComponent } from '@features/tank-customization/tank-customization.component';

@Component({
  selector: 'app-garage-v2',
  standalone: true,
  imports: [TranslocoPipe, TankCustomizationComponent],
  templateUrl: './garage-v2.component.html',
  styleUrl: './garage-v2.component.css',
})
export class GarageV2Component {}
