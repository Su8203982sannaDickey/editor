import { EventEmitter } from './EventEmitter';
import { SceneRegistry } from './SceneRegistry';
import { SelectionManager } from './SelectionManager';
import { NodeSchema } from './NodeSchema';

/**
 * EditorScene is the central coordinator for the editor.
 * It manages the node tree, coordinates between the registry,
 * selection manager, and renderer pipeline.
 */
export class EditorScene extends EventEmitter {
  private registry: SceneRegistry;
  private selectionManager: SelectionManager;
  private nodes: Map<string, NodeSchema> = new Map();
  private layers: string[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(
    canvas: HTMLCanvasElement,
    registry: SceneRegistry,
    selectionManager: SelectionManager
  ) {
    super();
    this.canvas = canvas;
    this.registry = registry;
    this.selectionManager = selectionManager;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context from canvas');
    }
    this.ctx = ctx;

    this.bindEvents();
  }

  /**
   * Bind canvas interaction events to scene handlers.
   */
  private bindEvents(): void {
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  /**
   * Add a node to the scene on a given layer.
   */
  addNode(node: NodeSchema, layerId: string): void {
    if (!this.layers.includes(layerId)) {
      throw new Error(`Layer "${layerId}" does not exist in this scene.`);
    }
    this.nodes.set(node.id, { ...node, layerId } as NodeSchema);
    this.emit('node:added', { node, layerId });
    this.render();
  }

  /**
   * Remove a node by ID.
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    this.nodes.delete(nodeId);
    this.selectionManager.deselect(nodeId);
    this.emit('node:removed', { nodeId });
    this.render();
  }

  /**
   * Register a layer by ID. Layers are rendered in insertion order.
   */
  addLayer(layerId: string): void {
    if (!this.layers.includes(layerId)) {
      this.layers.push(layerId);
      this.emit('layer:added', { layerId });
    }
  }

  /**
   * Render all nodes sorted by layer order.
   */
  render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const layerId of this.layers) {
      const layerNodes = Array.from(this.nodes.values()).filter(
        (n) => (n as any).layerId === layerId
      );

      for (const node of layerNodes) {
        const renderer = this.registry.getRenderer(node.type);
        if (renderer) {
          renderer.render(this.ctx, node, {
            selected: this.selectionManager.isSelected(node.id),
          });
        } else {
          console.warn(`No renderer registered for node type: "${node.type}"`);
        }
      }
    }

    this.emit('scene:rendered', {});
  }

  private handleClick(e: MouseEvent): void {
    const { offsetX, offsetY } = e;
    const hit = this.hitTest(offsetX, offsetY);
    if (hit) {
      if (e.shiftKey) {
        this.selectionManager.toggleSelect(hit.id);
      } else {
        this.selectionManager.selectOnly(hit.id);
      }
    } else {
      this.selectionManager.clearSelection();
    }
    this.render();
    this.emit('scene:click', { x: offsetX, y: offsetY, hit });
  }

  private handleMouseMove(e: MouseEvent): void {
    this.emit('scene:mousemove', { x: e.offsetX, y: e.offsetY });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selected = this.selectionManager.getSelectedIds();
      for (const id of selected) {
        this.removeNode(id);
      }
    }
    this.emit('scene:keydown', { key: e.key });
  }

  /**
   * Simple bounding-box hit test. Nodes must expose x, y, width, height.
   */
  private hitTest(x: number, y: number): NodeSchema | null {
    // Iterate in reverse layer order so topmost nodes are hit first
    for (const layerId of [...this.layers].reverse()) {
      const layerNodes = Array.from(this.nodes.values()).filter(
        (n) => (n as any).layerId === layerId
      );
      for (const node of layerNodes.reverse()) {
        const { x: nx, y: ny, width, height } = node as any;
        if (
          typeof nx === 'number' &&
          typeof ny === 'number' &&
          typeof width === 'number' &&
          typeof height === 'number'
        ) {
          if (x >= nx && x <= nx + width && y >= ny && y <= ny + height) {
            return node;
          }
        }
      }
    }
    return null;
  }

  getNodes(): NodeSchema[] {
    return Array.from(this.nodes.values());
  }

  getNode(id: string): NodeSchema | undefined {
    return this.nodes.get(id);
  }
}
