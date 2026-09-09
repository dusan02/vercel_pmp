'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Building2 } from 'lucide-react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  fallback?: string;
  onError?: () => void;
}

export default function OptimizedImage({
  src,
  alt,
  width = 32,
  height = 32,
  className = '',
  priority = false,
  fallback,
  onError
}: OptimizedImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(src && src.trim() !== '' ? src : null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px',
        threshold: 0.1
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  const handleImageError = () => {
    setHasError(true);
    setIsLoading(false);
    if (fallback && imageSrc !== fallback) {
      setImageSrc(fallback);
      setHasError(false);
      setIsLoading(true);
    } else {
      onError?.();
    }
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  // Show loading skeleton
  if (!isInView) {
    return (
      <div
        ref={imgRef}
        className={`bg-gray-200 rounded ${className}`}
        style={{ width, height }}
      />
    );
  }

  // Show error fallback or if no src
  if ((hasError && !fallback) || !imageSrc) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center rounded ${className}`}
        style={{ width, height }}
        title={alt}
      >
        <Building2 size={Math.min(width, height) * 0.6} className="text-gray-400" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 rounded" />
      )}
      
      <Image
        src={imageSrc}
        alt={alt}
        width={width}
        height={height}
        className={`rounded transition-opacity duration-200 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        }`}
        priority={priority}
        onLoad={handleImageLoad}
        onError={handleImageError}
        sizes={`${width}px`}
        quality={85}
        unoptimized={true}
      />
    </div>
  );
} 