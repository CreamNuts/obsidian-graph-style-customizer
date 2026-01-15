import { App, PluginSettingTab, Setting, TextComponent, SliderComponent, DropdownComponent, Modal, ButtonComponent, AbstractInputSuggest, TFolder, TFile } from 'obsidian';
import GraphStyleCustomizerPlugin from './main';
import { GraphStyleSettings, DEFAULT_SETTINGS, StyleRule, NodeShape, EdgeColorMode, RuleType, generateId, StylePreset } from './types';

// ============================================================
// Pattern Suggest (Autocomplete)
// ============================================================

interface SuggestItem {
	value: string;
	display: string;
}

class PatternSuggest extends AbstractInputSuggest<SuggestItem> {
	private ruleType: RuleType;
	private getType: () => RuleType;
	private inputElement: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement, getType: () => RuleType) {
		super(app, inputEl);
		this.inputElement = inputEl;
		this.ruleType = getType();
		this.getType = getType;
	}

	getSuggestions(query: string): SuggestItem[] {
		this.ruleType = this.getType();
		const lowerQuery = query.toLowerCase();

		switch (this.ruleType) {
			case 'folder':
				return this.getFolderSuggestions(lowerQuery);
			case 'tag':
				return this.getTagSuggestions(lowerQuery);
			case 'file':
				return this.getFileSuggestions(lowerQuery);
			default:
				return [];
		}
	}

	private getFolderSuggestions(query: string): SuggestItem[] {
		const folders: SuggestItem[] = [];
		const allFiles = this.app.vault.getAllLoadedFiles();

		for (const file of allFiles) {
			if (file instanceof TFolder && file.path !== '/') {
				const folderPath = file.path + '/';
				if (folderPath.toLowerCase().includes(query) || query === '') {
					folders.push({
						value: folderPath,
						display: folderPath
					});
				}
			}
		}

		// Sort by relevance (starts with query first, then alphabetically)
		return folders
			.sort((a, b) => {
				const aStarts = a.value.toLowerCase().startsWith(query);
				const bStarts = b.value.toLowerCase().startsWith(query);
				if (aStarts && !bStarts) return -1;
				if (!aStarts && bStarts) return 1;
				return a.value.localeCompare(b.value);
			})
			.slice(0, 20);
	}

	private getTagSuggestions(query: string): SuggestItem[] {
		const tags: SuggestItem[] = [];
		const tagCache = (this.app.metadataCache as any).getTags();

		if (tagCache) {
			for (const tag of Object.keys(tagCache)) {
				// tag already includes # prefix
				if (tag.toLowerCase().includes(query) || query === '') {
					tags.push({
						value: tag,
						display: `${tag} (${tagCache[tag]})`
					});
				}
			}
		}

		// Sort by count (most used first)
		return tags
			.sort((a, b) => {
				const aCount = tagCache[a.value] || 0;
				const bCount = tagCache[b.value] || 0;
				return bCount - aCount;
			})
			.slice(0, 20);
	}

	private getFileSuggestions(query: string): SuggestItem[] {
		const files: SuggestItem[] = [];
		const mdFiles = this.app.vault.getMarkdownFiles();

		for (const file of mdFiles) {
			const fileName = file.basename;
			const filePath = file.path;

			if (fileName.toLowerCase().includes(query) ||
				filePath.toLowerCase().includes(query) ||
				query === '') {
				files.push({
					value: filePath,
					display: `${fileName} (${file.parent?.path || '/'})`
				});
			}
		}

		// Sort by relevance
		return files
			.sort((a, b) => {
				const aStarts = a.value.toLowerCase().includes(query);
				const bStarts = b.value.toLowerCase().includes(query);
				if (aStarts && !bStarts) return -1;
				if (!aStarts && bStarts) return 1;
				return a.value.localeCompare(b.value);
			})
			.slice(0, 20);
	}

	renderSuggestion(item: SuggestItem, el: HTMLElement): void {
		el.addClass('graph-style-suggestion-item');
		el.createEl('div', { text: item.display });
	}

	selectSuggestion(item: SuggestItem): void {
		this.inputElement.value = item.value;
		this.inputElement.dispatchEvent(new Event('input'));
		this.close();
	}
}

// ============================================================
// Slider with Number Input Component
// ============================================================

function addSliderWithInput(
	containerEl: HTMLElement,
	name: string,
	desc: string,
	value: number,
	min: number,
	max: number,
	step: number,
	onChange: (value: number) => Promise<void>
): void {
	let sliderComponent: SliderComponent;
	let textComponent: TextComponent;

	new Setting(containerEl)
		.setName(name)
		.setDesc(desc)
		.addSlider(slider => {
			sliderComponent = slider;
			slider
				.setLimits(min, max, step)
				.setValue(Math.min(Math.max(value, min), max)) // Clamp for slider
				.setDynamicTooltip()
				.onChange(async (val) => {
					textComponent.setValue(val.toString());
					await onChange(val);
				});
		})
		.addText(text => {
			textComponent = text;
			text
				.setValue(value.toString())
				.onChange(async (val) => {
					const num = parseFloat(val);
					if (!isNaN(num) && num >= min && num <= max) {
						sliderComponent.setValue(num);
						await onChange(num);
					}
				});
			text.inputEl.style.width = '60px';
			text.inputEl.type = 'number';
			text.inputEl.min = min.toString();
			text.inputEl.max = max.toString();
			text.inputEl.step = step.toString();
		});
}

// ============================================================
// Rule Editor Modal
// ============================================================

class RuleEditorModal extends Modal {
	private rule: Partial<StyleRule>;
	private onSave: (rule: StyleRule) => void;
	private isNew: boolean;
	private patternSuggest: PatternSuggest | null = null;

	constructor(app: App, rule: Partial<StyleRule> | null, onSave: (rule: StyleRule) => void) {
		super(app);
		this.isNew = !rule;
		this.rule = rule ? { ...rule } : {
			id: generateId(),
			type: 'folder',
			pattern: '',
			enabled: true,
		};
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.isNew ? 'Add Rule' : 'Edit Rule' });

		let patternInput: TextComponent;

		// Rule Type
		new Setting(contentEl)
			.setName('Rule Type')
			.setDesc('What should this rule match?')
			.addDropdown(dropdown => {
				dropdown
					.addOption('folder', 'Folder')
					.addOption('tag', 'Tag')
					.addOption('file', 'File')
					.setValue(this.rule.type || 'folder')
					.onChange(value => {
						this.rule.type = value as RuleType;
						// Update placeholder when type changes
						if (patternInput) {
							patternInput.setPlaceholder(this.getPlaceholder());
						}
					});
			});

		// Pattern with autocomplete
		new Setting(contentEl)
			.setName('Pattern')
			.setDesc('Start typing to see suggestions from your vault')
			.addText(text => {
				patternInput = text;
				text
					.setPlaceholder(this.getPlaceholder())
					.setValue(this.rule.pattern || '')
					.onChange(value => {
						this.rule.pattern = value;
					});
				text.inputEl.style.width = '300px';

				// Attach autocomplete suggest
				this.patternSuggest = new PatternSuggest(
					this.app,
					text.inputEl,
					() => this.rule.type || 'folder'
				);
			});

		// Color
		new Setting(contentEl)
			.setName('Color')
			.setDesc('Node color (optional)')
			.addColorPicker(picker => {
				picker
					.setValue(this.rule.color || '#4ECDC4')
					.onChange(value => {
						this.rule.color = value;
					});
			})
			.addToggle(toggle => {
				toggle
					.setValue(!!this.rule.color)
					.setTooltip('Enable color')
					.onChange(value => {
						if (!value) {
							delete this.rule.color;
						} else {
							this.rule.color = '#4ECDC4';
						}
					});
			});

		// Size
		new Setting(contentEl)
			.setName('Size')
			.setDesc('Node size multiplier (0.8 - 1.5, optional)')
			.addSlider(slider => {
				slider
					.setLimits(0.8, 1.5, 0.05)
					.setValue(this.rule.size || 1.0)
					.setDynamicTooltip()
					.onChange(value => {
						this.rule.size = value;
					});
			})
			.addToggle(toggle => {
				toggle
					.setValue(this.rule.size !== undefined)
					.setTooltip('Enable size override')
					.onChange(value => {
						if (!value) {
							delete this.rule.size;
						} else {
							this.rule.size = 1.0;
						}
					});
			});

		// Buttons
		new Setting(contentEl)
			.addButton(btn => {
				btn
					.setButtonText('Cancel')
					.onClick(() => this.close());
			})
			.addButton(btn => {
				btn
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						if (!this.rule.pattern) {
							return;
						}
						// Normalize tag pattern
						if (this.rule.type === 'tag' && !this.rule.pattern.startsWith('#')) {
							this.rule.pattern = '#' + this.rule.pattern;
						}
						this.onSave(this.rule as StyleRule);
						this.close();
					});
			});
	}

	private getPlaceholder(): string {
		switch (this.rule.type) {
			case 'folder': return '01_Projects/';
			case 'tag': return '#project';
			case 'file': return 'note.md';
			default: return '';
		}
	}

	onClose() {
		if (this.patternSuggest) {
			this.patternSuggest.close();
		}
		this.contentEl.empty();
	}
}

// ============================================================
// Main Settings Tab
// ============================================================

export class GraphStyleSettingTab extends PluginSettingTab {
	plugin: GraphStyleCustomizerPlugin;

	constructor(app: App, plugin: GraphStyleCustomizerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('graph-style-customizer-settings');

		containerEl.createEl('h1', { text: 'Graph Style Customizer' });

		// === Enable/Disable ===
		new Setting(containerEl)
			.setName('Enable styling')
			.setDesc('Toggle graph style customization on/off')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}));

		// === Node Colors Section ===
		containerEl.createEl('h2', { text: 'Node Colors' });

		// Max Hops with number input
		addSliderWithInput(
			containerEl,
			'Maximum hops',
			'How many levels of neighbors to highlight (1-5)',
			this.plugin.settings.maxHops,
			1, 5, 1,
			async (value) => {
				this.plugin.settings.maxHops = value;
				await this.plugin.saveSettings();
				this.display();
			}
		);

		// Selected Node Color
		new Setting(containerEl)
			.setName('Active node color')
			.setDesc('Color of the currently selected/active note')
			.addColorPicker(picker => picker
				.setValue(this.plugin.settings.selectedNodeColor)
				.onChange(async (value) => {
					this.plugin.settings.selectedNodeColor = value;
					await this.plugin.saveSettings();
				}));

		// Hop Colors
		containerEl.createEl('h3', { text: 'Neighbor Colors by Hop Distance' });

		for (let i = 0; i < this.plugin.settings.maxHops; i++) {
			new Setting(containerEl)
				.setName(`${i + 1}-hop neighbor`)
				.setDesc(`Color for notes ${i + 1} link${i > 0 ? 's' : ''} away`)
				.addColorPicker(picker => picker
					.setValue(this.plugin.settings.hopColors[i] || DEFAULT_SETTINGS.hopColors[i])
					.onChange(async (value) => {
						this.plugin.settings.hopColors[i] = value;
						await this.plugin.saveSettings();
					}));
		}

		// Disconnected Opacity with number input
		addSliderWithInput(
			containerEl,
			'Disconnected node opacity',
			'Opacity for unconnected nodes (0-100%)',
			this.plugin.settings.disconnectedOpacity * 100,
			0, 100, 5,
			async (value) => {
				this.plugin.settings.disconnectedOpacity = value / 100;
				await this.plugin.saveSettings();
			}
		);

		// === Node Size Section ===
		containerEl.createEl('h2', { text: 'Node Size' });

		addSliderWithInput(
			containerEl,
			'Default node size',
			'Size multiplier for all nodes',
			this.plugin.settings.defaultNodeSize,
			0.1, 5, 0.1,
			async (value) => {
				this.plugin.settings.defaultNodeSize = value;
				await this.plugin.saveSettings();
			}
		);

		addSliderWithInput(
			containerEl,
			'Active node size',
			'Size multiplier for the active node',
			this.plugin.settings.activeNodeSize,
			0.1, 5, 0.1,
			async (value) => {
				this.plugin.settings.activeNodeSize = value;
				await this.plugin.saveSettings();
			}
		);

		// === Edge Colors Section ===
		containerEl.createEl('h2', { text: 'Edge Colors' });

		new Setting(containerEl)
			.setName('Edge color mode')
			.setDesc('How edge colors are determined')
			.addDropdown(dropdown => {
				dropdown
					.addOption(EdgeColorMode.SINGLE, 'Single color')
					.addOption(EdgeColorMode.INHERIT, 'Inherit from source node')
					.addOption(EdgeColorMode.BY_HOP, 'By hop distance')
					.setValue(this.plugin.settings.edgeColorMode)
					.onChange(async (value) => {
						this.plugin.settings.edgeColorMode = value as EdgeColorMode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// Show options based on mode
		if (this.plugin.settings.edgeColorMode === EdgeColorMode.SINGLE) {
			new Setting(containerEl)
				.setName('Edge color')
				.setDesc('Color for all edges')
				.addColorPicker(picker => picker
					.setValue(this.plugin.settings.edgeColor)
					.onChange(async (value) => {
						this.plugin.settings.edgeColor = value;
						await this.plugin.saveSettings();
					}));

			// Highlighted edge color - only for SINGLE mode
			new Setting(containerEl)
				.setName('Highlighted edge color')
				.setDesc('Color for edges directly connected to the active node')
				.addColorPicker(picker => picker
					.setValue(this.plugin.settings.highlightedEdgeColor)
					.onChange(async (value) => {
						this.plugin.settings.highlightedEdgeColor = value;
						await this.plugin.saveSettings();
					}));
		} else if (this.plugin.settings.edgeColorMode === EdgeColorMode.BY_HOP) {
			containerEl.createEl('h3', { text: 'Edge Colors by Hop Distance' });

			for (let i = 0; i < this.plugin.settings.maxHops; i++) {
				new Setting(containerEl)
					.setName(`${i + 1}-hop edge`)
					.setDesc(`Color for edges at ${i + 1} hop distance`)
					.addColorPicker(picker => picker
						.setValue(this.plugin.settings.hopEdgeColors[i] || DEFAULT_SETTINGS.hopEdgeColors[i])
						.onChange(async (value) => {
							this.plugin.settings.hopEdgeColors[i] = value;
							await this.plugin.saveSettings();
						}));
			}
		}

		// === Edge Width Section ===
		containerEl.createEl('h2', { text: 'Edge Width' });

		addSliderWithInput(
			containerEl,
			'Active edge width',
			'Width multiplier for edges connected to active node',
			this.plugin.settings.activeEdgeWidth,
			0.1, 5, 0.1,
			async (value) => {
				this.plugin.settings.activeEdgeWidth = value;
				await this.plugin.saveSettings();
			}
		);

		addSliderWithInput(
			containerEl,
			'Default edge width',
			'Width multiplier for edges within hop range',
			this.plugin.settings.defaultEdgeWidth,
			0.1, 5, 0.1,
			async (value) => {
				this.plugin.settings.defaultEdgeWidth = value;
				await this.plugin.saveSettings();
			}
		);

		addSliderWithInput(
			containerEl,
			'Disconnected edge width',
			'Width multiplier for edges outside hop range',
			this.plugin.settings.disconnectedEdgeWidth,
			0.1, 5, 0.1,
			async (value) => {
				this.plugin.settings.disconnectedEdgeWidth = value;
				await this.plugin.saveSettings();
			}
		);

		// === Scope Section ===
		containerEl.createEl('h2', { text: 'Apply To' });

		new Setting(containerEl)
			.setName('Global graph')
			.setDesc('Apply styling to the global graph view')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.applyToGlobalGraph)
				.onChange(async (value) => {
					this.plugin.settings.applyToGlobalGraph = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Local graph')
			.setDesc('Apply styling to local graph panels')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.applyToLocalGraph)
				.onChange(async (value) => {
					this.plugin.settings.applyToLocalGraph = value;
					await this.plugin.saveSettings();
				}));

		// === Rules Section ===
		containerEl.createEl('h2', { text: 'Style Rules' });
		containerEl.createEl('p', {
			text: 'Rules are applied in order. Drag to reorder. First matching rule wins.',
			cls: 'setting-item-description'
		});

		// Rules list
		const rulesContainer = containerEl.createDiv({ cls: 'rules-container' });
		this.renderRulesList(rulesContainer);

		// Add rule button
		new Setting(containerEl)
			.addButton(btn => {
				btn
					.setButtonText('Add Rule')
					.setCta()
					.onClick(() => {
						new RuleEditorModal(this.app, null, async (rule) => {
							this.plugin.settings.rules.push(rule);
							await this.plugin.saveSettings();
							this.display();
						}).open();
					});
			});

		// === Presets Section ===
		containerEl.createEl('h2', { text: 'Presets' });

		if (this.plugin.settings.presets.length > 0) {
			this.plugin.settings.presets.forEach((preset, index) => {
				new Setting(containerEl)
					.setName(preset.name)
					.setDesc(this.plugin.settings.activePreset === preset.name ? 'Active' : '')
					.addButton(btn => btn
						.setButtonText('Apply')
						.onClick(() => {
							this.plugin.applyPreset(preset.name);
							this.display();
						}))
					.addButton(btn => btn
						.setButtonText('Delete')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.presets.splice(index, 1);
							if (this.plugin.settings.activePreset === preset.name) {
								this.plugin.settings.activePreset = null;
							}
							await this.plugin.saveSettings();
							this.display();
						}));
			});
		} else {
			containerEl.createEl('p', {
				text: 'No presets saved yet.',
				cls: 'setting-item-description'
			});
		}

		// Save new preset
		let presetNameInput: TextComponent;
		new Setting(containerEl)
			.setName('Save current settings as preset')
			.addText(text => {
				presetNameInput = text;
				text.setPlaceholder('Preset name');
			})
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					const name = presetNameInput.getValue().trim();
					if (!name) return;

					const { presets, activePreset, rules, ...currentSettings } = this.plugin.settings;
					const newPreset: StylePreset = {
						name,
						settings: { ...currentSettings, rules: [...rules] }
					};

					const existingIndex = this.plugin.settings.presets.findIndex(p => p.name === name);
					if (existingIndex >= 0) {
						this.plugin.settings.presets[existingIndex] = newPreset;
					} else {
						this.plugin.settings.presets.push(newPreset);
					}

					this.plugin.settings.activePreset = name;
					await this.plugin.saveSettings();
					this.display();
				}));

		// === Reset Section ===
		containerEl.createEl('h2', { text: 'Reset' });

		new Setting(containerEl)
			.setName('Reset to defaults')
			.setDesc('Reset all settings to their default values (presets are preserved)')
			.addButton(btn => btn
				.setButtonText('Reset')
				.setWarning()
				.onClick(async () => {
					// Preserve presets when resetting
					const { presets, activePreset } = this.plugin.settings;
					this.plugin.settings = { ...DEFAULT_SETTINGS, presets, activePreset };
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private renderRulesList(container: HTMLElement) {
		container.empty();

		if (this.plugin.settings.rules.length === 0) {
			container.createEl('p', {
				text: 'No rules defined. Add a rule to customize specific nodes.',
				cls: 'setting-item-description'
			});
			return;
		}

		this.plugin.settings.rules.forEach((rule, index) => {
			const ruleEl = container.createDiv({ cls: 'rule-item' });
			ruleEl.setAttribute('draggable', 'true');
			ruleEl.dataset.index = index.toString();

			// Drag handle
			const dragHandle = ruleEl.createSpan({ cls: 'rule-drag-handle', text: '⋮⋮' });

			// Type badge
			const typeBadge = ruleEl.createSpan({ cls: `rule-type-badge rule-type-${rule.type}` });
			typeBadge.textContent = rule.type.charAt(0).toUpperCase();

			// Pattern
			const patternEl = ruleEl.createSpan({ cls: 'rule-pattern' });
			patternEl.textContent = rule.pattern;

			// Color preview
			if (rule.color) {
				const colorPreview = ruleEl.createSpan({ cls: 'rule-color-preview' });
				colorPreview.style.backgroundColor = rule.color;
			}

			// Shape icon
			if (rule.shape) {
				const shapeIcon = ruleEl.createSpan({ cls: 'rule-shape-icon' });
				shapeIcon.textContent = this.getShapeIcon(rule.shape);
			}

			// Size indicator
			if (rule.size !== undefined) {
				const sizeIndicator = ruleEl.createSpan({ cls: 'rule-size-indicator' });
				sizeIndicator.textContent = `${rule.size.toFixed(1)}x`;
			}

			// Enabled toggle
			const toggleEl = ruleEl.createEl('input', { type: 'checkbox', cls: 'rule-enabled-toggle' });
			toggleEl.checked = rule.enabled;
			toggleEl.addEventListener('change', async () => {
				this.plugin.settings.rules[index].enabled = toggleEl.checked;
				await this.plugin.saveSettings();
			});

			// Edit button
			const editBtn = ruleEl.createEl('button', { cls: 'rule-edit-btn', text: 'Edit' });
			editBtn.addEventListener('click', () => {
				new RuleEditorModal(this.app, rule, async (updatedRule) => {
					this.plugin.settings.rules[index] = updatedRule;
					await this.plugin.saveSettings();
					this.display();
				}).open();
			});

			// Delete button
			const deleteBtn = ruleEl.createEl('button', { cls: 'rule-delete-btn', text: '×' });
			deleteBtn.addEventListener('click', async () => {
				this.plugin.settings.rules.splice(index, 1);
				await this.plugin.saveSettings();
				this.display();
			});

			// Drag events
			ruleEl.addEventListener('dragstart', (e) => {
				e.dataTransfer?.setData('text/plain', index.toString());
				ruleEl.addClass('dragging');
			});

			ruleEl.addEventListener('dragend', () => {
				ruleEl.removeClass('dragging');
			});

			ruleEl.addEventListener('dragover', (e) => {
				e.preventDefault();
				ruleEl.addClass('drag-over');
			});

			ruleEl.addEventListener('dragleave', () => {
				ruleEl.removeClass('drag-over');
			});

			ruleEl.addEventListener('drop', async (e) => {
				e.preventDefault();
				ruleEl.removeClass('drag-over');

				const fromIndex = parseInt(e.dataTransfer?.getData('text/plain') || '0');
				const toIndex = index;

				if (fromIndex !== toIndex) {
					const [movedRule] = this.plugin.settings.rules.splice(fromIndex, 1);
					this.plugin.settings.rules.splice(toIndex, 0, movedRule);
					await this.plugin.saveSettings();
					this.display();
				}
			});
		});
	}

	private getShapeIcon(shape: NodeShape): string {
		switch (shape) {
			case NodeShape.CIRCLE: return '●';
			case NodeShape.SQUARE: return '■';
			case NodeShape.DIAMOND: return '◆';
			case NodeShape.TRIANGLE: return '▲';
			case NodeShape.HEXAGON: return '⬡';
			default: return '?';
		}
	}
}
