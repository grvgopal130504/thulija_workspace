import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CanvaworkComponent } from './canvawork.component';

describe('CanvaworkComponent', () => {
  let component: CanvaworkComponent;
  let fixture: ComponentFixture<CanvaworkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CanvaworkComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CanvaworkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
