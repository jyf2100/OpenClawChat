import { useEffect, useRef, useState } from 'react';

export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, {
      threshold: 0,
      rootMargin: '0px',
      ...options,
    });

    const currentTarget = targetRef.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [options]);

  return [targetRef, isIntersecting] as const;
}

export function useLazyImage(src: string, options?: IntersectionObserverInit) {
  const [imageSrc, setImageSrc] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [targetRef, isIntersecting] = useIntersectionObserver(options);

  useEffect(() => {
    if (isIntersecting && src) {
      const img = new Image();
      img.src = src;

      img.onload = () => {
        setImageSrc(src);
        setIsLoading(false);
      };

      img.onerror = (err) => {
        setError(err);
        setIsLoading(false);
      };

      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }
  }, [isIntersecting, src]);

  return { targetRef, imageSrc, isLoading, error };
}
