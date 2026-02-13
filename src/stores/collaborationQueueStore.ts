import { create } from 'zustand';

interface QueuedMessage {
  id: string;
  content: string;
  timestamp: number;
}

interface CollaborationQueueStore {
  queues: Record<string, QueuedMessage[]>;
  
  enqueue: (roomId: string, content: string) => void;
  dequeue: (roomId: string) => QueuedMessage | undefined;
  peek: (roomId: string) => QueuedMessage | undefined;
  clear: (roomId: string) => void;
  hasPending: (roomId: string) => boolean;
  getQueueLength: (roomId: string) => number;
}

export const useCollaborationQueueStore = create<CollaborationQueueStore>((set, get) => ({
  queues: {},
  
  enqueue: (roomId, content) => {
    const message: QueuedMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      content,
      timestamp: Date.now(),
    };
    
    set((state) => {
      const currentQueue = state.queues[roomId] || [];
      return {
        queues: {
          ...state.queues,
          [roomId]: [...currentQueue, message],
        },
      };
    });
    
    console.log('[CollaborationQueue] 消息已入队:', roomId, message.id);
  },
  
  dequeue: (roomId) => {
    const queue = get().queues[roomId] || [];
    if (queue.length === 0) return undefined;
    
    const [first, ...rest] = queue;
    
    set((state) => {
      const newQueues = { ...state.queues };
      if (rest.length > 0) {
        newQueues[roomId] = rest;
      } else {
        delete newQueues[roomId];
      }
      return { queues: newQueues };
    });
    
    console.log('[CollaborationQueue] 消息已出队:', roomId, first.id);
    return first;
  },
  
  peek: (roomId) => {
    const queue = get().queues[roomId] || [];
    return queue[0];
  },
  
  clear: (roomId) => {
    set((state) => {
      const newQueues = { ...state.queues };
      delete newQueues[roomId];
      return { queues: newQueues };
    });
    console.log('[CollaborationQueue] 队列已清空:', roomId);
  },
  
  hasPending: (roomId) => {
    const queue = get().queues[roomId] || [];
    return queue.length > 0;
  },
  
  getQueueLength: (roomId) => {
    return (get().queues[roomId] || []).length;
  },
}));
