import { Plugin, WorkspaceLeaf, TFile, debounce } from 'obsidian';
import { GraphStyleSettings, DEFAULT_SETTINGS, GraphView, generateId, StyleRule } from './types';
import { GraphStyleSettingTab } from './settings';
import { GraphStyler } from './graphStyler';

export default class GraphStyleCustomizerPlugin extends Plugin {
	settings: GraphStyleSettings = DEFAULT_SETTINGS;
	stylers: Map<WorkspaceLeaf, GraphStyler> = new Map();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new GraphStyleSettingTab(this.app, this));

		// Register commands
		this.addCommand({
			id: 'toggle-graph-styling',
			name: 'Toggle Graph Style Customizer',
			callback: () => {
				this.settings.enabled = !this.settings.enabled;
				this.saveSettings();
				this.updateAllStylers();
			}
		});

		// Preset switching commands
		this.addCommand({
			id: 'cycle-preset',
			name: 'Cycle through presets',
			callback: () => this.cyclePreset()
		});

		// Graph view events
		this.registerEvent(
			this.app.workspace.on('layout-change', () => this.handleLayoutChange())
		);

		// Active file change
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.debouncedUpdate())
		);

		// File open
		this.registerEvent(
			this.app.workspace.on('file-open', () => this.debouncedUpdate())
		);

		// Initialize on layout ready
		this.app.workspace.onLayoutReady(() => {
			this.initializeStylers();
		});

		console.log('Graph Style Customizer loaded');
	}

	async onunload() {
		this.stylers.forEach(styler => styler.cleanup());
		this.stylers.clear();
		console.log('Graph Style Customizer unloaded');
	}

	private debouncedUpdate = debounce(() => {
		this.updateAllStylers();
	}, 100, true);

	private handleLayoutChange() {
		const graphLeaves = this.getGraphLeaves();

		// Remove stylers for closed leaves
		const currentLeafIds = new Set(graphLeaves.map(l => (l as any).id));
		this.stylers.forEach((styler, leaf) => {
			if (!currentLeafIds.has((leaf as any).id)) {
				styler.cleanup();
				this.stylers.delete(leaf);
			}
		});

		// Add stylers for new leaves
		graphLeaves.forEach(leaf => {
			if (!this.stylers.has(leaf)) {
				const styler = new GraphStyler(leaf, this.settings, this.app);
				this.stylers.set(leaf, styler);
			}
		});
	}

	private initializeStylers() {
		this.handleLayoutChange();
		// Delay initial styling to ensure graph is rendered
		setTimeout(() => this.updateAllStylers(), 500);
	}

	getGraphLeaves(): WorkspaceLeaf[] {
		const leaves: WorkspaceLeaf[] = [];

		if (this.settings.applyToGlobalGraph) {
			leaves.push(...this.app.workspace.getLeavesOfType('graph'));
		}

		if (this.settings.applyToLocalGraph) {
			leaves.push(...this.app.workspace.getLeavesOfType('localgraph'));
		}

		return leaves;
	}

	updateAllStylers() {
		this.stylers.forEach(styler => {
			styler.updateSettings(this.settings);
			styler.applyStyles();
		});
	}

	cyclePreset() {
		if (this.settings.presets.length === 0) return;

		const currentIndex = this.settings.presets.findIndex(
			p => p.name === this.settings.activePreset
		);
		const nextIndex = (currentIndex + 1) % this.settings.presets.length;
		const preset = this.settings.presets[nextIndex];

		this.applyPreset(preset.name);
	}

	applyPreset(presetName: string) {
		const preset = this.settings.presets.find(p => p.name === presetName);
		if (!preset) return;

		// Merge preset settings
		Object.assign(this.settings, preset.settings);
		this.settings.activePreset = presetName;

		this.saveSettings();
		this.updateAllStylers();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Ensure hopColors array is properly sized
		while (this.settings.hopColors.length < 5) {
			this.settings.hopColors.push(DEFAULT_SETTINGS.hopColors[this.settings.hopColors.length]);
		}

		// Ensure hopEdgeColors array is properly sized
		if (!this.settings.hopEdgeColors) {
			this.settings.hopEdgeColors = [...DEFAULT_SETTINGS.hopEdgeColors];
		}
		while (this.settings.hopEdgeColors.length < 5) {
			this.settings.hopEdgeColors.push(DEFAULT_SETTINGS.hopEdgeColors[this.settings.hopEdgeColors.length]);
		}

		// Ensure rules array exists
		if (!this.settings.rules) {
			this.settings.rules = [];
		}

		// Ensure edge width settings exist (for existing installations)
		if (this.settings.activeEdgeWidth === undefined) {
			this.settings.activeEdgeWidth = DEFAULT_SETTINGS.activeEdgeWidth;
		}
		if (this.settings.defaultEdgeWidth === undefined) {
			this.settings.defaultEdgeWidth = DEFAULT_SETTINGS.defaultEdgeWidth;
		}
		if (this.settings.disconnectedEdgeWidth === undefined) {
			this.settings.disconnectedEdgeWidth = DEFAULT_SETTINGS.disconnectedEdgeWidth;
		}

		// Migrate legacy tagRules and folderRules to unified rules
		let needsSave = false;
		if (data?.tagRules && data.tagRules.length > 0) {
			const migratedTagRules: StyleRule[] = data.tagRules.map((r: any) => ({
				id: generateId(),
				type: 'tag' as const,
				pattern: r.tag,
				color: r.color,
				enabled: true,
			}));
			this.settings.rules.push(...migratedTagRules);
			delete (this.settings as any).tagRules;
			needsSave = true;
			console.log(`Migrated ${migratedTagRules.length} tag rules`);
		}

		if (data?.folderRules && data.folderRules.length > 0) {
			const migratedFolderRules: StyleRule[] = data.folderRules.map((r: any) => ({
				id: generateId(),
				type: 'folder' as const,
				pattern: r.folder,
				color: r.color,
				enabled: true,
			}));
			// Insert folder rules at the beginning (higher priority)
			this.settings.rules.unshift(...migratedFolderRules);
			delete (this.settings as any).folderRules;
			needsSave = true;
			console.log(`Migrated ${migratedFolderRules.length} folder rules`);
		}

		// Save if migration occurred
		if (needsSave) {
			await this.saveData(this.settings);
			console.log('Settings migration completed');
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateAllStylers();
	}
}
