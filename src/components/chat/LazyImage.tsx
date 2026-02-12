import React from 'react';
import { useLazyImage } from '../../hooks/useIntersectionObserver';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  onLoad?: () => void;
  onError?: () => void;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className,
  style,
  placeholder,
  onLoad,
  onError,
}) => {
  const { targetRef, imageSrc, isLoading, error } = useLazyImage(src);

  const handleLoad = () => {
    onLoad?.();
  };

  const handleError = () => {
    onError?.();
  };

  if (isLoading) {
    return (
      <div
        ref={targetRef as React.RefObject<HTMLDivElement>}
        className={className}
        style={{ ...style, backgroundColor: 'var(--bg-secondary)' }}
      >
        {placeholder || (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <div className="loading-spinner" />
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div
        ref={targetRef as React.RefObject<HTMLDivElement>}
        className={className}
        style={{
          ...style,
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--danger)',
        }}
      >
        加载失败
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      style={style}
      onLoad={handleLoad}
      onError={handleError}
      loading="lazy"
    />
  );
};

export default LazyImage;
