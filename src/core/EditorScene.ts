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
   * Note: missing renderers are silently skipped — the console.warn was too
   * noisy during development when experimenting with unregistered node types.
   * TODO: might want to add a debug flag later to re-enable those warnings
   * when tracking down missing renderer registrations.
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
            selected: this.selectionManager.isSelect