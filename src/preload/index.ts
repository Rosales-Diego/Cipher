import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Exposing only the necessary communication channels, manually
const electronAPI = {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args)
  }
}

// Exposing extra utilities
const customAPI = {
  getPath: (file: File) => webUtils.getPathForFile(file)
}

// Injecting this into React through the Context Isolation wall
try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', customAPI)
} catch (error) {
  console.error('Error inyectando el preload:', error)
}