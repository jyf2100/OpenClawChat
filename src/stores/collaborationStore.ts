import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  CollaborationSession,
  CollaborationParticipant,
} from '../types';
import { generateUUID } from '../lib/protocol';

interface StepInfo {
  roomId: string;
  sessionId: string;
  step: number;
  participantName: string;
  participantColor: string;
}

interface CollaborationStore {
  sessions: Record<string, CollaborationSession>;
  roomSessionMap: Record<string, string>;
  stepKeyMap: Record<string, StepInfo>;
  
  startSession: (
    roomId: string,
    participants: CollaborationParticipant[],
    userMessageId: string,
    userMessage: string
  ) => string;
  
  completeStep: (sessionId: string, stepIndex: number) => void;
  failStep: (sessionId: string, stepIndex: number, error: string) => void;
  nextStep: (sessionId: string) => boolean;
  pauseSession: (sessionId: string) => void;
  resumeSession: (sessionId: string) => void;
  completeSession: (sessionId: string) => void;
  cancelSession: (sessionId: string) => void;
  clearAllActiveSessions: () => void;
  registerStepKey: (key: string, info: StepInfo) => void;
  getStepByKey: (key: string) => StepInfo | undefined;
  clearStepKey: (key: string) => void;
  
  getSession: (sessionId: string) => CollaborationSession | undefined;
  getActiveSessionByRoom: (roomId: string) => CollaborationSession | undefined;
  isRoomInCollaboration: (roomId: string) => boolean;
  getCurrentParticipant: (sessionId: string) => CollaborationParticipant | undefined;
}

export const useCollaborationStore = create<CollaborationStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      roomSessionMap: {},
      stepKeyMap: {},
      
      startSession: (roomId, participants, userMessageId, userMessage) => {
        const sessionId = generateUUID();
        
        const session: CollaborationSession = {
          sessionId,
          roomId,
          status: 'active',
          currentStep: 0,
          participants,
          userMessageId,
          userMessage,
          completedSteps: [],
          failedSteps: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        
        set((state) => ({
          sessions: { ...state.sessions, [sessionId]: session },
          roomSessionMap: { ...state.roomSessionMap, [roomId]: sessionId },
        }));
        
        console.log('[CollaborationStore] 会话已启动:', sessionId, '房间:', roomId);
        return sessionId;
      },
      
      completeStep: (sessionId, stepIndex) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          
          if (session.completedSteps.includes(stepIndex)) return state;
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                completedSteps: [...session.completedSteps, stepIndex],
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      
      failStep: (sessionId, stepIndex, error) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          
          const newFailedSteps = { ...session.failedSteps, [stepIndex]: error };
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                failedSteps: newFailedSteps,
                updatedAt: Date.now(),
              },
            },
          };
        });
        console.warn('[CollaborationStore] 步骤失败:', sessionId, stepIndex, error);
      },
      
      nextStep: (sessionId) => {
        const session = get().sessions[sessionId];
        if (!session || session.status !== 'active') return false;
        
        const nextStepIndex = session.currentStep + 1;
        
        if (nextStepIndex >= session.participants.length) {
          get().completeSession(sessionId);
          return false;
        }
        
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              currentStep: nextStepIndex,
              updatedAt: Date.now(),
            },
          },
        }));
        
        console.log('[CollaborationStore] 进入下一步:', sessionId, nextStepIndex);
        return true;
      },
      
      pauseSession: (sessionId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session || session.status !== 'active') return state;
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, status: 'paused', updatedAt: Date.now() },
            },
          };
        });
      },
      
      resumeSession: (sessionId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session || session.status !== 'paused') return state;
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, status: 'active', updatedAt: Date.now() },
            },
          };
        });
      },
      
      completeSession: (sessionId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          
          const newRoomSessionMap = { ...state.roomSessionMap };
          delete newRoomSessionMap[session.roomId];
          
          console.log('[CollaborationStore] 会话已完成:', sessionId);
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, status: 'completed', updatedAt: Date.now() },
            },
            roomSessionMap: newRoomSessionMap,
          };
        });
      },
      
      cancelSession: (sessionId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          
          const newSessions = { ...state.sessions };
          delete newSessions[sessionId];
          
          const newRoomSessionMap = { ...state.roomSessionMap };
          delete newRoomSessionMap[session.roomId];
          
          console.log('[CollaborationStore] 会话已取消:', sessionId);
          
          return {
            sessions: newSessions,
            roomSessionMap: newRoomSessionMap,
          };
        });
      },
      
      clearAllActiveSessions: () => {
        const state = get();
        const activeSessionIds = Object.keys(state.sessions).filter(
          id => state.sessions[id].status === 'active'
        );
        
        if (activeSessionIds.length === 0) return;
        
        const newSessions = { ...state.sessions };
        const newRoomSessionMap = { ...state.roomSessionMap };
        
        activeSessionIds.forEach(id => {
          const session = newSessions[id];
          if (session) {
            delete newRoomSessionMap[session.roomId];
            delete newSessions[id];
          }
        });
        
        console.log('[CollaborationStore] 清理所有活跃会话:', activeSessionIds.length);
        
        set({
          sessions: newSessions,
          roomSessionMap: newRoomSessionMap,
        });
      },
      
      registerStepKey: (key, info) => {
        set((state) => ({
          stepKeyMap: { ...state.stepKeyMap, [key]: info },
        }));
        console.log('[CollaborationStore] 注册步骤键:', key, info);
      },
      
      getStepByKey: (key) => get().stepKeyMap[key],
      
      clearStepKey: (key) => {
        set((state) => {
          const newMap = { ...state.stepKeyMap };
          delete newMap[key];
          return { stepKeyMap: newMap };
        });
      },
      
      getSession: (sessionId) => get().sessions[sessionId],
      
      getActiveSessionByRoom: (roomId) => {
        const sessionId = get().roomSessionMap[roomId];
        if (!sessionId) return undefined;
        const session = get().sessions[sessionId];
        return session?.status === 'active' ? session : undefined;
      },
      
      isRoomInCollaboration: (roomId) => {
        const sessionId = get().roomSessionMap[roomId];
        if (!sessionId) return false;
        const session = get().sessions[sessionId];
        return session?.status === 'active';
      },
      
      getCurrentParticipant: (sessionId) => {
        const session = get().sessions[sessionId];
        if (!session || session.status !== 'active') return undefined;
        return session.participants[session.currentStep];
      },
    }),
    {
      name: 'clawchat.collaboration',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
