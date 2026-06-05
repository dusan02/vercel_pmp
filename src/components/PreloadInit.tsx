'use client';
import { useEffect } from 'react';

export default function PreloadInit() {
  useEffect(() => {
    console.log('PreloadInit component mounted');
  }, []);

  return null;
} 