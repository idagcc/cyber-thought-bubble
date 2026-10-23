import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
import './kiosk.css';
import './carnival.css';
window.stationFullscreen?.(fullscreen=>document.documentElement.classList.toggle('station-fullscreen',fullscreen));
document.addEventListener('fullscreenchange',()=>document.documentElement.classList.toggle('browser-fullscreen',Boolean(document.fullscreenElement)));
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
