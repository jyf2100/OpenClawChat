import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  CollaborationSession,
  CollaborationParticipant,
  JudgeResponse,
  HumanJudgeInput,
  JudgeConfig,
  CollaborationTerminationReason,
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
    userMessage: string,
    options?: {
      maxRounds?: number;
      judge?: JudgeConfig;
    }
  ) => string;

  completeStep: (sessionId: string, stepIndex: number) => void;
  failStep: (sessionId: string, stepIndex: number, error: string) => void;
  nextStep: (sessionId: string) => boolean;
  nextRound: (sessionId: string) => boolean;
  pauseSession: (sessionId: string) => void;
  resumeSession: (sessionId: string) => void;
  completeSession: (sessionId: string) => void;
  cancelSession: (sessionId: string) => void;
  terminateSession: (sessionId: string, reason: CollaborationTerminationReason) => void;
  clearAllActiveSessions: () => void;
  registerStepKey: (key: string, info: StepInfo) => void;
  getStepByKey: (key: string) => StepInfo | undefined;
  clearStepKey: (key: string) => void;
  addJudgeResponse: (sessionId: string, response: JudgeResponse) => void;
  addHumanJudgeInput: (sessionId: string, input: HumanJudgeInput) => void;

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
      
      startSession: (roomId, participants, userMessageId, userMessage, options) => {
        const sessionId = generateUUID();

        const session: CollaborationSession = {
          sessionId,
          roomId,
          status: 'active',
          currentStep: 0,
          currentRound: 1,
          maxRounds: options?.maxRounds ?? 10,
          participants,
          judge: options?.judge,
          userMessageId,
          userMessage,
          completedSteps: [],
          failedSteps: {},
          judgeResponses: [],
          humanJudgeInputs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          sessions: { ...state.sessions, [sessionId]: session },
          roomSessionMap: { ...state.roomSessionMap, [roomId]: sessionId },
        }));

        console.log('[CollaborationStore] 会话已启动:', sessionId, '房间:', roomId, '最大轮次:', session.maxRounds);
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

        // 注意：不自动完成 session，由调用方决定是否进入下一轮或完成
        if (nextStepIndex >= session.participants.length) {
          return false;  // 表示当前轮次的最后一步
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

      nextRound: (sessionId) => {
        const session = get().sessions[sessionId];
        if (!session || session.status !== 'active') return false;

        const nextRoundNumber = session.currentRound + 1;

        if (nextRoundNumber > session.maxRounds) {
          console.log('[CollaborationStore] 已达最大轮次，无法继续:', session.maxRounds);
          return false;
        }

        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              currentStep: 0,  // 重置步骤
              currentRound: nextRoundNumber,
              updatedAt: Date.now(),
            },
          },
        }));

        console.log('[CollaborationStore] 进入下一轮:', sessionId, 'Round', nextRoundNumber);
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

      terminateSession: (sessionId, reason) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          const newRoomSessionMap = { ...state.roomSessionMap };
          delete newRoomSessionMap[session.roomId];

          console.log('[CollaborationStore] 会话已终止:', sessionId, '原因:', reason);

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                status: 'completed',
                terminationReason: reason,
                updatedAt: Date.now(),
              },
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

      addJudgeResponse: (sessionId, response) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                judgeResponses: [...session.judgeResponses, response],
                updatedAt: Date.now(),
              },
            },
          };
        });
        console.log('[CollaborationStore] 添加裁判响应:', sessionId, 'Round', response.round);
      },

      addHumanJudgeInput: (sessionId, input) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                humanJudgeInputs: [...session.humanJudgeInputs, input],
                updatedAt: Date.now(),
              },
            },
          };
        });
        console.log('[CollaborationStore] 添加人工裁判输入:', sessionId, 'Round', input.round);
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
