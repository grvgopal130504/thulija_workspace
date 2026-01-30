import { Component, ViewChild, ElementRef, OnInit, Inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { 
  WorkflowserviceService, 
  Position, 
  DraggableItem, 
  WorkflowProperties,
  WorkflowProcessItem,
  SavedState
} from '../workflowservice.service';

interface Arrow {
  from: DraggableItem;
  to: DraggableItem;
  path: string;
  strokeDasharray?: string; 
}

interface DragPreview {
  label: string;
  type: 'action1' | 'action2';
  x: number;
  y: number;
}

@Component({
  selector: 'app-workstatus',
  templateUrl: './workstatus.component.html',
  styleUrls: ['./workstatus.component.css']
})
export class WorkstatusComponent implements OnInit, OnDestroy {

  @ViewChild('scrollContainer', { static: false }) scrollContainerRef!: ElementRef<HTMLDivElement>;

  isExpanded = true;
  propertyPanelOpen = false;
  selectedItem: DraggableItem | null = null;
  propertyForm: WorkflowProperties = { position: { x: 0, y: 0 } };

  items: DraggableItem[] = [];
  arrows: Arrow[] = [];
  workflowData: WorkflowProcessItem[] = [];

  canvasWidth = 3200;
  canvasHeight = 3200;

  private draggedItem: DraggableItem | null = null;
  private offset: Position = { x: 0, y: 0 };
  private isDragging = false;
  private nextId = 1;
  private lastCreatedItem: DraggableItem | null = null;
  private linkedButtons: DraggableItem[] = [];
  private clickTimeout: any = null;
  private sequenceCounter = 1;
  private isBrowser: boolean;

  private toolbarDragActive = false;
  private toolbarDragLabel = '';
  private toolbarDragType: 'action1' | 'action2' | null = null;
  dragPreview: DragPreview | null = null;

  private readonly PAGE_ID = 80;

  private pollingSubscription?: Subscription;
  private lastWorkflowDataHash: string = '';

  private readonly AUTO_CREATE_START_X = 120;
  private readonly AUTO_CREATE_START_Y = 120;
  private readonly AUTO_CREATE_VERTICAL_SPACING = 150;
  private autoSaveTimer: any = null;
  private canvasOffset: { left: number; top: number } | null = null;
  private scrollAtDragStart: { left: number; top: number } | null = null;

  constructor(
    private workflowService: WorkflowserviceService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.loadWorkflowDataAndAutoCreate();
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
  }

  private startPolling(): void {
    if (!this.isBrowser) return;
    this.pollingSubscription = interval(2000).subscribe(() => {
      this.checkForWorkflowChanges();
    });
  }

  private checkForWorkflowChanges(): void {
    this.workflowService.getWorkflowProcessByPageId(this.PAGE_ID)
      .subscribe({
        next: (data: WorkflowProcessItem[]) => {
          const currentHash = JSON.stringify(data);
          if (currentHash !== this.lastWorkflowDataHash) {
            this.lastWorkflowDataHash = currentHash;
            this.workflowData = data;
            // console.log('Workflow data updated from server for page_id:', this.PAGE_ID);
            this.autoCreateAction1FromJSON();
          }
        },
        error: (error: any) => {
          console.error('Error checking workflow changes:', error);
        }
      });
  }

  private loadWorkflowDataAndAutoCreate(): void {
    this.workflowService.getWorkflowProcessByPageId(this.PAGE_ID)
      .subscribe({
        next: (data: WorkflowProcessItem[]) => {
          this.workflowData = data;
          this.lastWorkflowDataHash = JSON.stringify(this.workflowData);
          // console.log('Workflow data loaded from server for page_id:', this.PAGE_ID, this.workflowData);
          this.autoCreateAction1FromJSON();
        },
        error: (error: any) => {
          console.error('Error loading workflow data:', error);
        }
      });
  }

  private autoCreateAction1FromJSON(): void {
    if (this.workflowData.length === 0) {
      console.log('No workflow data found for page_id:', this.PAGE_ID);
      return;
    }

    this.items = [];
    this.arrows = [];
    this.lastCreatedItem = null;
    this.nextId = 1;

    const sortedData = this.workflowService.sortBySequence(this.workflowData);

    sortedData.forEach((workflowItem: WorkflowProcessItem, index: number) => {
      const position = this.workflowService.calculateAutoPosition(
        workflowItem, 
        index,
        this.AUTO_CREATE_START_X,
        this.AUTO_CREATE_START_Y,
        this.AUTO_CREATE_VERTICAL_SPACING
      );
      
      // Check if return_input_property_value exists and is not empty
      const hasReturnValue = workflowItem['return_input_property_value'] != null && 
                       workflowItem['return_input_property_value'] !== '';

      if (hasReturnValue) {
        // Create Action 2 instead of Action 1
        const action2Item: DraggableItem = {
          id: this.nextId++,
          label: workflowItem.name || `Action ${workflowItem.sequence}`,
          position: { x: position.x, y: position.y },
          type: 'action2',
          workflowId: workflowItem.id,
          properties: this.workflowService.createPropertiesFromWorkflow(workflowItem, position)
        };

        // Calculate positions for Continue and Reject nodes (positioned to the right of Action 2)
        const continuePos: Position = { 
          x: position.x + 240, 
          y: position.y - 70 
        };
        const rejectPos: Position = { 
          x: position.x + 240, 
          y: position.y + 70 
        };

        // Create Continue node
        const continueItem: DraggableItem = {
          id: this.nextId++,
          label: 'Continue',
          position: { x: continuePos.x, y: continuePos.y },
          type: 'continue',
          properties: { position: continuePos }
        };

        // Create Reject node
        const rejectItem: DraggableItem = {
          id: this.nextId++,
          label: 'Reject',
          position: { x: rejectPos.x, y: rejectPos.y },
          type: 'reject',
          properties: { position: rejectPos }
        };

        // Add all three items to the canvas
        this.items.push(action2Item, continueItem, rejectItem);

        // Create arrows: from previous item to Action 2
        if (this.lastCreatedItem) {
          this.createArrow(this.lastCreatedItem, action2Item);
        }
        
        // Create arrows from Action 2 to its Continue and Reject children (dotted lines)
        this.createArrow(action2Item, continueItem);
        this.createArrow(action2Item, rejectItem);

        // Set lastCreatedItem to Continue so that the next workflow item
        // connects from Continue only, not from Action 2 directly
        this.lastCreatedItem = continueItem;
        
      } else {
        // Create Action 1 (original logic)
        const newItem: DraggableItem = {
          id: this.nextId++,
          label: workflowItem.name || `Action ${workflowItem.sequence}`,
          position: { x: position.x, y: position.y },
          type: 'action1',
          workflowId: workflowItem.id,
          properties: this.workflowService.createPropertiesFromWorkflow(workflowItem, position)
        };

        this.items.push(newItem);

        if (this.lastCreatedItem) {
          this.createArrow(this.lastCreatedItem, newItem);
        }

        this.lastCreatedItem = newItem;
      }
    });

    // Calculate max sequence from actual workflow items only (not Continue/Reject nodes)
    const maxSeq = Math.max(...this.items
      .filter((i: DraggableItem) => i.type === 'action1' || i.type === 'action2')
      .map((i: DraggableItem) => i.properties?.sequence || 0), 0);
    this.sequenceCounter = maxSeq + 1;

    this.updateAllArrows();
    this.saveCanvasState();
    
    console.log('Auto-created workflow items:', this.items.length);
  }

  private saveCanvasState(): void {
    if (!this.isBrowser) return;

    const arrowData = this.arrows.map((arrow: Arrow) => ({
      fromId: arrow.from.id,
      toId: arrow.to.id
    }));

    const state: SavedState = {
      items: this.items,
      arrows: arrowData,
      nextId: this.nextId
    };

    this.workflowService.saveCanvasState(state)
      .subscribe({
        next: (response: SavedState | null) => {
          if (response) {
            console.log('Canvas state saved');
          }
        },
        error: (error: any) => {
          console.error('Error saving canvas state:', error);
        }
      });
  }

  private updateWorkflowPosition(item: DraggableItem): void {
    if (!this.isBrowser || !item.workflowId) return;

    const workflowItem = this.workflowData.find((w: WorkflowProcessItem) => w.id === item.workflowId);
    
    if (!workflowItem) {
      console.warn('Workflow item not found for ID:', item.workflowId);
      return;
    }

    const updateData: any = {
      ...workflowItem,
      position: { x: item.position.x, y: item.position.y }
    };

    if (item.properties) {
      Object.keys(item.properties).forEach((key: string) => {
        if (key !== 'position' && item.properties![key] !== undefined) {
          updateData[key] = item.properties![key];
        }
      });
    }

    this.workflowService.updateWorkflowPosition(
      item.workflowId,
      item.position,
      updateData
    ).subscribe({
      next: (response: WorkflowProcessItem | null) => {
        if (response) {
          console.log(`Workflow item ${item.workflowId} updated - Position: (${item.position.x}, ${item.position.y})`);
          
          const index = this.workflowData.findIndex((w: WorkflowProcessItem) => w.id === item.workflowId);
          if (index !== -1) {
            this.workflowData[index] = { ...this.workflowData[index], ...updateData };
            this.lastWorkflowDataHash = JSON.stringify(this.workflowData);
          }
        }
      },
      error: (error: any) => {
        console.error('Error updating workflow position:', error);
      }
    });
  }

  private autoSavePosition(item: DraggableItem): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.updateWorkflowPosition(item);
      this.saveCanvasState();
    }, 500);
  }

  onToolbarButtonMouseDown(event: MouseEvent, label: string): void {
    event.preventDefault();
    event.stopPropagation();
    
    this.toolbarDragActive = true;
    this.toolbarDragLabel = label;
    this.toolbarDragType = label === 'Action 1' ? 'action1' : 'action2';
    
    this.dragPreview = {
      label: label,
      type: this.toolbarDragType,
      x: event.clientX,
      y: event.clientY
    };

    const moveHandler = (e: MouseEvent) => this.onToolbarDragMove(e);
    const upHandler = (e: MouseEvent) => {
      this.onToolbarDragEnd(e);
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  private onToolbarDragMove(event: MouseEvent): void {
    if (!this.toolbarDragActive || !this.dragPreview) return;

    event.preventDefault();
    
    this.dragPreview = {
      ...this.dragPreview,
      x: event.clientX,
      y: event.clientY
    };
  }

  private onToolbarDragEnd(event: MouseEvent): void {
    if (!this.toolbarDragActive) return;

    const scrollEl = this.scrollContainerRef?.nativeElement;
    if (!scrollEl) {
      this.resetToolbarDrag();
      return;
    }

    const canvas = scrollEl.querySelector('.canvas') as HTMLElement;
    if (!canvas) {
      this.resetToolbarDrag();
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    
    if (event.clientX >= canvasRect.left && 
        event.clientX <= canvasRect.right &&
        event.clientY >= canvasRect.top && 
        event.clientY <= canvasRect.bottom) {
      
      const x = event.clientX - canvasRect.left + scrollEl.scrollLeft;
      const y = event.clientY - canvasRect.top + scrollEl.scrollTop;
      
      this.createItemAtPosition(x, y);
    }

    this.resetToolbarDrag();
  }

  private resetToolbarDrag(): void {
    this.toolbarDragActive = false;
    this.toolbarDragLabel = '';
    this.toolbarDragType = null;
    this.dragPreview = null;
  }

  private createItemAtPosition(x: number, y: number): void {
    if (!this.toolbarDragType || !this.toolbarDragLabel) return;

    const position: Position = { x: x - 70, y: y - 32 };

    const newItem: DraggableItem = {
      id: this.nextId++,
      label: this.toolbarDragLabel,
      position: { x: position.x, y: position.y },
      type: this.toolbarDragType,
      properties: this.getDefaultProperties(this.toolbarDragLabel, position)
    };

    this.items.push(newItem);

    if (this.lastCreatedItem) {
      this.createArrow(this.lastCreatedItem, newItem);
    }

    this.linkedButtons = [];

    if (this.toolbarDragLabel === 'Action 2') {
      const continuePos: Position = { x: newItem.position.x + 240, y: newItem.position.y - 70 };
      const rejectPos: Position = { x: newItem.position.x + 240, y: newItem.position.y + 70 };

      const continueBtn: DraggableItem = {
        id: this.nextId++,
        label: 'Continue',
        position: { x: continuePos.x, y: continuePos.y },
        type: 'continue',
        properties: this.getDefaultProperties('Continue', continuePos)
      };

      const rejectBtn: DraggableItem = {
        id: this.nextId++,
        label: 'Reject',
        position: { x: rejectPos.x, y: rejectPos.y },
        type: 'reject',
        properties: { position: { x: rejectPos.x, y: rejectPos.y } }
      };

      this.items.push(continueBtn, rejectBtn);

      this.createArrow(newItem, continueBtn);
      this.createArrow(newItem, rejectBtn);

      this.linkedButtons = [continueBtn, rejectBtn];
      this.lastCreatedItem = continueBtn;
    } else {
      this.lastCreatedItem = newItem;
    }

    this.updateAllArrows();
    this.saveCanvasState();
  }

  toggleSidenav(): void {
    this.isExpanded = !this.isExpanded;
    setTimeout(() => this.updateAllArrows(), 320);
  }

  private getDefaultProperties(label: string, position: Position): WorkflowProperties {
    const matchingData = this.workflowData.find((w: WorkflowProcessItem) => w.sequence === this.sequenceCounter);
    
    if (matchingData) {
      const props = this.workflowService.createPropertiesFromWorkflow(matchingData, position);
      this.sequenceCounter++;
      return props;
    }

    return this.workflowService.generateDefaultProperties(label, position, this.sequenceCounter++);
  }

  onMouseDown(event: MouseEvent, item: DraggableItem): void {
    event.preventDefault();
    
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

    this.clickTimeout = setTimeout(() => {
      if (!this.isDragging) {
        this.onItemClick(item);
      }
      this.clickTimeout = null;
    }, 200);

    this.startDragging(item, event);
  }

  onItemClick(item: DraggableItem): void {
    if (item.type === 'reject') return;

    this.selectedItem = item;
    this.propertyForm = { ...item.properties } as WorkflowProperties;
    this.propertyPanelOpen = true;
  }

  closePropertyPanel(): void {
    this.propertyPanelOpen = false;
    this.selectedItem = null;
    this.propertyForm = { position: { x: 0, y: 0 } };
  }

  saveProperties(): void {
    if (!this.selectedItem) return;

    let newPosition: Position = { 
      x: this.selectedItem.position.x, 
      y: this.selectedItem.position.y 
    };

    if (this.propertyForm.position && typeof this.propertyForm.position === 'object') {
      const posX = Number(this.propertyForm.position.x);
      const posY = Number(this.propertyForm.position.y);
      if (!isNaN(posX) && !isNaN(posY)) {
        newPosition = { x: posX, y: posY };
      }
    }

    this.propertyForm.lastmodifiedby = 1;
    this.propertyForm.lastmodifieddate = this.workflowService.getCurrentTimestamp();
    
    this.propertyForm.position = { x: newPosition.x, y: newPosition.y };
    this.selectedItem.position = { x: newPosition.x, y: newPosition.y };
    this.selectedItem.properties = { ...this.propertyForm };

    if (this.propertyForm.name) {
      this.selectedItem.label = this.propertyForm.name;
    }

    this.updateAllArrows();
    this.updateWorkflowPosition(this.selectedItem);
    this.saveCanvasState();
    this.closePropertyPanel();
  }

  cancelProperties(): void {
    this.closePropertyPanel();
  }

  private startDragging(item: DraggableItem, event: MouseEvent): void {
    this.draggedItem = item;
    this.isDragging = false;

    if (item.type === 'action2') {
      this.linkedButtons = this.items.filter(i => 
        (i.type === 'continue' || i.type === 'reject') &&
        this.arrows.some(arrow => arrow.from.id === item.id && arrow.to.id === i.id)
      );
    } else {
      this.linkedButtons = [];
    }

    const scrollEl = this.scrollContainerRef?.nativeElement;
    if (!scrollEl) return;

    const canvas = scrollEl.querySelector('.canvas') as HTMLElement;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    this.canvasOffset = {
      left: canvasRect.left,
      top: canvasRect.top
    };

    this.scrollAtDragStart = {
      left: scrollEl.scrollLeft,
      top: scrollEl.scrollTop
    };

    const mouseXInCanvas = event.clientX - canvasRect.left + scrollEl.scrollLeft;
    const mouseYInCanvas = event.clientY - canvasRect.top + scrollEl.scrollTop;

    this.offset = {
      x: mouseXInCanvas - item.position.x,
      y: mouseYInCanvas - item.position.y
    };

    const moveHandler = (e: MouseEvent) => this.onMouseMove(e);
    const upHandler = () => {
      this.onMouseUp();
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.draggedItem || !this.canvasOffset || !this.scrollAtDragStart) return;

    if (!this.isDragging) {
      this.isDragging = true;
      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
        this.clickTimeout = null;
      }
    }

    event.preventDefault();

    const scrollEl = this.scrollContainerRef?.nativeElement;
    if (!scrollEl) return;
    const currentScrollLeft = scrollEl.scrollLeft;
    const currentScrollTop  = scrollEl.scrollTop;

    const newX = event.clientX - this.canvasOffset.left - this.offset.x
               + (currentScrollLeft - this.scrollAtDragStart.left);

    const newY = event.clientY - this.canvasOffset.top - this.offset.y
               + (currentScrollTop - this.scrollAtDragStart.top);

    const deltaX = newX - this.draggedItem.position.x;
    const deltaY = newY - this.draggedItem.position.y;

    this.draggedItem.position = { x: newX, y: newY };

    if (this.draggedItem.properties) {
      this.draggedItem.properties.position = { x: newX, y: newY };
    }

    for (const linkedBtn of this.linkedButtons) {
      linkedBtn.position.x += deltaX;
      linkedBtn.position.y += deltaY;
      
      if (linkedBtn.properties) {
        linkedBtn.properties.position = { x: linkedBtn.position.x, y: linkedBtn.position.y };
      }
    }

    this.updateAllArrows();
  }

  private onMouseUp(): void {
    if (this.isDragging && this.draggedItem) {
      this.autoSavePosition(this.draggedItem);
      
      for (const linkedBtn of this.linkedButtons) {
        if (linkedBtn.workflowId) {
          this.autoSavePosition(linkedBtn);
        }
      }
    }

    this.canvasOffset = null;
    this.scrollAtDragStart = null;

    this.isDragging = false;
    this.draggedItem = null;
    this.linkedButtons = [];
  }

  private createArrow(from: DraggableItem, to: DraggableItem): void {
    const isDottedLine = from.type === 'action2' && (to.type === 'continue' || to.type === 'reject');
    
    this.arrows.push({ 
      from, 
      to, 
      path: '',
      strokeDasharray: isDottedLine ? '4,8' : undefined
    });
  }

  private updateAllArrows(): void {
    for (const arrow of this.arrows) {
      arrow.path = this.calculateArrowPath(arrow.from, arrow.to);
    }
  }

  private calculateArrowPath(from: DraggableItem, to: DraggableItem): string {
    const boxW = 140;
    const boxH = 64;
    const arrowOffset = 3;
    const minControlPointDistance = 50; 

    const fromCenterX = from.position.x + boxW / 2;
    const fromCenterY = from.position.y + boxH / 2;
    const toCenterX = to.position.x + boxW / 2;
    const toCenterY = to.position.y + boxH / 2;
    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const horizontalGap = Math.abs(dx);
    const verticalGap = Math.abs(dy);
    
    let startX: number, startY: number, endX: number, endY: number;
    let startDirection: 'right' | 'up' | 'down';
    let endDirection: 'right' | 'left' | 'up' | 'down';

    // Determine the best starting direction (NEVER from left)
    // Priority: 1. Right if target is to the right
    //           2. Down if target is below
    //           3. Up if target is above
    //           4. Right as fallback (even if target is to the left)
    
    if (dx > 0 && horizontalGap > verticalGap * 0.5) {
      // Target is to the right and horizontal distance is significant
      startX = from.position.x + boxW;
      startY = fromCenterY;
      startDirection = 'right';
      endX = to.position.x - arrowOffset;
      endY = toCenterY;
      endDirection = 'left';
    } 
    else if (dy > 0 && verticalGap > horizontalGap * 0.3) {
      // Target is below
      startX = fromCenterX;
      startY = from.position.y + boxH;
      startDirection = 'down';
      endX = toCenterX;
      endY = to.position.y - arrowOffset;
      endDirection = 'up';
    } 
    else if (dy < 0 && verticalGap > horizontalGap * 0.3) {
      // Target is above
      startX = fromCenterX;
      startY = from.position.y;
      startDirection = 'up';
      endX = toCenterX;
      endY = to.position.y + boxH + arrowOffset;
      endDirection = 'down';
    }
    else if (dx < 0) {
      // Target is to the left - use vertical exit first, then curve around
      if (Math.abs(dy) > 30 || to.position.y > from.position.y) {
        // Exit from bottom and curve around
        startX = fromCenterX;
        startY = from.position.y + boxH;
        startDirection = 'down';
        endX = to.position.x + boxW + arrowOffset;
        endY = toCenterY;
        endDirection = 'right';
      } else {
        // Exit from top and curve around
        startX = fromCenterX;
        startY = from.position.y;
        startDirection = 'up';
        endX = to.position.x + boxW + arrowOffset;
        endY = toCenterY;
        endDirection = 'right';
      }
    }
    else {
      // Fallback: exit from right
      startX = from.position.x + boxW;
      startY = fromCenterY;
      startDirection = 'right';
      endX = to.position.x - arrowOffset;
      endY = toCenterY;
      endDirection = 'left';
    }

    return this.createSmoothBezierPath(
      startX, startY, startDirection,
      endX, endY, endDirection,
      distance
    );
  }

  private createSmoothBezierPath(
    startX: number,
    startY: number,
    startDirection: 'right' | 'left' | 'up' | 'down',
    endX: number,
    endY: number,
    endDirection: 'right' | 'left' | 'up' | 'down',
    distance: number
  ): string {

    const controlDistance = Math.min(distance * 0.4, 150);
    const minControlDist = 40;
    const actualControlDistance = Math.max(controlDistance, minControlDist);
    let cp1X = startX;
    let cp1Y = startY;
    
    switch (startDirection) {
      case 'right':
        cp1X = startX + actualControlDistance;
        cp1Y = startY;
        break;
      case 'left':
        cp1X = startX - actualControlDistance;
        cp1Y = startY;
        break;
      case 'down':
        cp1X = startX;
        cp1Y = startY + actualControlDistance;
        break;
      case 'up':
        cp1X = startX;
        cp1Y = startY - actualControlDistance;
        break;
    }

    let cp2X = endX;
    let cp2Y = endY;
    
    switch (endDirection) {
      case 'right':
        cp2X = endX + actualControlDistance;
        cp2Y = endY;
        break;
      case 'left':
        cp2X = endX - actualControlDistance;
        cp2Y = endY;
        break;
      case 'down':
        cp2X = endX;
        cp2Y = endY + actualControlDistance;
        break;
      case 'up':
        cp2X = endX;
        cp2Y = endY - actualControlDistance;
        break;
    }
    return `M${startX},${startY} C${cp1X},${cp1Y} ${cp2X},${cp2Y} ${endX},${endY}`;
  }

  clearCanvas(): void {
    this.items = [];
    this.arrows = [];
    this.lastCreatedItem = null;
    this.nextId = 1;
    this.sequenceCounter = 1;
    this.closePropertyPanel();
    
    if (this.isBrowser) {
      this.workflowService.deleteCanvasState()
        .subscribe({
          next: (success: boolean) => {
            if (success) console.log('Canvas state cleared');
          },
          error: (error: any) => console.error('Error clearing canvas state:', error)
        });
    }
  }

  getIconName(type: string): string {
    if (type === 'action1' || type === 'action2') return 'extension';
    if (type === 'continue') return 'thumb_up';
    if (type === 'reject') return 'close';
    return 'help_outline';
  }

  getPropertyKeys(): string[] {
    return Object.keys(this.propertyForm).filter(key => 
      !['id', 'project_id', 'logical_module_id', 'page_id', 'position'].includes(key)
    );
  }

  getPropertyValue(key: string): any {
    return this.propertyForm[key as keyof WorkflowProperties];
  }

  setPropertyValue(key: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    
    if (this.isNumberField(key)) {
      const numValue = parseInt(target.value, 10);
      this.propertyForm[key as keyof WorkflowProperties] = (isNaN(numValue) ? 0 : numValue) as any;
    } else {
      this.propertyForm[key as keyof WorkflowProperties] = target.value as any;
    }
  }

  formatLabel(key: string): string {
    return key.replace(/_/g, ' ');
  }

  isNumberField(key: string): boolean {
    return key.includes('_id') || ['sequence', 'createdby', 'lastmodifiedby'].includes(key);
  }

  isDateField(key: string): boolean {
    return key.includes('date');
  }

  isTextField(key: string): boolean {
    return !this.isNumberField(key) && !this.isDateField(key);
  }
}