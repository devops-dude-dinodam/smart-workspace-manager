# Smart Workspace Manager for GNOME Shell

A GNOME Shell extension that brings **per-monitor workspace independence** to multi-monitor setups, inspired by macOS workspace behavior.

## 🎯 What It Does

Instead of all monitors switching workspaces together (GNOME's default behavior), this extension allows:
- **Mouse-focused workspace switching** - only the monitor under your cursor drives workspace changes
- **Synchronized workspace stacks** - other monitors' windows shift to maintain workspace relationships  
- **Independent monitor contexts** - keep communication apps on your laptop while switching contexts on external displays

## 🚀 Demo

**Before**: All 3 monitors switch workspaces together → lose context  
**After**: Laptop shows Slack/email, external monitors switch independently → maintain context

## 📋 Prerequisites

- **GNOME Shell** 40+ (tested on 42, 43, 44, 45)
- **Static workspaces** (not dynamic) - see setup instructions below
- **Multi-monitor setup** (works with 2+ monitors)

## 🛠️ Installation

### Method 1: Manual Installation (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/smart-workspace-manager.git
   cd smart-workspace-manager
   ```

2. **Copy to extensions directory**:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/smart-workspace-manager@local
   cp extension.js metadata.json ~/.local/share/gnome-shell/extensions/smart-workspace-manager@local/
   ```

3. **Restart GNOME Shell**:
   ```bash
   # X11 (Alt+F2, type 'r', press Enter)
   # Wayland (log out and back in)
   ```

4. **Enable the extension**:
   ```bash
   gnome-extensions enable smart-workspace-manager@local
   ```

### Method 2: Extension Manager

1. Download the latest release `.zip` file
2. Open **Extension Manager** 
3. Click **Install from file** and select the `.zip`
4. Enable the extension

## ⚙️ Required Setup

**Switch to Static Workspaces** (required for proper functionality):

```bash
# Disable dynamic workspaces
gsettings set org.gnome.mutter dynamic-workspaces false

# Set number of workspaces (adjust as needed)
gsettings set org.gnome.desktop.wm.preferences num-workspaces 4

# Verify settings
gsettings get org.gnome.mutter dynamic-workspaces
gsettings get org.gnome.desktop.wm.preferences num-workspaces
```

Or via **Settings** → **Multitasking** → **Workspaces** → **Fixed number of workspaces**

## 🎮 How It Works

### The Smart Shifting Algorithm

When you switch workspaces on the **active monitor** (where your mouse is):

1. **Active monitor**: Changes workspace naturally (GNOME handles this)
2. **Other monitors**: Their windows automatically shift to maintain workspace relationships

### Example Scenario

**Initial State** (all monitors on Workspace 1):
- **Monitor 1** (Laptop): Slack
- **Monitor 2** (External): Browser  
- **Monitor 3** (External): Code Editor

**You swipe left on Monitor 3** (goes to Workspace 2):
- **Monitor 1**: Slack moves to Workspace 2 (stays visible)
- **Monitor 2**: Browser moves to Workspace 2 (stays visible)  
- **Monitor 3**: Shows Workspace 2 content (new apps)

**Result**: Monitors 1 & 2 maintain their content, Monitor 3 gets new workspace

## 🐛 Troubleshooting

### Extension not working?
```bash
# Check if enabled
gnome-extensions list --enabled | grep smart-workspace

# Check for errors
journalctl -f -o cat /usr/bin/gnome-shell
```

### Windows getting lost?
- Ensure you're using **static workspaces** (not dynamic)
- Check that you have enough workspaces configured (4-6 recommended)

### Delayed window movement?
- This is normal - the extension works by shifting windows after workspace changes
- The brief animation is a trade-off for compatibility with GNOME's architecture

## 🔧 Configuration

Currently no GUI configuration - all behavior is automatic based on:
- **Laptop monitor detection**: Smallest monitor by resolution
- **Mouse position tracking**: 150ms polling interval
- **Window movement timing**: 50ms delay + 10ms stagger

## 🤝 Contributing

Contributions welcome! This extension pushes GNOME's workspace system in ways it wasn't designed for, so there's room for improvement.

### Areas for enhancement:
- GUI configuration panel
- Custom monitor role assignment
- Gesture sensitivity settings
- Better fullscreen app handling
- Performance optimizations

### Development Setup

1. Fork and clone the repository
2. Make changes to `extension.js`
3. Test with `gnome-extensions disable/enable smart-workspace-manager@local`
4. Submit a pull request

## 📝 Technical Notes

### Why This Approach?

We tried several methods:
1. **Gesture blocking** ❌ - Crashed GNOME's animation system
2. **Window reverting** ❌ - Created feedback loops  
3. **Workspace stack shifting** ✅ - Works WITH GNOME's design

### Architecture

The extension works by:
- Tracking mouse position to determine "active" monitor
- Listening for workspace change events
- Moving windows between workspaces to maintain the illusion of per-monitor independence

It's essentially a clever hack that makes GNOME behave like macOS without breaking core functionality.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- GNOME Shell developers for the extensible architecture
- Community feedback and testing
- Inspired by macOS Mission Control behavior

---

**⭐ Star this repo if it improves your workflow!**

## 📊 Compatibility

| GNOME Version | Status | Notes |
|---------------|--------|--------|
| 40.x | ✅ | Tested |
| 41.x | ✅ | Tested |  
| 42.x | ✅ | Tested |
| 43.x | ✅ | Tested |
| 44.x | ✅ | Tested |
| 45.x | ✅ | Tested |
| 46.x | 🧪 | Should work |