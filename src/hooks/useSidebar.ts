import { useState, useEffect } from 'react';
import { useMediaQuery } from './useMediaQuery';

export function useSidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile);

  // Auto-close sidebar on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Auto-open sidebar on desktop if it was closed on mobile
  useEffect(() => {
    if (!isMobile && !isSidebarOpen) {
      setSidebarOpen(true);
    }
  }, [isMobile, isSidebarOpen]);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const openSidebar = () => {
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return {
    isSidebarOpen,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    isMobile,
  };
}
