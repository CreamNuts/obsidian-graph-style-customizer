// ============================================================
// Node Shape Types
// ============================================================

export enum NodeShape {
	CIRCLE = 'circle',
	SQUARE = 'square',
	DIAMOND = 'diamond',
	TRIANGLE = 'triangle',
	HEXAGON = 'hexagon',
}

// Polygon vertices for each shape (radius 1, center at 0,0)
export const SHAPE_VERTICES: Record<NodeShape, number[]> = {
	[NodeShape.CIRCLE]: [], // Uses drawCircle
	[NodeShape.SQUARE]: [-1, -1, 1, -1, 1, 1, -1, 1],
	[NodeShape.DIAMOND]: [0, -1, 1, 0, 0, 1, -1, 0],
	[NodeShape.TRIANGLE]: [0, -1, 0.866, 0.5, -0.866, 0.5],
	[NodeShape.HEXAGON]: [0.866, -0.5, 0.866, 0.5, 0, 1, -0.866, 0.5, -0.866, -0.5, 0, -1],
};

// ============================================================
// Edge Color Mode
// ============================================================

export enum EdgeColorMode {
	INHERIT = 'inherit',   // Inherit from source node color
	BY_HOP = 'by-hop',     // Color by hop distance
	SINGLE = 'single',     // Single color for all edges
}

// ============================================================
// Unified Rules System
// ============================================================

export type RuleType = 'tag' | 'folder' | 'file';

export interface StyleRule {
	id: string;              // Unique ID (uuid)
	type: RuleType;          // Rule type
	pattern: string;         // Match pattern (#tag, folder/, file.md)
	color?: string;          // Node color (optional)
	shape?: NodeShape;       // Node shape (optional)
	size?: number;           // Node size multiplier (optional, 0.5-2.0)
	enabled: boolean;        // Whether rule is active
}

// Legacy rule types (for migration)
export interface TagRule {
	tag: string;
	color: string;
}

export interface FolderRule {
	folder: string;
	color: string;
}

// ============================================================
// Presets
// ============================================================

export interface StylePreset {
	name: string;
	settings: Partial<GraphStyleSettings>;
}

// ============================================================
// Main Settings Interface
// ============================================================

export interface GraphStyleSettings {
	enabled: boolean;
	maxHops: number;

	// Node color settings
	selectedNodeColor: string;
	hopColors: string[];
	disconnectedOpacity: number;

	// Node shape & size
	defaultNodeShape: NodeShape;
	defaultNodeSize: number;       // Default size multiplier (1.0)
	activeNodeSize: number;        // Active node size multiplier (1.2)

	// Edge settings
	edgeColorMode: EdgeColorMode;
	edgeColor: string;             // Used for SINGLE mode
	highlightedEdgeColor: string;  // Used for active edges (legacy, kept for compatibility)
	hopEdgeColors: string[];       // Used for BY_HOP mode

	// Edge width settings
	activeEdgeWidth: number;       // Width for edges connected to active node (default: 2.0)
	defaultEdgeWidth: number;      // Width for edges within hop range (default: 1.0)
	disconnectedEdgeWidth: number; // Width for disconnected edges (default: 0.5)

	// Scope
	applyToGlobalGraph: boolean;
	applyToLocalGraph: boolean;

	// Presets
	presets: StylePreset[];
	activePreset: string | null;

	// Unified Rules (replaces tagRules, folderRules)
	rules: StyleRule[];

	// Legacy fields (kept for migration, will be removed)
	tagRules?: TagRule[];
	folderRules?: FolderRule[];
}

export const DEFAULT_SETTINGS: GraphStyleSettings = {
	enabled: true,
	maxHops: 3,

	// Node colors
	selectedNodeColor: '#FF6B6B',
	hopColors: ['#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
	disconnectedOpacity: 0.15,

	// Node shape & size
	defaultNodeShape: NodeShape.CIRCLE,
	defaultNodeSize: 1.0,
	activeNodeSize: 1.1,

	// Edge settings
	edgeColorMode: EdgeColorMode.SINGLE,
	edgeColor: '#888888',
	highlightedEdgeColor: '#4ECDC4',
	hopEdgeColors: ['#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],

	// Edge width
	activeEdgeWidth: 2.0,
	defaultEdgeWidth: 1.0,
	disconnectedEdgeWidth: 0.5,

	// Scope
	applyToGlobalGraph: true,
	applyToLocalGraph: true,

	// Presets
	presets: [],
	activePreset: null,

	// Rules
	rules: [],
};

// ============================================================
// Internal Obsidian Graph API Types (undocumented)
// ============================================================

export interface GraphNode {
	id: string;
	x: number;
	y: number;
	forward: Set<GraphNode>;
	reverse: Set<GraphNode>;
	render?: (...args: any[]) => any;
	circle?: {
		tint: number;
		alpha: number;
		scale?: { x: number; y: number };
		visible?: boolean;
	};
	text?: {
		alpha: number;
	};
}

export interface GraphLink {
	source: GraphNode;
	target: GraphNode;
	render?: (...args: any[]) => any;
	line?: {
		tint: number;
		alpha: number;
		renderable?: boolean;
		scale?: { x: number; y: number };
	};
	arrow?: {
		tint: number;
		alpha: number;
		renderable?: boolean;
		scale?: { x: number; y: number };
	};
}

export interface GraphRenderer {
	nodes: Map<string, GraphNode>;
	links: GraphLink[];
	changed?: () => void;
	px?: {
		renderer: {
			render: (stage: unknown) => void;
		};
		stage: unknown;
		ticker?: {
			add: (fn: (delta: number) => void) => void;
			remove: (fn: (delta: number) => void) => void;
		};
	};
	worker?: {
		postMessage: (msg: unknown) => void;
	};
}

export interface GraphView {
	renderer?: GraphRenderer;
	file?: {
		path: string;
	};
	getViewType: () => string;
}

// ============================================================
// Utility Types
// ============================================================

export interface RGB {
	r: number;
	g: number;
	b: number;
}

export interface NodeStyleResult {
	tint: number;
	alpha: number;
	shape?: NodeShape;
	size?: number;
}

// Helper function to generate unique IDs
export function generateId(): string {
	return Math.random().toString(36).substring(2, 15) +
		Math.random().toString(36).substring(2, 15);
}
