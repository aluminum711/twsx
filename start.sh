#!/bin/bash

# Start backend server in the background
cd backend && npm start &

# Wait a moment for the backend to start (optional, but good practice)
sleep 5

cd stock-monitor && npm run build

# Start static file server for frontend build
cd ../stock-monitor/dist && npx serve -s .