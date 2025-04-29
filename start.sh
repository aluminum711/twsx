#!/bin/bash

# Start backend server in the background
cd backend && npm start & echo $! > ../backend.pid

# Wait a moment for the backend to start (optional, but good practice)
sleep 5

cd stock-monitor && npm run build

# Start static file server for frontend build
FRONTEND_PORT=55555
if nc -z localhost $FRONTEND_PORT; then
  echo "Error: Port $FRONTEND_PORT is already in use. Please close the application using that port or run stop.sh"
  exit 1
fi

cd ../stock-monitor && npx vite preview --port $FRONTEND_PORT & echo $! > ../frontend.pid