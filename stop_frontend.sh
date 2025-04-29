#!/bin/bash

PID_FILE="frontend.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p $PID > /dev/null; then
    echo "Stopping frontend server with PID $PID..."
    kill $PID
    # Optional: Wait a moment for the process to terminate
    # sleep 2
    echo "Frontend server stopped."
  else
    echo "Frontend PID file found, but process $PID not running."
  fi
  rm "$PID_FILE"
else
  echo "Frontend PID file not found. Frontend server may not be running."
fi