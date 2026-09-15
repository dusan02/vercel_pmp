'use client';

import { useState } from 'react';

export default function TestPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Test Page</h1>
      <p>If you can see this, the application is working!</p>
      <div style={{ background: '#f0f0f0', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
        <h3>Status Check:</h3>
        <ul>
          <li>✅ Next.js is running</li>
          <li>✅ React is working</li>
          <li>✅ Basic styling is applied</li>
        </ul>
      </div>
      <a href="/" style={{ color: 'blue', textDecoration: 'underline' }}>
        ← Back to main page
      </a>
    </div>
  );
} 