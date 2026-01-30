import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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

@Injectable({
  providedIn: 'root'
})
export class WorkflowserviceService {

  private readonly JSON_SERVER_URL = 'http://localhost:3000';
  private readonly WORKFLOW_STATE_ENDPOINT = `${this.JSON_SERVER_URL}/workflowState`;
  private readonly WORKFLOW_PROCESS_ENDPOINT = `${this.JSON_SERVER_URL}/workflowProcess`;
  private readonly CANVAS_STATE_ID = "1";


  private readonly DEFAULT_START_X = 120;
  private readonly DEFAULT_START_Y = 120;
  private readonly DEFAULT_VERTICAL_SPACING = 150;
  private readonly DEFAULT_HORIZONTAL_SPACING = 200; // Spacing between items horizontally

  constructor(private http: HttpClient) { }


  getAllWorkflowProcess(): Observable<WorkflowProcessItem[]> {
    return this.http.get<WorkflowProcessItem[]>(this.WORKFLOW_PROCESS_ENDPOINT)
      .pipe(
        catchError((error: any) => {
          console.error('Error loading workflow process data:', error);
          return of([]);
        })
      );
  }

 
  getWorkflowProcessByPageId(pageId: number): Observable<WorkflowProcessItem[]> {
    return this.getAllWorkflowProcess()
      .pipe(
        map((items: WorkflowProcessItem[]) => items.filter((item: WorkflowProcessItem) => item.page_id === pageId))
      );
  }

 
  getWorkflowProcessById(id: string): Observable<WorkflowProcessItem | null> {
    return this.http.get<WorkflowProcessItem>(`${this.WORKFLOW_PROCESS_ENDPOINT}/${id}`)
      .pipe(
        catchError((error: any) => {
          console.error(`Error loading workflow process item ${id}:`, error);
          return of(null);
        })
      );
  }


  updateWorkflowProcess(id: string, data: Partial<WorkflowProcessItem>): Observable<WorkflowProcessItem | null> {
    return this.http.put<WorkflowProcessItem>(`${this.WORKFLOW_PROCESS_ENDPOINT}/${id}`, data)
      .pipe(
        catchError((error: any) => {
          console.error(`Error updating workflow process item ${id}:`, error);
          return of(null);
        })
      );
  }


  updateWorkflowPosition(id: string, position: Position, additionalData?: Partial<WorkflowProcessItem>): Observable<WorkflowProcessItem | null> {
    const updateData: any = {
      ...additionalData,
      position,
      lastmodifiedby: 1,
      lastmodifieddate: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };

    return this.updateWorkflowProcess(id, updateData);
  }


  createWorkflowProcess(data: Partial<WorkflowProcessItem>): Observable<WorkflowProcessItem | null> {
    return this.http.post<WorkflowProcessItem>(this.WORKFLOW_PROCESS_ENDPOINT, data)
      .pipe(
        catchError((error: any) => {
          console.error('Error creating workflow process item:', error);
          return of(null);
        })
      );
  }

 
  deleteWorkflowProcess(id: string): Observable<boolean> {
    return this.http.delete(`${this.WORKFLOW_PROCESS_ENDPOINT}/${id}`)
      .pipe(
        map(() => true),
        catchError((error: any) => {
          console.error(`Error deleting workflow process item ${id}:`, error);
          return of(false);
        })
      );
  }


  getCanvasState(): Observable<SavedState | null> {
    return this.http.get<SavedState>(`${this.WORKFLOW_STATE_ENDPOINT}/${this.CANVAS_STATE_ID}`)
      .pipe(
        map((state: SavedState) => this.autoFixCanvasState(state)),
        catchError((error: any) => {
          console.log('No saved canvas state found');
          return of(null);
        })
      );
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
        
        // Arrange items horizontally (left to right)
        const defaultPosition = {
          x: this.DEFAULT_START_X + (index * this.DEFAULT_HORIZONTAL_SPACING),
          y: this.DEFAULT_START_Y
        };

        fixedItem.position = defaultPosition;


        if (fixedItem.properties) {
          fixedItem.properties.position = defaultPosition;
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
        next: () => console.log('Auto-fixed canvas state saved'),
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
    const stateWithId = { ...state, id: this.CANVAS_STATE_ID };

    return this.getCanvasStateRaw().pipe(
      switchMap((existingState: SavedState | null) => {
        if (existingState) {
          return this.updateCanvasState(stateWithId);
        } else {
          return this.createCanvasState(stateWithId);
        }
      }),
      catchError((error: any) => {
        console.error('Error saving canvas state:', error);
        return of(null);
      })
    );
  }


  private getCanvasStateRaw(): Observable<SavedState | null> {
    return this.http.get<SavedState>(`${this.WORKFLOW_STATE_ENDPOINT}/${this.CANVAS_STATE_ID}`)
      .pipe(
        catchError((error: any) => {
          return of(null);
        })
      );
  }


  private createCanvasState(state: SavedState): Observable<SavedState | null> {
    return this.http.post<SavedState>(this.WORKFLOW_STATE_ENDPOINT, state)
      .pipe(
        catchError((error: any) => {
          console.error('Error creating canvas state:', error);
          return of(null);
        })
      );
  }


  private updateCanvasState(state: SavedState): Observable<SavedState | null> {
    return this.http.put<SavedState>(`${this.WORKFLOW_STATE_ENDPOINT}/${this.CANVAS_STATE_ID}`, state)
      .pipe(
        catchError((error: any) => {
          console.error('Error updating canvas state:', error);
          return of(null);
        })
      );
  }


  deleteCanvasState(): Observable<boolean> {
    return this.http.delete(`${this.WORKFLOW_STATE_ENDPOINT}/${this.CANVAS_STATE_ID}`)
      .pipe(
        map(() => true),
        catchError((error: any) => {
          console.log('No canvas state to delete');
          return of(false);
        })
      );
  }


  createPropertiesFromWorkflow(workflowItem: WorkflowProcessItem, position: Position): WorkflowProperties {
    const props: any = { ...workflowItem };
    
  
    delete props.id;
    delete props.project_id;
    delete props.logical_module_id;
    delete props.page_id;
    
    
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
    startX: number = 120, 
    startY: number = 120, 
    spacing: number = 200  // Default to horizontal spacing
  ): Position {

    if (workflowItem.position && 
        this.isValidPosition(workflowItem.position) && 
        workflowItem.position.x !== 0 && 
        workflowItem.position.y !== 0) {
      return {
        x: workflowItem.position.x,
        y: workflowItem.position.y
      };
    }

    // Arrange items horizontally (left to right)
    return {
      x: startX + (index * spacing),
      y: startY
    };
  }

  sortBySequence(items: WorkflowProcessItem[]): WorkflowProcessItem[] {
    return [...items].sort((a: WorkflowProcessItem, b: WorkflowProcessItem) => (a.sequence || 0) - (b.sequence || 0));
  }
}