import { Component, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';

interface CanvasObject {
  id: number;
  type: 'rectangle' | 'circle' | 'triangle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
}

@Component({
  selector: 'app-canvawork',
  templateUrl: './canvawork.component.html',
  styleUrl: './canvawork.component.css'
})
export class CanvaworkComponent implements AfterViewInit {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private isPanning = false;
  private isDraggingObject = false;
  private lastX = 0;
  private lastY = 0;
  
  // Transform properties
  public offsetX = 0;
  public offsetY = 0;
  public scale = 1;
  
  // Zoom settings
  private readonly minScale = 0.1;
  private readonly maxScale = 10;
  private readonly zoomIntensity = 0.1;

  // Canvas objects
  private objects: CanvasObject[] = [];
  private selectedObject: CanvasObject | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private nextId = 1;

  ngAfterViewInit(): void {
    this.initCanvas();
    this.initializeObjects();
    this.draw();
  }

  private initializeObjects(): void {
    // Create sample objects
    this.objects = [
      {
        id: this.nextId++,
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        color: '#4CAF50'
      },
      {
        id: this.nextId++,
        type: 'circle',
        x: 300,
        y: 150,
        radius: 50,
        color: '#2196F3'
      },
      {
        id: this.nextId++,
        type: 'triangle',
        x: 500,
        y: 100,
        width: 100,
        height: 100,
        color: '#FF9800'
      }
    ];
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    
    // Set canvas size to match container
    this.resizeCanvas();
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      this.draw();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.resizeCanvas();
  }

  // Mouse wheel zoom
  public onWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Calculate world position before zoom
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;
    
    // Update scale
    const delta = -event.deltaY;
    const zoomFactor = delta > 0 ? 1 + this.zoomIntensity : 1 - this.zoomIntensity;
    const newScale = this.scale * zoomFactor;
    
    // Clamp scale
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    
    // Adjust offset to zoom towards mouse position
    this.offsetX = mouseX - worldX * this.scale;
    this.offsetY = mouseY - worldY * this.scale;
    
    this.draw();
  }

  // Mouse down - start dragging object or panning
  public onMouseDown(event: MouseEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;
    
    // Check if clicking on an object
    this.selectedObject = this.getObjectAtPosition(worldX, worldY);
    
    if (this.selectedObject) {
      this.isDraggingObject = true;
      this.dragOffsetX = worldX - this.selectedObject.x;
      this.dragOffsetY = worldY - this.selectedObject.y;
      canvas.style.cursor = 'move';
    } else {
      this.isPanning = true;
      canvas.style.cursor = 'grabbing';
    }
    
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }

  // Mouse move - move object or pan canvas
  public onMouseMove(event: MouseEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    if (this.isDraggingObject && this.selectedObject) {
      // Move the selected object
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;
      
      this.selectedObject.x = worldX - this.dragOffsetX;
      this.selectedObject.y = worldY - this.dragOffsetY;
      
      this.draw();
    } else if (this.isPanning) {
      // Pan the canvas
      const deltaX = event.clientX - this.lastX;
      const deltaY = event.clientY - this.lastY;
      
      this.offsetX += deltaX;
      this.offsetY += deltaY;
      
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      
      this.draw();
    } else {
      // Update cursor based on hover
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;
      const hoveredObject = this.getObjectAtPosition(worldX, worldY);
      
      canvas.style.cursor = hoveredObject ? 'pointer' : 'grab';
    }
  }

  // Mouse up - stop dragging
  public onMouseUp(): void {
    this.isDraggingObject = false;
    this.isPanning = false;
    this.selectedObject = null;
    
    const canvas = this.canvasRef.nativeElement;
    canvas.style.cursor = 'grab';
  }

  // Mouse leave - stop dragging
  public onMouseLeave(): void {
    this.isDraggingObject = false;
    this.isPanning = false;
    this.selectedObject = null;
    
    const canvas = this.canvasRef.nativeElement;
    canvas.style.cursor = 'grab';
  }

  // Reset view
  public resetView(): void {
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
    this.draw();
  }

  // Get object at position (returns topmost object)
  private getObjectAtPosition(x: number, y: number): CanvasObject | null {
    // Check in reverse order (topmost first)
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      
      if (obj.type === 'rectangle') {
        if (x >= obj.x && x <= obj.x + obj.width! &&
            y >= obj.y && y <= obj.y + obj.height!) {
          return obj;
        }
      } else if (obj.type === 'circle') {
        const dx = x - obj.x;
        const dy = y - obj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= obj.radius!) {
          return obj;
        }
      } else if (obj.type === 'triangle') {
        // Simple bounding box check for triangle
        const width = obj.width || 100;
        const height = obj.height || 100;
        if (x >= obj.x - width/2 && x <= obj.x + width/2 &&
            y >= obj.y && y <= obj.y + height) {
          return obj;
        }
      }
    }
    return null;
  }

  // Add new object - public methods
  public addRectangle(): void {
    this.objects.push({
      id: this.nextId++,
      type: 'rectangle',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      color: this.getRandomColor()
    });
    this.draw();
  }

  public addCircle(): void {
    this.objects.push({
      id: this.nextId++,
      type: 'circle',
      x: 150,
      y: 150,
      radius: 50,
      color: this.getRandomColor()
    });
    this.draw();
  }

  public addTriangle(): void {
    this.objects.push({
      id: this.nextId++,
      type: 'triangle',
      x: 200,
      y: 100,
      width: 100,
      height: 100,
      color: this.getRandomColor()
    });
    this.draw();
  }

  private getRandomColor(): string {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FF5722'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Zoom in
  public zoomIn(): void {
    const canvas = this.canvasRef.nativeElement;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    const worldX = (centerX - this.offsetX) / this.scale;
    const worldY = (centerY - this.offsetY) / this.scale;
    
    this.scale = Math.min(this.maxScale, this.scale * 1.2);
    
    this.offsetX = centerX - worldX * this.scale;
    this.offsetY = centerY - worldY * this.scale;
    
    this.draw();
  }

  // Zoom out
  public zoomOut(): void {
    const canvas = this.canvasRef.nativeElement;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    const worldX = (centerX - this.offsetX) / this.scale;
    const worldY = (centerY - this.offsetY) / this.scale;
    
    this.scale = Math.max(this.minScale, this.scale / 1.2);
    
    this.offsetX = centerX - worldX * this.scale;
    this.offsetY = centerY - worldY * this.scale;
    
    this.draw();
  }

  // Draw content on canvas
  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context state
    ctx.save();
    
    // Apply transformations
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    
    // Draw all objects
    this.drawObjects();
    
    // Restore context state
    ctx.restore();
    
    // Draw UI overlay (scale indicator)
    this.drawOverlay();
  }

  private drawObjects(): void {
    const ctx = this.ctx;
    
    this.objects.forEach(obj => {
      ctx.save();
      
      if (obj.type === 'rectangle') {
        ctx.fillStyle = obj.color;
        ctx.fillRect(obj.x, obj.y, obj.width!, obj.height!);
        
        // Draw border if selected
        if (this.selectedObject?.id === obj.id) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2 / this.scale;
          ctx.strokeRect(obj.x, obj.y, obj.width!, obj.height!);
        }
      } else if (obj.type === 'circle') {
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius!, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw border if selected
        if (this.selectedObject?.id === obj.id) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2 / this.scale;
          ctx.stroke();
        }
      } else if (obj.type === 'triangle') {
        const width = obj.width || 100;
        const height = obj.height || 100;
        
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.moveTo(obj.x, obj.y);
        ctx.lineTo(obj.x - width/2, obj.y + height);
        ctx.lineTo(obj.x + width/2, obj.y + height);
        ctx.closePath();
        ctx.fill();
        
        // Draw border if selected
        if (this.selectedObject?.id === obj.id) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2 / this.scale;
          ctx.stroke();
        }
      }
      
      ctx.restore();
    });
  }

  private drawOverlay(): void {
    const ctx = this.ctx;
    const canvas = this.canvasRef.nativeElement;
    
    // Draw zoom level indicator
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 120, 30);
    
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.fillText(`Zoom: ${(this.scale * 100).toFixed(0)}%`, 20, 30);
  }
}