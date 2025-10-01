import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './TimeManipulation'; // Import the main App component

// Standard Tailwind CSS setup import (assuming setup)
import './index.css'; 

// Render the main application component
const container = document.getElementById('root');
const root = createRoot(container); 
root.render(
  <React.StrictMode>
      <App />
        </React.StrictMode>
        );

        // Optional: Register a Service Worker for true offline capability
        // For simplicity in this example, we skip service worker registration.

        