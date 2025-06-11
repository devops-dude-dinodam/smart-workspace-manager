// extension.js - Smart Workspace Extension - Dynamic Workspace Support
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SmartWorkspaceManager = GObject.registerClass(
class SmartWorkspaceManager extends GObject.Object {
    _init() {
        super._init();
        
        // Track current monitor and state
        this._currentMonitorIndex = -1;
        this._isOnExternalMonitor = false;
        this._laptopMonitorIndex = -1;
        this._lastWorkspaceIndex = 0;
        this._isActive = false;
        
        // Track timeout IDs for cleanup
        this._syncTimeoutId = null;
        this._windowMoveTimeouts = [];
        
        // Track workspace offsets per monitor
        this._monitorWorkspaceOffsets = new Map(); // Map<monitorIndex, offset>
        
        // Track windows per monitor and workspace
        this._windowTracker = new Map(); // Map<monitorIndex, Map<workspaceIndex, window[]>>
        
        // Listen for monitor changes
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._handleMonitorChange();
        });
        
        // Listen for workspace changes
        this._workspaceAddedId = global.workspace_manager.connect('workspace-added', () => {
            this._onWorkspaceAdded();
        });
        this._workspaceRemovedId = global.workspace_manager.connect('workspace-removed', () => {
            this._onWorkspaceRemoved();
        });
        
        // Initial setup
        this._handleMonitorChange();
    }
    
    _handleMonitorChange() {
        const numMonitors = Main.layoutManager.monitors.length;
        
        console.log(`Monitor change detected: ${numMonitors} monitor(s) connected`);
        
        // Clean up existing offsets and window tracker
        this._monitorWorkspaceOffsets.clear();
        this._windowTracker.clear();
        
        if (numMonitors <= 1) {
            console.log('Single monitor detected - disabling workspace sync');
            this._disableSync();
        } else {
            console.log(`${numMonitors} monitors detected - enabling workspace sync`);
            this._enableSync();
        }
    }
    
    _enableSync() {
        if (this._isActive) {
            console.log('Sync already active, skipping enable');
            return;
        }
        
        console.log('Enabling multi-monitor workspace sync');
        this._isActive = true;
        
        // Initialize offsets for each monitor
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            this._monitorWorkspaceOffsets.set(i, 0);
        }
        
        // Find laptop monitor
        this._identifyLaptopMonitor();
        
        // Start tracking
        this._startTracking();
    }
    
    _disableSync() {
        if (!this._isActive) {
            console.log('Sync already disabled, skipping disable');
            return;
        }
        
        console.log('Disabling workspace sync (single monitor mode)');
        this._isActive = false;
        
        // Stop mouse tracking
        if (this._mouseTracker) {
            clearInterval(this._mouseTracker);
            this._mouseTracker = null;
        }
        
        // Disconnect workspace signals
        if (this._workspaceChangedId) {
            global.workspace_manager.disconnect(this._workspaceChangedId);
            this._workspaceChangedId = null;
        }
        
        // Disconnect dynamic workspace signals
        if (this._workspaceAddedId) {
            global.workspace_manager.disconnect(this._workspaceAddedId);
            this._workspaceAddedId = null;
        }
        if (this._workspaceRemovedId) {
            global.workspace_manager.disconnect(this._workspaceRemovedId);
            this._workspaceRemovedId = null;
        }
        
        // Clean up timeouts
        if (this._syncTimeoutId) {
            clearTimeout(this._syncTimeoutId);
            this._syncTimeoutId = null;
        }
        
        // Clean up any pending window move timeouts
        this._windowMoveTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this._windowMoveTimeouts = [];
        
        // Reset state
        this._currentMonitorIndex = -1;
        this._isOnExternalMonitor = false;
        this._laptopMonitorIndex = -1;
        this._monitorWorkspaceOffsets.clear();
        this._windowTracker.clear();
    }
    
    _identifyLaptopMonitor() {
        const monitors = Main.layoutManager.monitors;
        
        if (monitors.length <= 1) {
            this._laptopMonitorIndex = 0;
            return;
        }
        
        // Find smallest monitor as laptop
        let smallestMonitor = 0;
        let smallestArea = monitors[0].width * monitors[0].height;
        
        for (let i = 1; i < monitors.length; i++) {
            const area = monitors[i].width * monitors[i].height;
            if (area < smallestArea) {
                smallestArea = area;
                smallestMonitor = i;
            }
        }
        
        this._laptopMonitorIndex = smallestMonitor;
        console.log(`Identified monitor ${smallestMonitor + 1} as laptop monitor`);
    }
    
    _startTracking() {
        if (!this._isActive) {
            console.log('Sync disabled, not starting tracking');
            return;
        }
        
        // Track mouse position
        this._mouseTracker = setInterval(() => {
            this._updateMonitorFocus();
        }, 150);
        
        // Track workspace changes
        const workspaceManager = global.workspace_manager;
        this._lastWorkspaceIndex = workspaceManager.get_active_workspace().index();
        
        this._workspaceChangedId = workspaceManager.connect('active-workspace-changed', () => {
            this._onWorkspaceChanged();
        });
        
        // Initialize window tracking
        this._updateWindowTracker();
        
        console.log('Multi-monitor workspace sync enabled');
        this._updateMonitorFocus();
    }
    
    _updateMonitorFocus() {
        const [x, y] = global.get_pointer();
        
        // Find which monitor contains the mouse cursor
        let monitorIndex = -1;
        
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            const monitor = Main.layoutManager.monitors[i];
            if (x >= monitor.x && x < monitor.x + monitor.width &&
                y >= monitor.y && y < monitor.y + monitor.height) {
                monitorIndex = i;
                break;
            }
        }
        
        if (monitorIndex >= 0 && monitorIndex !== this._currentMonitorIndex) {
            const isExternal = monitorIndex !== this._laptopMonitorIndex;
            const monitorType = isExternal ? "External" : "Laptop";
            
            // Update state
            this._currentMonitorIndex = monitorIndex;
            this._isOnExternalMonitor = isExternal;
            
            console.log(`Mouse on ${monitorType} monitor ${monitorIndex + 1}`);
            
            // Refresh window tracker when monitor focus changes
            this._updateWindowTracker();
        }
    }
    
    _updateWindowTracker() {
        this._windowTracker.clear();
        const workspaceManager = global.workspace_manager;
        const numWorkspaces = workspaceManager.get_n_workspaces();
        
        for (let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
            const monitorWindows = new Map();
            for (let wsIndex = 0; wsIndex < numWorkspaces; wsIndex++) {
                const workspace = workspaceManager.get_workspace_by_index(wsIndex);
                if (!workspace) continue;
                
                const windows = workspace.list_windows().filter(window => {
                    try {
                        return window && window.get_monitor && window.get_monitor() === monitorIndex;
                    } catch (e) {
                        console.log(`Error checking window monitor: ${e}`);
                        return false;
                    }
                });
                
                if (windows.length > 0) {
                    monitorWindows.set(wsIndex, windows);
                }
            }
            this._windowTracker.set(monitorIndex, monitorWindows);
        }
        
        console.log(`Updated window tracker for ${this._windowTracker.size} monitors`);
    }
    
    _onWorkspaceChanged() {
        if (!this._isActive) {
            return; // Don't sync if disabled
        }
        
        const workspaceManager = global.workspace_manager;
        const currentWorkspaceIndex = workspaceManager.get_active_workspace().index();
        const previousWorkspaceIndex = this._lastWorkspaceIndex;
        
        // Get current mouse position to determine active monitor
        const [x, y] = global.get_pointer();
        let mouseMonitor = -1;
        
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            const monitor = Main.layoutManager.monitors[i];
            if (x >= monitor.x && x < monitor.x + monitor.width &&
                y >= monitor.y && y < monitor.y + monitor.height) {
                mouseMonitor = i;
                break;
            }
        }
        
        console.log(`Workspace changed from ${previousWorkspaceIndex + 1} to ${currentWorkspaceIndex + 1}, mouse on monitor: ${mouseMonitor + 1}, tracked active monitor: ${this._currentMonitorIndex + 1}`);
        
        // Only sync if workspace change happened on the monitor with mouse focus
        // This prevents syncing when windows are manually moved between workspaces
        if (mouseMonitor !== this._currentMonitorIndex) {
            console.log(`Workspace change detected but mouse not on tracked active monitor, skipping sync (likely window move)`);
            this._lastWorkspaceIndex = currentWorkspaceIndex;
            this._updateWindowTracker();
            return;
        }
        
        // Calculate relative offset
        const offsetDiff = currentWorkspaceIndex - previousWorkspaceIndex;
        
        console.log(`Workspace offset changed by ${offsetDiff}, syncing other monitors (trackpad gesture detected)`);
        
        // Update offset for active monitor
        this._monitorWorkspaceOffsets.set(
            this._currentMonitorIndex,
            (this._monitorWorkspaceOffsets.get(this._currentMonitorIndex) || 0) + offsetDiff
        );
        
        // Sync immediately with minimal delay
        this._syncTimeoutId = setTimeout(() => {
            this._syncOtherMonitors(offsetDiff);
        }, 50);
        
        // Update last workspace
        this._lastWorkspaceIndex = currentWorkspaceIndex;
        
        // Refresh window tracker
        this._updateWindowTracker();
    }
    
    _onWorkspaceAdded() {
        console.log('New workspace added, updating sync');
        this._updateWindowTracker();
        
        // Ensure all monitors have the new workspace accounted for
        const workspaceManager = global.workspace_manager;
        const newWorkspaceIndex = workspaceManager.get_n_workspaces() - 1;
        
        for (let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
            if (!this._windowTracker.has(monitorIndex)) {
                this._windowTracker.set(monitorIndex, new Map());
            }
            // Initialize empty window list for new workspace
            this._windowTracker.get(monitorIndex).set(newWorkspaceIndex, []);
        }
        
        console.log(`Added workspace ${newWorkspaceIndex + 1} to all monitors`);
    }
    
    _onWorkspaceRemoved() {
        console.log('Workspace removed, resyncing monitors');
        const workspaceManager = global.workspace_manager;
        const numWorkspaces = workspaceManager.get_n_workspaces();
        
        // Redistribute windows from removed workspace
        this._windowTracker.forEach((monitorWindows, monitorIndex) => {
            monitorWindows.forEach((windows, wsIndex) => {
                if (wsIndex >= numWorkspaces) {
                    // Move windows to the last valid workspace
                    const targetWorkspace = workspaceManager.get_workspace_by_index(numWorkspaces - 1);
                    windows.forEach((window, index) => {
                        const timeoutId = setTimeout(() => {
                            try {
                                window.change_workspace(targetWorkspace);
                                console.log(`Moved "${window.get_title()}" to workspace ${numWorkspaces}`);
                            } catch (error) {
                                console.log(`Error moving window: ${error}`);
                            }
                        }, index * 10);
                        this._windowMoveTimeouts.push(timeoutId);
                    });
                    monitorWindows.delete(wsIndex);
                }
            });
        });
        
        // Update offsets to prevent drift
        this._monitorWorkspaceOffsets.forEach((offset, monitorIndex) => {
            if (offset >= numWorkspaces) {
                this._monitorWorkspaceOffsets.set(monitorIndex, numWorkspaces - 1);
            }
        });
        
        this._updateWindowTracker();
        console.log('Workspace removal handled, sync restored');
    }
    
    _syncOtherMonitors(offsetDiff) {
        console.log(`Syncing all monitors: applying offset ${offsetDiff}`);
        
        const workspaceManager = global.workspace_manager;
        const numWorkspaces = workspaceManager.get_n_workspaces();
        
        for (let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
            if (monitorIndex === this._currentMonitorIndex) {
                // Skip the active monitor
                continue;
            }
            
            // Update offset for this monitor
            const currentOffset = this._monitorWorkspaceOffsets.get(monitorIndex) || 0;
            const newOffset = Math.max(0, Math.min(currentOffset + offsetDiff, numWorkspaces - 1));
            this._monitorWorkspaceOffsets.set(monitorIndex, newOffset);
            
            // Shift windows based on new offset
            const monitorWindows = this._windowTracker.get(monitorIndex) || new Map();
            const updatedWindows = new Map();
            
            monitorWindows.forEach((windows, oldWorkspaceIndex) => {
                let newWorkspaceIndex = oldWorkspaceIndex + offsetDiff;
                
                // Clamp to valid workspace indices
                if (newWorkspaceIndex < 0 || newWorkspaceIndex >= numWorkspaces) {
                    console.log(`Target workspace ${newWorkspaceIndex + 1} out of bounds, clamping`);
                    newWorkspaceIndex = Math.max(0, Math.min(newWorkspaceIndex, numWorkspaces - 1));
                }
                
                const targetWorkspace = workspaceManager.get_workspace_by_index(newWorkspaceIndex);
                if (!targetWorkspace) {
                    console.log(`Workspace ${newWorkspaceIndex + 1} doesn't exist, skipping`);
                    return;
                }
                
                console.log(`Moving ${windows.length} windows from workspace ${oldWorkspaceIndex + 1} → ${newWorkspaceIndex + 1}`);
                
                windows.forEach((window, index) => {
                    const timeoutId = setTimeout(() => {
                        try {
                            window.change_workspace(targetWorkspace);
                            console.log(`Moved "${window.get_title()}" to workspace ${newWorkspaceIndex + 1}`);
                        } catch (error) {
                            console.log(`Error moving window: ${error}`);
                        }
                    }, index * 10);
                    this._windowMoveTimeouts.push(timeoutId);
                });
                
                // Update window tracker
                if (!updatedWindows.has(newWorkspaceIndex)) {
                    updatedWindows.set(newWorkspaceIndex, []);
                }
                updatedWindows.get(newWorkspaceIndex).push(...windows);
            });
            
            this._windowTracker.set(monitorIndex, updatedWindows);
        }
    }
    
    destroy() {
        // Disconnect monitor change listener
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        
        // Clean up tracking
        if (this._mouseTracker) {
            clearInterval(this._mouseTracker);
            this._mouseTracker = null;
        }
        
        if (this._workspaceChangedId) {
            global.workspace_manager.disconnect(this._workspaceChangedId);
            this._workspaceChangedId = null;
        }
        
        // Clean up dynamic workspace signals
        if (this._workspaceAddedId) {
            global.workspace_manager.disconnect(this._workspaceAddedId);
            this._workspaceAddedId = null;
        }
        if (this._workspaceRemovedId) {
            global.workspace_manager.disconnect(this._workspaceRemovedId);
            this._workspaceRemovedId = null;
        }
        
        // Clean up timeouts
        if (this._syncTimeoutId) {
            clearTimeout(this._syncTimeoutId);
            this._syncTimeoutId = null;
        }
        
        // Clean up any pending window move timeouts
        this._windowMoveTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this._windowMoveTimeouts = [];
        
        // Clear dynamic state
        this._monitorWorkspaceOffsets.clear();
        this._windowTracker.clear();
        
        console.log('Smart Workspace Manager destroyed');
    }
});

class Extension {
    constructor() {
        this._workspaceManager = null;
    }
    
    enable() {
        this._workspaceManager = new SmartWorkspaceManager();
    }
    
    disable() {
        if (this._workspaceManager) {
            this._workspaceManager.destroy();
            this._workspaceManager = null;
        }
    }
}

export default Extension;