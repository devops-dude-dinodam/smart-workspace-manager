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
        setTimeout(() => {
            this._syncOtherMonitors(direction, workspaceDiff);
        }, 50); // Reduced from default to 50ms
        
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
        const currentWorkspaceIndex = workspaceManager.get_active_workspace().index();
        
        console.log(`Shifting monitor ${monitorIndex + 1} workspaces ${direction} by ${workspaceDiff}`);
        
        // Collect all windows on this monitor across ALL workspaces
        const monitorWindowsByWorkspace = new Map();
        
        for (let wsIndex = 0; wsIndex < numWorkspaces; wsIndex++) {
            const workspace = workspaceManager.get_workspace_by_index(wsIndex);
            const windows = workspace.list_windows();
            const monitorWindows = windows.filter(window => window.get_monitor() === monitorIndex);
            
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
            
            // Handle workspace bounds - no wrapping, just clamp to valid range
            if (newWorkspaceIndex >= numWorkspaces) {
                console.log(`Workspace ${newWorkspaceIndex + 1} exceeds max ${numWorkspaces}, skipping shift for this monitor`);
                return; // Skip this monitor's shift
            } else if (newWorkspaceIndex < 0) {
                console.log(`Workspace ${newWorkspaceIndex + 1} below minimum, skipping shift for this monitor`);
                return; // Skip this monitor's shift
            }
            
            // Skip if the new workspace is the same as old
            if (newWorkspaceIndex === oldWorkspaceIndex) {
                return;
            }
            
            const targetWorkspace = workspaceManager.get_workspace_by_index(newWorkspaceIndex);
            if (!targetWorkspace) {
                console.log(`Invalid target workspace ${newWorkspaceIndex + 1} for monitor ${monitorIndex + 1}`);
                return;
            }
            
            console.log(`Moving ${windows.length} windows from monitor ${monitorIndex + 1} workspace ${oldWorkspaceIndex + 1} → ${newWorkspaceIndex + 1}`);
            
            // Move all windows from this workspace to the new workspace
            windows.forEach((window, index) => {
                setTimeout(() => {
                    try {
                        window.change_workspace(targetWorkspace);
                        console.log(`Moved "${window.get_title()}" to workspace ${newWorkspaceIndex + 1}`);
                    } catch (error) {
                        console.log(`Error moving window: ${error}`);
                    }
                }, index * 10); // 10ms stagger between each window
            });
        });
    }
    
    _moveMonitorWindowsToWorkspace(monitorIndex, targetWorkspace) {
        const currentWorkspace = global.workspace_manager.get_active_workspace();
        
        // Get all windows that need to move
        const currentWindows = currentWorkspace.list_windows().filter(window => window.get_monitor() === monitorIndex);
        const targetWindows = targetWorkspace.list_windows().filter(window => 
            window.get_monitor() === monitorIndex && window.get_workspace() !== currentWorkspace
        );
        
        if (currentWindows.length === 0 && targetWindows.length === 0) {
            return;
        }
        
        console.log(`Syncing monitor ${monitorIndex + 1}: moving ${currentWindows.length} out, bringing ${targetWindows.length} in`);
        
        // Batch all window movements together for speed
        const allMoves = [
            ...currentWindows.map(window => ({ window, target: targetWorkspace, action: 'move_out' })),
            ...targetWindows.map(window => ({ window, target: currentWorkspace, action: 'bring_in' }))
        ];
        
        // Execute all moves rapidly
        allMoves.forEach(({ window, target }, index) => {
            // Slight stagger to avoid overwhelming the system
            setTimeout(() => {
                try {
                    window.change_workspace(target);
                } catch (error) {
                    console.log(`Error moving window: ${error}`);
                }
            }, index * 5); // 5ms stagger between each window
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
        
        console.log('Smart Workspace Manager destroyed');
        super.destroy();
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