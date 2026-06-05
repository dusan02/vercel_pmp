'use client';
import { useEffect } from 'react';

export default function PwaInit() {
  useEffect(() => {
    console.log('PwaInit component mounted');
  }, []);

  return null;           // nič nevykresľuje
} 