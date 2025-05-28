import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import ReactDOM from 'react-dom';

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter basename="/shopify-watch/">
        <App />
      </BrowserRouter>
    </React.StrictMode>,
);
