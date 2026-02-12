/**
 * 图片预览模态框组件
 */

import React, { useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

export interface ImagePreviewProps {
  imageUrl: string;
  alt?: string;
  onClose: () => void;
}

/**
 * 图片预览模态框
 */
export function ImagePreview({ imageUrl, alt = '图片预览', onClose }: ImagePreviewProps) {
  // ESC 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // 防止背景滚动
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // 点击背景关闭
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const content = (
    <div
      className="image-preview-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        cursor: 'zoom-out',
      }}
    >
      <div
        className="image-preview-content"
        style={{
          position: 'relative',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="image-preview-close"
          style={{
            position: 'absolute',
            top: '-40px',
            right: 0,
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-normal)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            transition: 'background-color 0.1s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          }}
        >
          ×
        </button>

        {/* 图片 */}
        <img
          src={imageUrl}
          alt={alt}
          style={{
            maxWidth: '100%',
            maxHeight: 'calc(90vh - 60px)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
        />
      </div>
    </div>
  );

  // 使用 ReactDOM.createPortal 渲染到 body
  return ReactDOM.createPortal(content, document.body);
}

/**
 * 导出一个默认组件
 */
export default ImagePreview;
