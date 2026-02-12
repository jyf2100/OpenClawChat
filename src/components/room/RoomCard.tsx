/**
 * 房间卡片组件
 * 显示多网关群聊房间的信息
 */

import React from 'react';
import { Room } from '../../types';

interface RoomCardProps {
  room: Room;
  isActive?: boolean;
  onClick?: () => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ room, isActive, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`
        room-item flex items-center gap-3 p-3 rounded-lg cursor-pointer
        ${isActive
          ? 'bg-indigo-600 text-white active'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }
      `}
      title={`${room.name}\n${room.members?.length || 0} 位成员\n${room.unreadCount} 条未读消息`}
    >
      {/* 房间图标 */}
      <div className={`
        flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
        ${isActive ? 'bg-white/20' : 'bg-indigo-500 text-white'}
      `}>
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
      </div>

      {/* 房间信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium truncate">{room.name}</h3>
          {room.unreadCount > 0 && (
            room.unreadCount > 99
              ? <div className="unread-dot" title={`${room.unreadCount} 条未读`} />
              : <span className={`
                  flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold unread-badge
                  ${isActive ? 'bg-white text-indigo-600' : 'bg-indigo-500 text-white'}
                `}>
                  {room.unreadCount}
                </span>
          )}
        </div>

        {/* 最后消息预览 */}
        {room.lastMessage && (
          <p className={`
            text-sm truncate mt-0.5
            ${isActive ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}
          `}>
            {room.lastMessage.sender && `${room.lastMessage.sender}: `}
            {room.lastMessage.content}
          </p>
        )}

        {/* 成员数量 */}
        {room.members && room.members.length > 0 && (
          <div className={`
            flex items-center gap-1 mt-1 text-xs
            ${isActive ? 'text-white/60' : 'text-gray-400'}
          `}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            <span>{room.members.length}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomCard;
