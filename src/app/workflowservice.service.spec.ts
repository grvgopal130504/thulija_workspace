import { TestBed } from '@angular/core/testing';

import { WorkflowserviceService } from './workflowservice.service';

describe('WorkflowserviceService', () => {
  let service: WorkflowserviceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkflowserviceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
