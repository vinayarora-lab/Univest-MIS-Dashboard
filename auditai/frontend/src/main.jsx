import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { DateRangeProvider } from './context/DateRangeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DateRangeProvider>
        <App />
      </DateRangeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
