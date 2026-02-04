import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CanvaspaceComponent } from './canvaspace.component';

describe('CanvaspaceComponent', () => {
  let component: CanvaspaceComponent;
  let fixture: ComponentFixture<CanvaspaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CanvaspaceComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CanvaspaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
