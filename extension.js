// extension.js - Smart Workspace Extension - Clean Version
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
        
        // Listen for monitor changes
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._handleMonitorChange();
        });
        
        // Initial setup
        this._handleMonitorChange();
    }
    
    _handleMonitorChange() {
        const numMonitors = Main.layoutManager.monitors.length;
        
        console.log(`Monitor change detected: ${numMonitors} monitor(s) connected`);
        
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
        
        if (monitorIndex >= 0) {
            const isExternal = monitorIndex !== this._laptopMonitorIndex;
            const monitorType = isExternal ? "External" : "Laptop";
            
            // Update state
            if (this._currentMonitorIndex !== monitorIndex) {
                this._currentMonitorIndex = monitorIndex;
                this._isOnExternalMonitor = isExternal;
                
                console.log(`Mouse on ${monitorType} monitor ${monitorIndex + 1}`);
            }
        }
    }
    
    _onWorkspaceChanged() {
        if (!this._isActive) {
            return; // Don't sync if disabled
        }
        
        const workspaceManager = global.workspace_manager;
        const currentWorkspaceIndex = workspaceManager.get_active_workspace().index();
        const previousWorkspaceIndex = this._lastWorkspaceIndex;
        
        console.log(`Workspace changed from ${previousWorkspaceIndex + 1} to ${currentWorkspaceIndex + 1}, active monitor: ${this._currentMonitorIndex + 1}`);
        
        // Calculate workspace direction
        const direction = currentWorkspaceIndex > previousWorkspaceIndex ? 'right' : 'left';
        const workspaceDiff = Math.abs(currentWorkspaceIndex - previousWorkspaceIndex);
        
        console.log(`Workspace moved ${direction} by ${workspaceDiff}, syncing other monitors`);
        
        // Sync immediately with minimal delay
        this._syncTimeoutId = setTimeout(() => {
            this._syncOtherMonitors(direction, workspaceDiff);
        }, 50);
        
        // Update last workspace
        this._lastWorkspaceIndex = currentWorkspaceIndex;
    }
    
    _syncOtherMonitors(direction, workspaceDiff) {
        console.log(`Syncing all monitors: shifting workspaces ${direction} by ${workspaceDiff}`);
        
        // For each monitor (except the active one), shift ALL their workspaces
        for (let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
            if (monitorIndex === this._currentMonitorIndex) {
                // Skip the active monitor - it already changed naturally
                continue;
            }
            
            this._shiftMonitorWorkspaces(monitorIndex, direction, workspaceDiff);
        }
    }
    
    _shiftMonitorWorkspaces(monitorIndex, direction, workspaceDiff) {
        const workspaceManager = global.workspace_manager;
        const numWorkspaces = workspaceManager.get_n_workspaces();
        
        console.log(`Shifting monitor ${monitorIndex + 1} workspaces ${direction} by ${workspaceDiff}`);
        console.log(`Total workspaces: ${numWorkspaces}`);
        
        // Collect all windows on this monitor across ALL workspaces
        const monitorWindowsByWorkspace = new Map();
        
        for (let wsIndex = 0; wsIndex < numWorkspaces; wsIndex++) {
            const workspace = workspaceManager.get_workspace_by_index(wsIndex);
            if (!workspace) continue;
            
            const windows = workspace.list_windows();
            const monitorWindows = windows.filter(window => {
                try {
                    return window && window.get_monitor && window.get_monitor() === monitorIndex;
                } catch (e) {
                    console.log(`Error checking window monitor: ${e}`);
                    return false;
                }
            });
            
            if (monitorWindows.length > 0) {
                monitorWindowsByWorkspace.set(wsIndex, monitorWindows);
            }
        }
        
        console.log(`Found windows on monitor ${monitorIndex + 1} across ${monitorWindowsByWorkspace.size} workspaces`);
        
        // Now shift all windows according to the direction
        monitorWindowsByWorkspace.forEach((windows, oldWorkspaceIndex) => {
            let newWorkspaceIndex;
            
            if (direction === 'right') {
                newWorkspaceIndex = oldWorkspaceIndex + workspaceDiff;
            } else {
                newWorkspaceIndex = oldWorkspaceIndex - workspaceDiff;
            }
            
            // Simple bounds checking
            if (newWorkspaceIndex < 0 || newWorkspaceIndex >= numWorkspaces) {
                console.log(`Target workspace ${newWorkspaceIndex + 1} out of bounds, skipping`);
                return;
            }
            
            // Skip if the new workspace is the same as old
            if (newWorkspaceIndex === oldWorkspaceIndex) {
                return;
            }
            
            const targetWorkspace = workspaceManager.get_workspace_by_index(newWorkspaceIndex);
            
            if (!targetWorkspace) {
                console.log(`Workspace ${newWorkspaceIndex + 1} doesn't exist, skipping`);
                return;
            }
            
            console.log(`Moving ${windows.length} windows from workspace ${oldWorkspaceIndex + 1} → ${newWorkspaceIndex + 1}`);
            
            // Move all windows
            windows.forEach((window, index) => {
                const timeoutId = setTimeout(() => {
                    try {
                        window.change_workspace(targetWorkspace);
                        console.log(`Moved "${window.get_title()}" to workspace ${newWorkspaceIndex + 1}`);
                    } catch (error) {
                        console.log(`Error moving window: ${error}`);
                    }
                }, index * 10);
                
                // Track timeout for cleanup
                this._windowMoveTimeouts.push(timeoutId);
            });
        });
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
        
        // Clean up timeouts
        if (this._syncTimeoutId) {
            clearTimeout(this._syncTimeoutId);
            this._syncTimeoutId = null;
        }
        
        // Clean up any pending window move timeouts
        this._windowMoveTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this._windowMoveTimeouts = [];
        
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