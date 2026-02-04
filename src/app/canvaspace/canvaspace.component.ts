import { Component, OnInit, ViewChild, ElementRef, HostListener, AfterViewInit } from '@angular/core';

interface CanvasObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'rectangle' | 'circle' | 'text';
  color: string;
  text?: string;
}

@Component({
  selector: 'app-canvaspace',
  templateUrl: './canvaspace.component.html',
  styleUrl: './canvaspace.component.css'
})
export class CanvaspaceComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private objects: CanvasObject[] = [];
  
  // Pan and Zoom properties
  public scale = 1;
  public offsetX = 0;
  public offsetY = 0;
  
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastX = 0;
  private lastY = 0;
  
  // Grid properties
  private gridSize = 50;
  private showGrid = true;
  
  // Selected object
  private selectedObject: CanvasObject | null = null;
  private isMovingObject = false;
  
  // Canvas bounds for infinite scrolling
  private minX = -10000;
  private maxX = 10000;
  private minY = -10000;
  private maxY = 10000;

  ngOnInit(): void {
    // Initialize with some sample objects
    this.objects = [
      { id: '1', x: 100, y: 100, width: 100, height: 100, type: 'rectangle', color: '#3498db' },
      { id: '2', x: 300, y: 150, width: 80, height: 80, type: 'circle', color: '#e74c3c' },
      { id: '3', x: 150, y: 300, width: 150, height: 50, type: 'text', color: '#2ecc71', text: 'Hello Canvas!' }
    ];
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
    this.render();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.resizeCanvas();
    this.render();
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  // Mouse wheel for zooming
  onMouseWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Get world coordinates before zoom
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;
    
    // Calculate new scale
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, this.scale * zoomFactor));
    
    // Adjust offset to zoom towards mouse position
    this.offsetX = mouseX - worldX * newScale;
    this.offsetY = mouseY - worldY * newScale;
    this.scale = newScale;
    
    this.render();
  }

  // Mouse down - start dragging
  onMouseDown(event: MouseEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Convert to world coordinates
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;
    
    // Check if clicking on an object
    const clickedObject = this.getObjectAtPosition(worldX, worldY);
    
    if (clickedObject) {
      this.selectedObject = clickedObject;
      this.isMovingObject = true;
      this.dragStartX = worldX - clickedObject.x;
      this.dragStartY = worldY - clickedObject.y;
    } else {
      // Start panning the canvas
      this.isDragging = true;
      this.dragStartX = mouseX - this.offsetX;
      this.dragStartY = mouseY - this.offsetY;
    }
    
    this.lastX = mouseX;
    this.lastY = mouseY;
  }

  // Mouse move - drag canvas or object
  onMouseMove(event: MouseEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    if (this.isMovingObject && this.selectedObject) {
      // Move the selected object
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;
      
      this.selectedObject.x = worldX - this.dragStartX;
      this.selectedObject.y = worldY - this.dragStartY;
      
      this.render();
    } else if (this.isDragging) {
      // Pan the canvas
      this.offsetX = mouseX - this.dragStartX;
      this.offsetY = mouseY - this.dragStartY;
      
      this.render();
    }
    
    this.lastX = mouseX;
    this.lastY = mouseY;
  }

  // Mouse up - stop dragging
  onMouseUp(event: MouseEvent): void {
    this.isDragging = false;
    this.isMovingObject = false;
  }

  // Get object at position
  private getObjectAtPosition(x: number, y: number): CanvasObject | null {
    // Check in reverse order (top to bottom)
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      
      if (obj.type === 'rectangle') {
        if (x >= obj.x && x <= obj.x + obj.width &&
            y >= obj.y && y <= obj.y + obj.height) {
          return obj;
        }
      } else if (obj.type === 'circle') {
        const centerX = obj.x + obj.width / 2;
        const centerY = obj.y + obj.height / 2;
        const radius = obj.width / 2;
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distance <= radius) {
          return obj;
        }
      } else if (obj.type === 'text') {
        if (x >= obj.x && x <= obj.x + obj.width &&
            y >= obj.y && y <= obj.y + obj.height) {
          return obj;
        }
      }
    }
    
    return null;
  }

  // Render the canvas
  private render(): void {
    if (!this.ctx) return;
    
    const canvas = this.canvasRef.nativeElement;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context state
    this.ctx.save();
    
    // Apply transformations
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
    
    // Draw grid
    if (this.showGrid) {
      this.drawGrid();
    }
    
    // Draw objects
    this.objects.forEach(obj => this.drawObject(obj));
    
    // Restore context state
    this.ctx.restore();
    
    // Draw UI overlay
    this.drawUIOverlay();
  }

  // Draw infinite grid
  private drawGrid(): void {
    const canvas = this.canvasRef.nativeElement;
    
    // Calculate visible world bounds
    const startX = Math.floor((-this.offsetX / this.scale) / this.gridSize) * this.gridSize;
    const endX = Math.ceil((canvas.width - this.offsetX) / this.scale / this.gridSize) * this.gridSize;
    const startY = Math.floor((-this.offsetY / this.scale) / this.gridSize) * this.gridSize;
    const endY = Math.ceil((canvas.height - this.offsetY) / this.scale / this.gridSize) * this.gridSize;
    
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 1 / this.scale;
    
    // Draw vertical lines
    for (let x = startX; x <= endX; x += this.gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, startY);
      this.ctx.lineTo(x, endY);
      this.ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let y = startY; y <= endY; y += this.gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(endX, y);
      this.ctx.stroke();
    }
    
    // Draw origin axes
    this.ctx.strokeStyle = '#999999';
    this.ctx.lineWidth = 2 / this.scale;
    
    // X-axis
    this.ctx.beginPath();
    this.ctx.moveTo(startX, 0);
    this.ctx.lineTo(endX, 0);
    this.ctx.stroke();
    
    // Y-axis
    this.ctx.beginPath();
    this.ctx.moveTo(0, startY);
    this.ctx.lineTo(0, endY);
    this.ctx.stroke();
  }

  // Draw individual object
  private drawObject(obj: CanvasObject): void {
    this.ctx.fillStyle = obj.color;
    this.ctx.strokeStyle = this.selectedObject?.id === obj.id ? '#000000' : obj.color;
    this.ctx.lineWidth = this.selectedObject?.id === obj.id ? 3 / this.scale : 1 / this.scale;
    
    if (obj.type === 'rectangle') {
      this.ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      if (this.selectedObject?.id === obj.id) {
        this.ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
      }
    } else if (obj.type === 'circle') {
      const centerX = obj.x + obj.width / 2;
      const centerY = obj.y + obj.height / 2;
      const radius = obj.width / 2;
      
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.ctx.fill();
      
      if (this.selectedObject?.id === obj.id) {
        this.ctx.stroke();
      }
    } else if (obj.type === 'text') {
      this.ctx.font = `${20 / this.scale}px Arial`;
      this.ctx.fillText(obj.text || '', obj.x, obj.y + 20);
      
      if (this.selectedObject?.id === obj.id) {
        this.ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
      }
    }
  }

  // Draw UI overlay (zoom level, coordinates)
  private drawUIOverlay(): void {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(10, 10, 150, 60);
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText(`Zoom: ${(this.scale * 100).toFixed(0)}%`, 20, 30);
    this.ctx.fillText(`X: ${(-this.offsetX / this.scale).toFixed(0)}`, 20, 50);
    this.ctx.fillText(`Y: ${(-this.offsetY / this.scale).toFixed(0)}`, 20, 65);
    this.ctx.restore();
  }

  // Public methods for controls
  zoomIn(): void {
    this.scale = Math.min(5, this.scale * 1.2);
    this.render();
  }

  zoomOut(): void {
    this.scale = Math.max(0.1, this.scale / 1.2);
    this.render();
  }

  resetZoom(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.render();
  }

  toggleGrid(): void {
    this.showGrid = !this.showGrid;
    this.render();
  }

  addRectangle(): void {
    const newRect: CanvasObject = {
      id: Date.now().toString(),
      x: (-this.offsetX / this.scale) + 50,
      y: (-this.offsetY / this.scale) + 50,
      width: 100,
      height: 100,
      type: 'rectangle',
      color: this.getRandomColor()
    };
    this.objects.push(newRect);
    this.render();
  }

  addCircle(): void {
    const newCircle: CanvasObject = {
      id: Date.now().toString(),
      x: (-this.offsetX / this.scale) + 50,
      y: (-this.offsetY / this.scale) + 50,
      width: 100,
      height: 100,
      type: 'circle',
      color: this.getRandomColor()
    };
    this.objects.push(newCircle);
    this.render();
  }

  private getRandomColor(): string {
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  deleteSelected(): void {
    if (this.selectedObject) {
      this.objects = this.objects.filter(obj => obj.id !== this.selectedObject!.id);
      this.selectedObject = null;
      this.render();
    }
  }
}