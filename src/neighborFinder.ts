// Simple BFS-based neighbor finder (no external dependencies)

export class NeighborFinder {
	private adjacencyList: Map<string, Set<string>> = new Map();

	/**
	 * Build adjacency list from node connections
	 */
	buildFromNodes(nodes: Map<string, any> | any[] | Record<string, any>): void {
		this.adjacencyList.clear();

		// Handle different node collection types
		const nodeEntries: [string, any][] = [];

		if (nodes instanceof Map) {
			nodes.forEach((node, id) => nodeEntries.push([id, node]));
		} else if (Array.isArray(nodes)) {
			nodes.forEach(node => {
				if (node && node.id) {
					nodeEntries.push([node.id, node]);
				}
			});
		} else if (typeof nodes === 'object') {
			Object.entries(nodes).forEach(([id, node]) => {
				nodeEntries.push([id, node]);
			});
		}

		// Initialize all nodes
		nodeEntries.forEach(([id]) => {
			if (!this.adjacencyList.has(id)) {
				this.adjacencyList.set(id, new Set());
			}
		});

		// Build edges from forward/reverse links
		nodeEntries.forEach(([id, node]) => {
			if (!node) return;

			// Handle forward links
			const forwardLinks = this.getLinks(node, 'forward');
			forwardLinks.forEach(targetId => {
				this.addEdge(id, targetId);
			});

			// Handle reverse links
			const reverseLinks = this.getLinks(node, 'reverse');
			reverseLinks.forEach(sourceId => {
				this.addEdge(sourceId, id);
			});
		});
	}

	private getLinks(node: any, direction: 'forward' | 'reverse'): string[] {
		const links: string[] = [];
		const linkData = node[direction];

		if (!linkData) return links;

		try {
			// Check if it's iterable with forEach (Set, Map, Array)
			if (typeof linkData.forEach === 'function') {
				linkData.forEach((target: any, key: any) => {
					// Map: key is the node id, target is the value
					if (typeof key === 'string' && key.includes('/')) {
						links.push(key);
					} else if (typeof target === 'string') {
						links.push(target);
					} else if (target && target.id) {
						links.push(target.id);
					}
				});
			} else if (typeof linkData === 'object') {
				// Plain object with keys as node IDs
				Object.keys(linkData).forEach(key => {
					links.push(key);
				});
			}
		} catch (e) {
			console.warn('Error parsing links:', e);
		}

		return links;
	}

	private addEdge(from: string, to: string): void {
		if (!this.adjacencyList.has(from)) {
			this.adjacencyList.set(from, new Set());
		}
		if (!this.adjacencyList.has(to)) {
			this.adjacencyList.set(to, new Set());
		}
		this.adjacencyList.get(from)!.add(to);
		this.adjacencyList.get(to)!.add(from);
	}

	/**
	 * BFS to find all nodes within n hops, categorized by distance
	 */
	findNeighborsByHop(sourceId: string, maxHops: number): Map<number, Set<string>> {
		const result = new Map<number, Set<string>>();

		for (let hop = 1; hop <= maxHops; hop++) {
			result.set(hop, new Set());
		}

		if (!this.adjacencyList.has(sourceId)) {
			return result;
		}

		const visited = new Set<string>();
		const queue: [string, number][] = [[sourceId, 0]];
		visited.add(sourceId);

		while (queue.length > 0) {
			const [currentId, distance] = queue.shift()!;

			if (distance > 0 && distance <= maxHops) {
				result.get(distance)!.add(currentId);
			}

			if (distance < maxHops) {
				const neighbors = this.adjacencyList.get(currentId) || new Set();
				neighbors.forEach(neighborId => {
					if (!visited.has(neighborId)) {
						visited.add(neighborId);
						queue.push([neighborId, distance + 1]);
					}
				});
			}
		}

		return result;
	}

	/**
	 * Get all connected nodes using BFS
	 */
	getAllConnectedNodes(sourceId: string): Set<string> {
		const connected = new Set<string>();

		if (!this.adjacencyList.has(sourceId)) {
			return connected;
		}

		const visited = new Set<string>();
		const queue: string[] = [sourceId];
		visited.add(sourceId);

		while (queue.length > 0) {
			const currentId = queue.shift()!;

			if (currentId !== sourceId) {
				connected.add(currentId);
			}

			const neighbors = this.adjacencyList.get(currentId) || new Set();
			neighbors.forEach(neighborId => {
				if (!visited.has(neighborId)) {
					visited.add(neighborId);
					queue.push(neighborId);
				}
			});
		}

		return connected;
	}

	/**
	 * Get immediate neighbors (1-hop)
	 */
	getDirectNeighbors(sourceId: string): Set<string> {
		return this.adjacencyList.get(sourceId) || new Set();
	}

	hasNodes(): boolean {
		return this.adjacencyList.size > 0;
	}

	getNodeCount(): number {
		return this.adjacencyList.size;
	}
}
