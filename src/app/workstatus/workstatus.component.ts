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

  // Spacing constants are now managed by the workflowService
  // Access them via workflowService.getSpaceIncrease(), etc.
  
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
            console.log('Workflow data updated from localStorage for page_id:', this.PAGE_ID);
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
          console.log('Workflow data loaded from localStorage for page_id:', this.PAGE_ID, this.workflowData);
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
      // Position is now calculated by the service using SPACE_INCREASE
      const position = this.workflowService.calculateAutoPosition(workflowItem, index);
      
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

        // Calculate positions for Continue and Reject nodes using configurable spacing
        const horizontalOffset = this.workflowService.getAction2ChildHorizontalOffset();
        const verticalSpacing = this.workflowService.getAction2ChildVerticalSpacing();
        
        const continuePos: Position = { 
          x: position.x + horizontalOffset, 
          y: position.y - (verticalSpacing / 2) 
        };
        const rejectPos: Position = { 
          x: position.x + horizontalOffset, 
          y: position.y + (verticalSpacing / 2) 
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
        next: (savedState: SavedState | null) => {
          if (savedState) {
            console.log('Canvas state saved to localStorage');
          }
        },
        error: (error: any) => console.error('Error saving canvas state:', error)
      });
  }

  toggleSidenav(): void {
    this.isExpanded = !this.isExpanded;
  }

  onToolbarButtonMouseDown(event: MouseEvent, label: string): void {
    event.preventDefault();
    event.stopPropagation();

    const buttonType = label === 'Action 1' ? 'action1' : 'action2';
    this.toolbarDragLabel = label;
    this.toolbarDragType = buttonType;
    this.toolbarDragActive = true;

    this.dragPreview = {
      label,
      type: buttonType,
      x: event.clientX,
      y: event.clientY
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.dragPreview) {
        this.dragPreview.x = e.clientX;
        this.dragPreview.y = e.clientY;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (this.toolbarDragActive && this.toolbarDragType) {
        this.createNewItemFromToolbar(e, this.toolbarDragLabel, this.toolbarDragType);
      }

      this.toolbarDragActive = false;
      this.toolbarDragType = null;
      this.dragPreview = null;

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private createNewItemFromToolbar(event: MouseEvent, label: string, type: 'action1' | 'action2'): void {
    if (!this.scrollContainerRef?.nativeElement) return;

    const scrollContainer = this.scrollContainerRef.nativeElement;
    const rect = scrollContainer.getBoundingClientRect();
    const canvasX = event.clientX - rect.left + scrollContainer.scrollLeft;
    const canvasY = event.clientY - rect.top + scrollContainer.scrollTop;

    const snappedX = Math.round(canvasX / 20) * 20;
    const snappedY = Math.round(canvasY / 20) * 20;

    const position: Position = { x: snappedX, y: snappedY };

    const newProperties = this.workflowService.generateDefaultProperties(
      label,
      position,
      this.sequenceCounter++
    );

    const newItem: DraggableItem = {
      id: this.nextId++,
      label,
      position,
      type,
      properties: newProperties
    };

    this.items.push(newItem);

    if (this.lastCreatedItem) {
      this.createArrow(this.lastCreatedItem, newItem);
    }

    this.lastCreatedItem = newItem;
    this.updateAllArrows();
    this.saveCanvasState();

    console.log('New item created:', newItem);
  }

  onMouseDown(event: MouseEvent, item: DraggableItem): void {
    if ((event.target as HTMLElement).closest('.property-panel')) return;

    event.preventDefault();
    event.stopPropagation();

    const clickedOnSameItem = this.selectedItem?.id === item.id;

    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;

      this.openPropertyPanel(item);
      return;
    }

    this.clickTimeout = setTimeout(() => {
      this.clickTimeout = null;

      this.selectedItem = item;
      this.draggedItem = item;
      this.offset = {
        x: event.clientX - item.position.x,
        y: event.clientY - item.position.y
      };

      const scrollContainer = this.scrollContainerRef?.nativeElement;
      if (scrollContainer) {
        const canvasElement = scrollContainer.querySelector('.canvas') as HTMLElement;
        if (canvasElement) {
          const canvasRect = canvasElement.getBoundingClientRect();
          const scrollRect = scrollContainer.getBoundingClientRect();
          this.canvasOffset = {
            left: canvasRect.left - scrollRect.left,
            top: canvasRect.top - scrollRect.top
          };
        }

        this.scrollAtDragStart = {
          left: scrollContainer.scrollLeft,
          top: scrollContainer.scrollTop
        };
      }

      this.linkedButtons = [];
      if (item.type === 'action2') {
        const continueBtn = this.items.find((i: DraggableItem) =>
          i.type === 'continue' &&
          this.arrows.some((a: Arrow) => a.from.id === item.id && a.to.id === i.id)
        );
        const rejectBtn = this.items.find((i: DraggableItem) =>
          i.type === 'reject' &&
          this.arrows.some((a: Arrow) => a.from.id === item.id && a.to.id === i.id)
        );

        if (continueBtn) this.linkedButtons.push(continueBtn);
        if (rejectBtn) this.linkedButtons.push(rejectBtn);
      }

      this.isDragging = true;

      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    }, 200);

    const onMouseUp = () => {
      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
        this.clickTimeout = null;
      }
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mouseup', onMouseUp);
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging || !this.draggedItem) return;

    const scrollContainer = this.scrollContainerRef?.nativeElement;
    if (!scrollContainer) return;

    let adjustedClientX = event.clientX;
    let adjustedClientY = event.clientY;

    if (this.canvasOffset && this.scrollAtDragStart) {
      const currentScrollLeft = scrollContainer.scrollLeft;
      const currentScrollTop = scrollContainer.scrollTop;

      const scrollDeltaX = currentScrollLeft - this.scrollAtDragStart.left;
      const scrollDeltaY = currentScrollTop - this.scrollAtDragStart.top;

      adjustedClientX += scrollDeltaX;
      adjustedClientY += scrollDeltaY;
    }

    const newX = adjustedClientX - this.offset.x;
    const newY = adjustedClientY - this.offset.y;

    const snappedX = Math.round(newX / 20) * 20;
    const snappedY = Math.round(newY / 20) * 20;

    const deltaX = snappedX - this.draggedItem.position.x;
    const deltaY = snappedY - this.draggedItem.position.y;

    this.draggedItem.position.x = snappedX;
    this.draggedItem.position.y = snappedY;

    if (this.draggedItem.properties) {
      this.draggedItem.properties.position = {
        x: snappedX,
        y: snappedY
      };
    }

    for (const linkedBtn of this.linkedButtons) {
      linkedBtn.position.x += deltaX;
      linkedBtn.position.y += deltaY;

      if (linkedBtn.properties) {
        linkedBtn.properties.position = {
          x: linkedBtn.position.x,
          y: linkedBtn.position.y
        };
      }
    }

    this.updateAllArrows();
  }

  private onMouseUp = (): void => {
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

    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
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
            if (success) console.log('Canvas state cleared from localStorage');
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

  openPropertyPanel(item: DraggableItem): void {
    this.selectedItem = item;
    this.propertyForm = item.properties ? { ...item.properties } : { position: { ...item.position } };
    this.propertyPanelOpen = true;
  }

  closePropertyPanel(): void {
    this.propertyPanelOpen = false;
    this.selectedItem = null;
  }

  saveProperties(): void {
    if (!this.selectedItem) return;

    this.selectedItem.properties = { ...this.propertyForm };
    this.selectedItem.label = this.propertyForm.name || this.selectedItem.label;

    const newPosition = this.propertyForm.position;
    if (newPosition && typeof newPosition.x === 'number' && typeof newPosition.y === 'number') {
      this.selectedItem.position = { ...newPosition };
    }

    if (this.selectedItem.workflowId) {
      this.autoSavePosition(this.selectedItem);
    }

    this.updateAllArrows();
    this.saveCanvasState();
    this.closePropertyPanel();
  }

  cancelProperties(): void {
    this.closePropertyPanel();
  }

  private autoSavePosition(item: DraggableItem): void {
    if (!item.workflowId) return;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      const position = item.position;
      const additionalData = item.properties ? { ...item.properties } : {};

      this.workflowService.updateWorkflowPosition(item.workflowId!, position, additionalData)
        .subscribe({
          next: (updated: WorkflowProcessItem | null) => {
            if (updated) {
              console.log('Position auto-saved to localStorage for item:', item.workflowId);
            }
          },
          error: (error: any) => console.error('Error auto-saving position:', error)
        });
    }, 1000);
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