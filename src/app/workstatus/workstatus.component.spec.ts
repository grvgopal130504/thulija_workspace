import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkstatusComponent } from './workstatus.component';

describe('WorkstatusComponent', () => {
  let component: WorkstatusComponent;
  let fixture: ComponentFixture<WorkstatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WorkstatusComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(WorkstatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
