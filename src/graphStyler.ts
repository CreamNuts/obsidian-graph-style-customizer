import { App, WorkspaceLeaf, TFile } from 'obsidian';
import { GraphStyleSettings, GraphRenderer, EdgeColorMode, NodeShape, StyleRule, NodeStyleResult } from './types';
import { NeighborFinder } from './neighborFinder';

export class GraphStyler {
	private leaf: WorkspaceLeaf;
	private settings: GraphStyleSettings;
	private app: App;
	private neighborFinder: NeighborFinder;
	private lastActiveNodeId: string | null = null;
	private isInitialized: boolean = false;

	// Style tracking
	private nodeStyles: Map<string, NodeStyleResult> = new Map();
	private edgeStyles: Map<any, { tint: number; alpha: number; width: number }> = new Map();

	// Cache for hop levels
	private nodeHopLevels: Map<string, number> = new Map();

	// Note: We no longer store original scales for nodes or edges
	// Obsidian dynamically manages scale based on zoom level
	// We only multiply the current scale when our multiplier != 1.0

	// Proxy tracking - store original methods to restore later
	private proxiedNodes: Set<string> = new Set();
	private proxiedLinks: Set<any> = new Set();
	private originalRenderMethods: Map<string, (...args: any[]) => any> = new Map();
	private originalLinkRenderMethods: Map<any, (...args: any[]) => any> = new Map();

	constructor(leaf: WorkspaceLeaf, settings: GraphStyleSettings, app: App) {
		this.leaf = leaf;
		this.settings = settings;
		this.app = app;
		this.neighborFinder = new NeighborFinder();

		this.initialize();
	}

	private initialize() {
		const renderer = this.getRenderer();
		if (renderer?.nodes) {
			this.isInitialized = true;
			this.applyStyles();
		} else {
			setTimeout(() => this.initialize(), 200);
		}
	}

	private getRenderer(): GraphRenderer | null {
		try {
			const view = this.leaf.view as any;
			return view?.renderer || view?.dataEngine || view?.engine || null;
		} catch (e) {
			return null;
		}
	}

	private getNodeEntries(nodes: any): [string, any][] {
		const entries: [string, any][] = [];
		if (!nodes) return entries;

		try {
			if (nodes instanceof Map) {
				nodes.forEach((node, id) => entries.push([id, node]));
			} else if (Array.isArray(nodes)) {
				nodes.forEach(node => {
					if (node?.id) entries.push([node.id, node]);
				});
			} else if (typeof nodes === 'object') {
				Object.entries(nodes).forEach(([id, node]) => {
					entries.push([id, node as any]);
				});
			}
		} catch (e) {}

		return entries;
	}

	private getActiveFile(): TFile | null {
		const viewType = this.leaf.view.getViewType();

		if (viewType === 'localgraph') {
			const view = this.leaf.view as any;
			if (view.file?.path) {
				return this.app.vault.getAbstractFileByPath(view.file.path) as TFile;
			}
		}

		return this.app.workspace.getActiveFile();
	}

	/**
	 * Setup render proxy on a node - this is the key technique from extended-graph
	 * By proxying the render method, we can apply our styles AFTER each render
	 */
	private setupRenderProxy(nodeId: string, node: any) {
		if (this.proxiedNodes.has(nodeId)) return;
		if (!node || typeof node.render !== 'function') return;

		// Save original render method
		const originalRender = node.render.bind(node);
		this.originalRenderMethods.set(nodeId, originalRender);

		// Create proxy - apply our styles after each render
		const self = this;
		node.render = function(...args: any[]) {
			// Call original render first
			const result = originalRender(...args);

			// Then apply our custom styles
			if (self.settings.enabled) {
				const style = self.nodeStyles.get(nodeId);
				if (style && node.circle) {
					node.circle.tint = style.tint;
					node.circle.alpha = style.alpha;

					// Apply size scaling relative to Obsidian's current scale
					// Obsidian dynamically adjusts scale based on zoom level
					// We multiply their scale by our multiplier
					const multiplier = style.size || 1.0;
					if (multiplier !== 1.0 && node.circle.scale) {
						node.circle.scale.x *= multiplier;
						node.circle.scale.y *= multiplier;
					}

					if (node.text) {
						node.text.alpha = style.alpha;
					}
				}
			}

			return result;
		};

		this.proxiedNodes.add(nodeId);
	}

	/**
	 * Setup render proxy on a link
	 * IMPORTANT: We only modify scale.y (thickness), NOT scale.x (length)
	 * Both are dynamically managed by Obsidian - we only multiply when width != 1.0
	 */
	private setupLinkRenderProxy(link: any) {
		if (this.proxiedLinks.has(link)) return;
		if (!link || typeof link.render !== 'function') return;

		// Save original render method
		const originalRender = link.render.bind(link);
		this.originalLinkRenderMethods.set(link, originalRender);

		// Create proxy - apply our styles after each render
		const self = this;
		link.render = function(...args: any[]) {
			// Call original render first
			const result = originalRender(...args);

			// Then apply our custom styles
			if (self.settings.enabled) {
				const style = self.edgeStyles.get(link);
				if (style) {
					// Apply line styles
					if (link.line) {
						link.line.tint = style.tint;
						link.line.alpha = style.alpha;
						// Apply width via scale.y only (thickness)
						// Only modify if width != 1.0, to preserve Obsidian's dynamic scaling
						if (style.width !== 1.0 && link.line.scale) {
							link.line.scale.y *= style.width;
						}
					}
					// Apply arrow color only
					// Don't modify arrow scale (affects position/rotation)
					// Don't modify arrow alpha (Obsidian controls visibility based on zoom level)
					if (link.arrow) {
						link.arrow.tint = style.tint;
					}
				}
			}

			return result;
		};

		this.proxiedLinks.add(link);
	}

	/**
	 * Calculate and cache styles based on hop distance
	 */
	applyStyles(): void {
		if (!this.settings.enabled) {
			this.clearStyles();
			return;
		}

		const renderer = this.getRenderer();
		if (!renderer?.nodes) return;

		const activeFile = this.getActiveFile();
		let activeNodeId: string;

		if (activeFile) {
			activeNodeId = activeFile.path;
			this.lastActiveNodeId = activeNodeId;
		} else if (this.lastActiveNodeId) {
			activeNodeId = this.lastActiveNodeId;
		} else {
			return;
		}

		// Build neighbor graph
		this.neighborFinder.buildFromNodes(renderer.nodes);

		// Calculate hop distances
		const neighborsByHop = this.neighborFinder.findNeighborsByHop(
			activeNodeId,
			this.settings.maxHops
		);
		const allConnected = this.neighborFinder.getAllConnectedNodes(activeNodeId);

		// Clear and rebuild hop level cache
		this.nodeHopLevels.clear();

		// Calculate and cache styles for all nodes
		const nodeEntries = this.getNodeEntries(renderer.nodes);

		nodeEntries.forEach(([nodeId, node]) => {
			// Setup render proxy for this node (idempotent)
			this.setupRenderProxy(nodeId, node);

			let color: string;
			let alpha: number;
			let shape: NodeShape | undefined;
			let size: number | undefined;

			// Calculate hop level for this node
			let hopLevel = 0;
			if (nodeId === activeNodeId) {
				hopLevel = 0; // Active node is hop 0
			} else {
				for (let hop = 1; hop <= this.settings.maxHops; hop++) {
					if (neighborsByHop.get(hop)?.has(nodeId)) {
						hopLevel = hop;
						break;
					}
				}
				if (hopLevel === 0 && allConnected.has(nodeId)) {
					hopLevel = this.settings.maxHops + 1; // Beyond maxHops but connected
				} else if (hopLevel === 0) {
					hopLevel = -1; // Disconnected
				}
			}
			this.nodeHopLevels.set(nodeId, hopLevel);

			// Get style from rules (if any)
			const ruleStyle = this.getStyleFromRules(nodeId);

			if (nodeId === activeNodeId) {
				// Active node
				color = this.settings.selectedNodeColor;
				alpha = 1.0;
				size = this.settings.activeNodeSize;
			} else if (hopLevel > 0 && hopLevel <= this.settings.maxHops) {
				// N-hop neighbor
				color = ruleStyle?.color || this.settings.hopColors[hopLevel - 1] || this.settings.hopColors[0];
				alpha = 1.0;
			} else if (hopLevel === -1) {
				// Disconnected
				color = ruleStyle?.color || '#888888';
				alpha = this.settings.disconnectedOpacity;
			} else {
				// Connected but beyond maxHops
				color = ruleStyle?.color || '#888888';
				alpha = 0.5;
			}

			// Apply rule shape/size if available
			shape = ruleStyle?.shape || this.settings.defaultNodeShape;
			if (size === undefined) {
				size = ruleStyle?.size || this.settings.defaultNodeSize;
			}

			// Cache the style
			this.nodeStyles.set(nodeId, {
				tint: this.parseColor(color),
				alpha: alpha,
				shape: shape,
				size: size
			});

			// Apply immediately as well (for initial render)
			if (node.circle) {
				node.circle.tint = this.parseColor(color);
				node.circle.alpha = alpha;

				// Apply size scaling relative to Obsidian's current scale
				// Only modify if multiplier is not 1.0
				// The render proxy will handle ongoing scaling
				const multiplier = size || 1.0;
				if (multiplier !== 1.0 && node.circle.scale) {
					node.circle.scale.x *= multiplier;
					node.circle.scale.y *= multiplier;
				}

				if (node.text) {
					node.text.alpha = alpha;
				}
			}
		});

		// Apply edge styles
		this.applyEdgeStyles(renderer, activeNodeId, neighborsByHop);

		// Trigger a re-render
		if (renderer.changed) {
			renderer.changed();
		}
	}

	private applyEdgeStyles(
		renderer: GraphRenderer,
		activeNodeId: string,
		neighborsByHop: Map<number, Set<string>>
	): void {
		if (!renderer.links) return;

		renderer.links.forEach((link) => {
			// Setup render proxy for this link
			this.setupLinkRenderProxy(link);

			const sourceId = link.source?.id;
			const targetId = link.target?.id;
			const sourceIsActive = sourceId === activeNodeId;
			const targetIsActive = targetId === activeNodeId;
			const sourceInRange = this.isInRange(sourceId, neighborsByHop);
			const targetInRange = this.isInRange(targetId, neighborsByHop);

			let tint: number;
			let alpha: number;
			let width: number;

			// Determine edge style based on EdgeColorMode
			switch (this.settings.edgeColorMode) {
				case EdgeColorMode.INHERIT:
					// Inherit from source node color
					const sourceStyle = this.nodeStyles.get(sourceId || '');
					tint = sourceStyle?.tint ?? this.parseColor('#888888');
					if (sourceIsActive || targetIsActive) {
						alpha = 1.0;
						width = this.settings.activeEdgeWidth;
					} else if (sourceInRange && targetInRange) {
						alpha = Math.min(sourceStyle?.alpha ?? 0.8, 0.8);
						width = this.settings.defaultEdgeWidth;
					} else {
						alpha = this.settings.disconnectedOpacity;
						width = this.settings.disconnectedEdgeWidth;
					}
					break;

				case EdgeColorMode.BY_HOP:
					// Color by hop distance (use the closer node's hop level)
					const sourceHop = this.nodeHopLevels.get(sourceId || '') ?? -1;
					const targetHop = this.nodeHopLevels.get(targetId || '') ?? -1;

					if (sourceIsActive || targetIsActive) {
						// Edge connected to active node uses 1-hop color
						tint = this.parseColor(this.settings.hopEdgeColors[0] || this.settings.edgeColor);
						alpha = 1.0;
						width = this.settings.activeEdgeWidth;
					} else {
						// Calculate hop level for this edge
						const minHop = Math.min(
							sourceHop > 0 ? sourceHop : Infinity,
							targetHop > 0 ? targetHop : Infinity
						);

						if (minHop <= this.settings.maxHops) {
							tint = this.parseColor(this.settings.hopEdgeColors[minHop - 1] || this.settings.edgeColor);
							alpha = 0.7;
							width = this.settings.defaultEdgeWidth;
						} else if (minHop !== Infinity) {
							// Beyond maxHops but still connected
							tint = this.parseColor(this.settings.edgeColor);
							alpha = 0.4;
							width = this.settings.disconnectedEdgeWidth;
						} else {
							// Neither in range (disconnected)
							tint = this.parseColor(this.settings.edgeColor);
							alpha = this.settings.disconnectedOpacity;
							width = this.settings.disconnectedEdgeWidth;
						}
					}
					break;

				case EdgeColorMode.SINGLE:
				default:
					// Single color for all edges
					if (sourceIsActive || targetIsActive) {
						tint = this.parseColor(this.settings.highlightedEdgeColor);
						alpha = 1.0;
						width = this.settings.activeEdgeWidth;
					} else if (sourceInRange && targetInRange) {
						tint = this.parseColor(this.settings.edgeColor);
						alpha = 0.8;
						width = this.settings.defaultEdgeWidth;
					} else {
						tint = this.parseColor(this.settings.edgeColor);
						alpha = this.settings.disconnectedOpacity;
						width = this.settings.disconnectedEdgeWidth;
					}
					break;
			}

			// Cache the style
			this.edgeStyles.set(link, { tint, alpha, width });

			// Apply immediately as well
			if (link.line) {
				link.line.tint = tint;
				link.line.alpha = alpha;
				// Apply width via scale.y only (thickness)
				// Only modify if width != 1.0, to preserve Obsidian's dynamic scaling
				if (width !== 1.0 && link.line.scale) {
					link.line.scale.y *= width;
				}
			}

			// Apply arrow color only
			// Don't modify arrow scale (affects position/rotation)
			// Don't modify arrow alpha (Obsidian controls visibility based on zoom level)
			if ((link as any).arrow) {
				(link as any).arrow.tint = tint;
			}
		});
	}

	private isInRange(nodeId: string | undefined, neighborsByHop: Map<number, Set<string>>): boolean {
		if (!nodeId) return false;
		for (let hop = 1; hop <= this.settings.maxHops; hop++) {
			if (neighborsByHop.get(hop)?.has(nodeId)) return true;
		}
		return false;
	}

	/**
	 * Get style from unified rules (color, shape, size)
	 * Rules are checked in order - first match wins (priority by index)
	 */
	private getStyleFromRules(nodeId: string): { color?: string; shape?: NodeShape; size?: number } | null {
		if (!this.settings.rules || this.settings.rules.length === 0) {
			return null;
		}

		const file = this.app.vault.getAbstractFileByPath(nodeId);

		// Check rules in order (index 0 has highest priority)
		for (const rule of this.settings.rules) {
			if (!rule.enabled) continue;

			let matches = false;

			switch (rule.type) {
				case 'folder':
					// Match if nodeId starts with the folder path
					matches = nodeId.startsWith(rule.pattern);
					break;

				case 'tag':
					// Match if file has the tag
					matches = this.hasTag(file, rule.pattern);
					break;

				case 'file':
					// Match exact file path or filename
					matches = nodeId === rule.pattern ||
						nodeId.endsWith('/' + rule.pattern) ||
						nodeId === rule.pattern + '.md' ||
						nodeId.endsWith('/' + rule.pattern + '.md');
					break;
			}

			if (matches) {
				return {
					color: rule.color,
					shape: rule.shape,
					size: rule.size
				};
			}
		}

		return null;
	}

	/**
	 * Check if a file has a specific tag
	 */
	private hasTag(file: any, tagPattern: string): boolean {
		if (!(file instanceof TFile)) return false;

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return false;

		// Normalize tag pattern (ensure it starts with #)
		const normalizedPattern = tagPattern.startsWith('#') ? tagPattern : '#' + tagPattern;

		// Check inline tags
		if (cache.tags) {
			for (const tagCache of cache.tags) {
				if (tagCache.tag === normalizedPattern || tagCache.tag.startsWith(normalizedPattern + '/')) {
					return true;
				}
			}
		}

		// Check frontmatter tags
		if (cache.frontmatter?.tags) {
			const fmTags = Array.isArray(cache.frontmatter.tags)
				? cache.frontmatter.tags
				: [cache.frontmatter.tags];
			for (const tag of fmTags) {
				const normalizedTag = tag.startsWith('#') ? tag : '#' + tag;
				if (normalizedTag === normalizedPattern || normalizedTag.startsWith(normalizedPattern + '/')) {
					return true;
				}
			}
		}

		return false;
	}

	private parseColor(color: string): number {
		if (color.startsWith('#')) {
			return parseInt(color.slice(1), 16);
		}
		return 0xFFFFFF;
	}

	private clearStyles(): void {
		this.nodeStyles.clear();
		this.edgeStyles.clear();
		this.nodeHopLevels.clear();

		// Restore original alpha values
		// Note: Scale is managed by Obsidian dynamically, we don't store/restore it
		const renderer = this.getRenderer();
		if (renderer?.nodes) {
			const nodeEntries = this.getNodeEntries(renderer.nodes);
			nodeEntries.forEach(([nodeId, node]) => {
				if (node.circle) {
					node.circle.alpha = 1;
				}
				if (node.text) node.text.alpha = 1;
			});
		}
		if (renderer?.links) {
			renderer.links.forEach((link) => {
				if (link.line) {
					link.line.alpha = 1;
				}
			});
		}
	}

	cleanup(): void {
		// Restore original render methods for nodes
		const renderer = this.getRenderer();
		if (renderer?.nodes) {
			const nodeEntries = this.getNodeEntries(renderer.nodes);
			nodeEntries.forEach(([nodeId, node]) => {
				const originalRender = this.originalRenderMethods.get(nodeId);
				if (originalRender && node) {
					node.render = originalRender;
				}
			});
		}

		// Restore original render methods for links
		if (renderer?.links) {
			renderer.links.forEach((link) => {
				const originalRender = this.originalLinkRenderMethods.get(link);
				if (originalRender) {
					link.render = originalRender;
				}
			});
		}

		this.clearStyles();
		this.proxiedNodes.clear();
		this.proxiedLinks.clear();
		this.originalRenderMethods.clear();
		this.originalLinkRenderMethods.clear();
		this.nodeHopLevels.clear();
	}

	updateSettings(settings: GraphStyleSettings): void {
		this.settings = settings;
		this.applyStyles();
	}
}
