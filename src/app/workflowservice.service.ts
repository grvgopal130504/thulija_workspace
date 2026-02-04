import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

export interface Position {
  x: number;
  y: number;
}

export interface WorkflowProperties {
  [key: string]: any;
  sequence?: number;
  name?: string;
  input_property_name_id?: number;
  input_property_value?: string;
  return_input_property_value?: string | null;
  work_flow_action_id?: number;
  reject_action_id?: number | null;
  output_property_name_id?: number;
  output_property_value?: string;
  output_property_query_by?: string | null;
  output_property_reject_value?: string | null;
  output_property_reject_query_by?: string | null;
  output_property_onwards_query_by?: string | null;
  execute?: string;
  work_flow_access_level_id?: number;
  createdby?: number;
  createddate?: string;
  lastmodifiedby?: number | null;
  lastmodifieddate?: string | null;
  position: Position;
}

export interface DraggableItem {
  id: number;
  label: string;
  position: Position;
  type: 'action1' | 'action2' | 'continue' | 'reject';
  properties?: WorkflowProperties;
  workflowId?: string;
}

export interface SavedState {
  id?: number | string;
  items: DraggableItem[];
  arrows: { fromId: number; toId: number }[];
  nextId: number;
}

export interface WorkflowProcessItem {
  id: string;
  project_id: number;
  logical_module_id: number;
  page_id: number;
  sequence: number;
  name: string;
  position?: Position;
  [key: string]: any;
}

// Interface for storing positions in localStorage
export interface PositionStore {
  [workflowId: string]: Position;
}

@Injectable({
  providedIn: 'root'
})
export class WorkflowserviceService {

  // ========== CONFIGURABLE SPACING CONSTANTS ==========
  // Adjust these values to control the gap between workflow items
  
  private readonly DEFAULT_START_X = 120;
  private readonly DEFAULT_START_Y = 120;
  
  // SPACE_INCREASE: Controls horizontal spacing between main action items
  // Increase this value to add more gap between actions (recommended: 250-400)
  private readonly SPACE_INCREASE = 300; // Changed from 200 to 300 for better spacing
  
  // Controls vertical spacing for Action2 child nodes (Continue/Reject)
  private readonly ACTION2_CHILD_VERTICAL_SPACING = 90; // Space between Continue and Reject
  
  // Controls horizontal spacing for Action2 child nodes from parent
  private readonly ACTION2_CHILD_HORIZONTAL_OFFSET = 280; // Distance from Action2 to Continue/Reject

  // ========== STORAGE KEYS ==========
  private readonly LOCALSTORAGE_PREFIX = 'workflow_';
  private readonly POSITIONS_KEY = `${this.LOCALSTORAGE_PREFIX}positions`; // Stores positions only
  private readonly CANVAS_STATE_KEY = `${this.LOCALSTORAGE_PREFIX}canvas_state`; // Stores canvas state

  // JSON Server endpoints for fetching workflow data
  private readonly JSON_SERVER_URL = 'http://localhost:3000';
  private readonly WORKFLOW_PROCESS_ENDPOINT = `${this.JSON_SERVER_URL}/workflowProcess`;

  constructor(private http: HttpClient) { }

  // ========== LOCALSTORAGE HELPER METHODS ==========
  
  private getFromLocalStorage<T>(key: string): T | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error reading from localStorage (${key}):`, error);
      return null;
    }
  }

  private saveToLocalStorage<T>(key: string, data: T): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`Error writing to localStorage (${key}):`, error);
      return false;
    }
  }

  private removeFromLocalStorage(key: string): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing from localStorage (${key}):`, error);
      return false;
    }
  }

  // ========== POSITION STORAGE METHODS (LOCALSTORAGE) ==========

  /**
   * Get stored position for a workflow item
   */
  getStoredPosition(workflowId: string): Position | null {
    const positions = this.getFromLocalStorage<PositionStore>(this.POSITIONS_KEY);
    return positions ? positions[workflowId] || null : null;
  }

  /**
   * Save position for a workflow item
   */
  savePosition(workflowId: string, position: Position): boolean {
    const positions = this.getFromLocalStorage<PositionStore>(this.POSITIONS_KEY) || {};
    positions[workflowId] = position;
    const success = this.saveToLocalStorage(this.POSITIONS_KEY, positions);
    
    if (success) {
      console.log(`Position saved to localStorage for workflow ${workflowId}:`, position);
    }
    
    return success;
  }

  /**
   * Delete position for a workflow item
   */
  deletePosition(workflowId: string): boolean {
    const positions = this.getFromLocalStorage<PositionStore>(this.POSITIONS_KEY);
    if (!positions) return false;
    
    delete positions[workflowId];
    return this.saveToLocalStorage(this.POSITIONS_KEY, positions);
  }

  /**
   * Clear all stored positions
   */
  clearAllPositions(): boolean {
    return this.removeFromLocalStorage(this.POSITIONS_KEY);
  }

  // ========== WORKFLOW PROCESS METHODS (JSON SERVER) ==========

  /**
   * Fetch all workflow data from JSON server
   * Positions are merged from localStorage
   */
  getAllWorkflowProcess(): Observable<WorkflowProcessItem[]> {
    return this.http.get<WorkflowProcessItem[]>(this.WORKFLOW_PROCESS_ENDPOINT)
      .pipe(
        map((items: WorkflowProcessItem[]) => {
          // Merge positions from localStorage
          return this.mergePositionsFromLocalStorage(items);
        }),
        catchError((error: any) => {
          console.error('Error loading workflow process data from JSON server:', error);
          console.log('Make sure JSON server is running on http://localhost:3000');
          return of([]);
        })
      );
  }

  /**
   * Merge stored positions from localStorage into workflow items
   */
  private mergePositionsFromLocalStorage(items: WorkflowProcessItem[]): WorkflowProcessItem[] {
    const positions = this.getFromLocalStorage<PositionStore>(this.POSITIONS_KEY);
    
    if (!positions) {
      return items;
    }

    return items.map(item => {
      const storedPosition = positions[item.id];
      if (storedPosition) {
        return { ...item, position: storedPosition };
      }
      return item;
    });
  }

  /**
   * Get workflow items by page ID
   */
  getWorkflowProcessByPageId(pageId: number): Observable<WorkflowProcessItem[]> {
    return this.getAllWorkflowProcess().pipe(
      map((items: WorkflowProcessItem[]) => {
        const filtered = items.filter((item: WorkflowProcessItem) => item.page_id === pageId);
        console.log(`Found ${filtered.length} workflow items for page_id: ${pageId}`);
        return filtered;
      })
    );
  }

  /**
   * Get workflow item by ID
   */
  getWorkflowProcessById(id: string): Observable<WorkflowProcessItem | null> {
    return this.http.get<WorkflowProcessItem>(`${this.WORKFLOW_PROCESS_ENDPOINT}/${id}`)
      .pipe(
        map((item: WorkflowProcessItem) => {
          // Merge position from localStorage
          const storedPosition = this.getStoredPosition(item.id);
          if (storedPosition) {
            item.position = storedPosition;
          }
          return item;
        }),
        catchError((error: any) => {
          console.error(`Error loading workflow process item ${id}:`, error);
          return of(null);
        })
      );
  }

  /**
   * Update workflow position (saves only to localStorage, not to JSON server)
   */
  updateWorkflowPosition(id: string, position: Position, additionalData?: Partial<WorkflowProcessItem>): Observable<WorkflowProcessItem | null> {
    // Save position to localStorage
    this.savePosition(id, position);
    
    // Return the updated item without actually updating JSON server
    return this.getWorkflowProcessById(id).pipe(
      map((item: WorkflowProcessItem | null) => {
        if (item) {
          item.position = position;
          if (additionalData) {
            Object.assign(item, additionalData);
          }
        }
        return item;
      })
    );
  }

  /**
   * Update workflow process in JSON server (optional - if you need to update other fields)
   */
  updateWorkflowProcess(id: string, data: Partial<WorkflowProcessItem>): Observable<WorkflowProcessItem | null> {
    return this.http.put<WorkflowProcessItem>(`${this.WORKFLOW_PROCESS_ENDPOINT}/${id}`, data)
      .pipe(
        tap((item: WorkflowProcessItem) => {
          // If position is included, save it to localStorage
          if (item.position) {
            this.savePosition(id, item.position);
          }
        }),
        catchError((error: any) => {
          console.error(`Error updating workflow process item ${id}:`, error);
          return of(null);
        })
      );
  }

  /**
   * Create workflow process item in JSON server
   */
  createWorkflowProcess(data: Partial<WorkflowProcessItem>): Observable<WorkflowProcessItem | null> {
    return this.http.post<WorkflowProcessItem>(this.WORKFLOW_PROCESS_ENDPOINT, data)
      .pipe(
        tap((item: WorkflowProcessItem) => {
          // Save position to localStorage
          if (item.position) {
            this.savePosition(item.id, item.position);
          }
        }),
        catchError((error: any) => {
          console.error('Error creating workflow process item:', error);
          return of(null);
        })
      );
  }

  /**
   * Delete workflow process item
   */
  deleteWorkflowProcess(id: string): Observable<boolean> {
    return this.http.delete(`${this.WORKFLOW_PROCESS_ENDPOINT}/${id}`)
      .pipe(
        tap(() => {
          // Also delete position from localStorage
          this.deletePosition(id);
        }),
        map(() => true),
        catchError((error: any) => {
          console.error(`Error deleting workflow process item ${id}:`, error);
          return of(false);
        })
      );
  }

  // ========== CANVAS STATE METHODS (LOCALSTORAGE) ==========

  getCanvasState(): Observable<SavedState | null> {
    const state = this.getFromLocalStorage<SavedState>(this.CANVAS_STATE_KEY);
    
    if (!state) {
      return of(null);
    }

    const fixedState = this.autoFixCanvasState(state);
    return of(fixedState);
  }

  private autoFixCanvasState(state: SavedState): SavedState {
    if (!state || !state.items || state.items.length === 0) {
      return state;
    }

    let needsAutoFix = false;
    const fixedItems: DraggableItem[] = [];

    state.items.forEach((item: DraggableItem, index: number) => {
      const fixedItem = { ...item };

      if (!this.isValidPosition(item.position) || 
          (item.position.x === 0 && item.position.y === 0)) {
        
        // Arrange items horizontally using SPACE_INCREASE
        const defaultPosition = {
          x: this.DEFAULT_START_X + (index * this.SPACE_INCREASE),
          y: this.DEFAULT_START_Y
        };

        fixedItem.position = defaultPosition;

        if (fixedItem.properties) {
          fixedItem.properties.position = defaultPosition;
        }

        // Save to localStorage if item has workflowId
        if (fixedItem.workflowId) {
          this.savePosition(fixedItem.workflowId, defaultPosition);
        }

        needsAutoFix = true;
        console.log(`Auto-fixed position for item ${item.id}: ${item.label}`);
      }

      fixedItems.push(fixedItem);
    });

    let fixedArrows = state.arrows || [];

    if (!fixedArrows || fixedArrows.length === 0) {
      fixedArrows = this.generateSequentialArrows(fixedItems);
      needsAutoFix = true;
      console.log('Auto-generated sequential arrows');
    } else {
      const validArrows = fixedArrows.filter((arrow: { fromId: number; toId: number }) => {
        const fromExists = fixedItems.some((item: DraggableItem) => item.id === arrow.fromId);
        const toExists = fixedItems.some((item: DraggableItem) => item.id === arrow.toId);
        return fromExists && toExists;
      });

      if (validArrows.length !== fixedArrows.length) {
        fixedArrows = validArrows;
        needsAutoFix = true;
        console.log('Removed invalid arrows');
      }
    }

    const fixedState: SavedState = {
      ...state,
      items: fixedItems,
      arrows: fixedArrows
    };

    if (needsAutoFix) {
      console.log('Canvas state auto-fixed and will be saved');
      this.saveCanvasState(fixedState).subscribe({
        next: () => console.log('Auto-fixed canvas state saved to localStorage'),
        error: (err: any) => console.error('Error saving auto-fixed state:', err)
      });
    }

    return fixedState;
  }

  private generateSequentialArrows(items: DraggableItem[]): { fromId: number; toId: number }[] {
    const arrows: { fromId: number; toId: number }[] = [];

    const sortedItems = [...items].sort((a: DraggableItem, b: DraggableItem) => {
      const seqA = a.properties?.sequence || a.id;
      const seqB = b.properties?.sequence || b.id;
      return seqA - seqB;
    });

    for (let i = 0; i < sortedItems.length - 1; i++) {
      arrows.push({
        fromId: sortedItems[i].id,
        toId: sortedItems[i + 1].id
      });
    }

    return arrows;
  }

  saveCanvasState(state: SavedState): Observable<SavedState | null> {
    const success = this.saveToLocalStorage(this.CANVAS_STATE_KEY, state);
    return of(success ? state : null);
  }

  deleteCanvasState(): Observable<boolean> {
    const success = this.removeFromLocalStorage(this.CANVAS_STATE_KEY);
    return of(success);
  }

  // ========== HELPER METHODS ==========

  createPropertiesFromWorkflow(workflowItem: WorkflowProcessItem, position: Position): WorkflowProperties {
    const props: any = { ...workflowItem };
    
    // Remove fields that shouldn't be in properties
    delete props.id;
    delete props.project_id;
    delete props.logical_module_id;
    delete props.page_id;
    
    // Set position
    props.position = { x: position.x, y: position.y };
    
    return props as WorkflowProperties;
  }

  generateDefaultProperties(label: string, position: Position, sequence: number): WorkflowProperties {
    return {
      sequence,
      name: label,
      input_property_name_id: 0,
      input_property_value: '',
      return_input_property_value: null,
      work_flow_action_id: 0,
      reject_action_id: null,
      output_property_name_id: 0,
      output_property_value: '',
      output_property_query_by: null,
      output_property_reject_value: null,
      output_property_reject_query_by: null,
      output_property_onwards_query_by: null,
      execute: '',
      work_flow_access_level_id: 0,
      createdby: 1,
      createddate: new Date().toISOString().slice(0, 19).replace('T', ' '),
      lastmodifiedby: null,
      lastmodifieddate: null,
      position: { x: position.x, y: position.y }
    };
  }

  getCurrentTimestamp(): string {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  isValidPosition(position: any): boolean {
    return position && 
           typeof position.x === 'number' && 
           typeof position.y === 'number' &&
           !isNaN(position.x) &&
           !isNaN(position.y);
  }

  calculateAutoPosition(
    workflowItem: WorkflowProcessItem, 
    index: number, 
    startX: number = this.DEFAULT_START_X, 
    startY: number = this.DEFAULT_START_Y, 
    spacing: number = this.SPACE_INCREASE
  ): Position {
    // First check if we have a stored position in localStorage
    const storedPosition = this.getStoredPosition(workflowItem.id);
    if (storedPosition && this.isValidPosition(storedPosition)) {
      console.log(`Using stored position for workflow ${workflowItem.id}:`, storedPosition);
      return storedPosition;
    }

    // If the workflow item already has a valid position from JSON, use it
    if (workflowItem.position && 
        this.isValidPosition(workflowItem.position) && 
        workflowItem.position.x !== 0 && 
        workflowItem.position.y !== 0) {
      // Save this position to localStorage for future use
      this.savePosition(workflowItem.id, workflowItem.position);
      return {
        x: workflowItem.position.x,
        y: workflowItem.position.y
      };
    }

    // Arrange items horizontally (left to right) with SPACE_INCREASE gap
    const autoPosition = {
      x: startX + (index * spacing),
      y: startY
    };

    // Save auto-calculated position to localStorage
    this.savePosition(workflowItem.id, autoPosition);
    
    return autoPosition;
  }

  sortBySequence(items: WorkflowProcessItem[]): WorkflowProcessItem[] {
    return [...items].sort((a: WorkflowProcessItem, b: WorkflowProcessItem) => (a.sequence || 0) - (b.sequence || 0));
  }

  // ========== GETTER METHODS FOR CONFIGURABLE SPACING ==========
  
  getSpaceIncrease(): number {
    return this.SPACE_INCREASE;
  }

  getAction2ChildVerticalSpacing(): number {
    return this.ACTION2_CHILD_VERTICAL_SPACING;
  }

  getAction2ChildHorizontalOffset(): number {
    return this.ACTION2_CHILD_HORIZONTAL_OFFSET;
  }

  // ========== UTILITY METHODS ==========
  
  /**
   * Clear all localStorage data (positions and canvas state)
   */
  clearAllLocalStorage(): Observable<boolean> {
    this.removeFromLocalStorage(this.CANVAS_STATE_KEY);
    this.removeFromLocalStorage(this.POSITIONS_KEY);
    console.log('All localStorage data cleared');
    return of(true);
  }

  /**
   * Export positions as JSON for backup
   */
  exportPositions(): string | null {
    const positions = this.getFromLocalStorage<PositionStore>(this.POSITIONS_KEY);
    return positions ? JSON.stringify(positions, null, 2) : null;
  }

  /**
   * Import positions from JSON backup
   */
  importPositions(jsonString: string): boolean {
    try {
      const positions = JSON.parse(jsonString) as PositionStore;
      return this.saveToLocalStorage(this.POSITIONS_KEY, positions);
    } catch (error) {
      console.error('Error importing positions:', error);
      return false;
    }
  }
}