import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SidebarStore {
  expandedGateways: Record<string, boolean>;
  
  toggleGateway: (gatewayId: string) => void;
  setGatewayExpanded: (gatewayId: string, expanded: boolean) => void;
  isGatewayExpanded: (gatewayId: string) => boolean;
  expandAll: (gatewayIds: string[]) => void;
  collapseAll: () => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set, get) => ({
      expandedGateways: {},
      
      toggleGateway: (gatewayId: string) => {
        set((state) => ({
          expandedGateways: {
            ...state.expandedGateways,
            [gatewayId]: !state.expandedGateways[gatewayId],
          },
        }));
      },
      
      setGatewayExpanded: (gatewayId: string, expanded: boolean) => {
        set((state) => ({
          expandedGateways: {
            ...state.expandedGateways,
            [gatewayId]: expanded,
          },
        }));
      },
      
      isGatewayExpanded: (gatewayId: string) => {
        return get().expandedGateways[gatewayId] === true;
      },
      
      expandAll: (gatewayIds: string[]) => {
        const expanded: Record<string, boolean> = {};
        gatewayIds.forEach(id => {
          expanded[id] = true;
        });
        set({ expandedGateways: expanded });
      },
      
      collapseAll: () => {
        set({ expandedGateways: {} });
      },
    }),
    {
      name: 'clawchat.sidebar',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
