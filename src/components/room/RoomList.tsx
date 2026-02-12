/**
 * 房间列表组件
 * 显示所有多网关群聊房间
 */

import React from 'react';
import { useRoomStore } from '../../stores/roomStore';
import RoomCard from './RoomCard';

interface RoomListProps {
  filterType?: 'channel' | 'private' | 'group' | 'all';
}

export const RoomList: React.FC<RoomListProps> = ({ filterType = 'all' }) => {
  const { rooms, activeRoomId, setActiveRoom } = useRoomStore();

  // 过滤房间
  const filteredRooms = React.useMemo(() => {
    if (filterType === 'all') return rooms;
    return rooms.filter(room => room.type === filterType);
  }, [rooms, filterType]);

  // 按最后消息时间排序
  const sortedRooms = React.useMemo(() => {
    return [...filteredRooms].sort((a, b) => {
      const aTime = a.lastMessage?.timestamp || 0;
      const bTime = b.lastMessage?.timestamp || 0;
      return bTime - aTime;
    });
  }, [filteredRooms]);

  const handleRoomClick = (roomId: string) => {
    setActiveRoom(roomId);
  };

  if (sortedRooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
        <p className="text-sm text-gray-500 dark:text-gray-400">暂无房间</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 房间列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {sortedRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isActive={activeRoomId === room.id}
              onClick={() => handleRoomClick(room.id)}
            />
          ))}
        </div>
      </div>

      {/* 房间计数 */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          {sortedRooms.length} 个房间
        </p>
      </div>
    </div>
  );
};

export default RoomList;
