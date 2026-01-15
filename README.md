# Graph Style Customizer

An [Obsidian](https://obsidian.md) plugin that enhances your Graph View with customizable node highlighting, edge styling, and style rules based on folders, tags, or files.

## Features

### N-hop Neighbor Highlighting

Visualize the connection distance from your active note:

- **Active Node**: Highlight the currently focused note with a distinct color
- **Hop-based Colors**: Set different colors for 1-hop, 2-hop, 3-hop... neighbors (up to 5 hops)
- **Disconnected Nodes**: Fade out unconnected nodes with adjustable opacity

### Edge Styling

Customize how edges (links) appear in your graph:

- **Color Modes**:
  - `Inherit`: Edge inherits color from source node
  - `By-hop`: Edge color based on hop distance
  - `Single`: Uniform color for all edges
- **Edge Width**: Different widths for active, default, and disconnected edges
- **Arrow Sync**: Arrow colors automatically match their edge colors

### Node Sizing

- **Default Size**: Base size multiplier for all nodes
- **Active Size**: Larger size for the active node to make it stand out

### Style Rules

Create rules to style nodes based on:

- **Folder**: Apply styles to all notes in a folder (e.g., `Projects/`)
- **Tag**: Style notes with specific tags (e.g., `#important`)
- **File**: Target individual files by name

Each rule can specify:
- Custom color
- Node shape (Circle, Square, Diamond, Triangle, Hexagon)
- Size multiplier

Rules are prioritized by order - drag and drop to reorder.

### Presets

Save and switch between different style configurations:

- Create named presets with your preferred settings
- Quick-switch between presets via command palette
- Cycle through presets with a keyboard shortcut

### Scope Control

Choose where styling applies:
- Global Graph View
- Local Graph View
- Or both

## Installation

### From Obsidian Community Plugins (Coming Soon)

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Graph Style Customizer"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from [Releases](https://github.com/creamnuts/obsidian-graph-style-customizer/releases)
2. Extract files to your vault's `.obsidian/plugins/graph-style-customizer/` folder
3. Reload Obsidian
4. Enable the plugin in Settings > Community Plugins

## Usage

### Basic Setup

1. Open Settings > Graph Style Customizer
2. Customize your colors for active node and hop neighbors
3. Open Graph View to see the styling applied

### Commands

- `Toggle Graph Style Customizer`: Enable/disable the plugin
- `Cycle through presets`: Switch to the next preset

### Creating Style Rules

1. Go to Settings > Graph Style Customizer > Style Rules
2. Click "Add Rule"
3. Choose rule type (Folder/Tag/File)
4. Enter the pattern and select style options
5. Drag rules to set priority (top = highest priority)

## Settings Overview

| Setting | Description | Default |
|---------|-------------|---------|
| Max hops | Maximum hop distance to highlight | 3 |
| Selected node color | Color of the active node | #FF6B6B |
| Hop colors | Colors for each hop level | Gradient palette |
| Disconnected opacity | Opacity for unconnected nodes | 0.15 |
| Edge color mode | How edge colors are determined | Single |
| Active edge width | Width multiplier for active edges | 2.0 |
| Default edge width | Width multiplier for normal edges | 1.0 |

## Compatibility

- Requires Obsidian v1.4.0 or higher
- Desktop only (uses PixiJS rendering)

## Support

If you encounter any issues or have feature requests, please [open an issue](https://github.com/creamnuts/obsidian-graph-style-customizer/issues) on GitHub.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with Claude Code
