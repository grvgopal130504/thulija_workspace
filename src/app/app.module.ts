import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';

import {
  HttpClientModule,
  provideHttpClient,
  withFetch
} from '@angular/common/http';
import { AppComponent } from './app.component';
import { WorkstatusComponent } from './workstatus/workstatus.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

@NgModule({
  declarations: [
    AppComponent,
    WorkstatusComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule, 
    FormsModule,             
    HttpClientModule,       
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule
  ],
  providers: [
    provideHttpClient(withFetch()) 
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
