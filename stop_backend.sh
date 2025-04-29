#!/bin/bash

PID_FILE="backend.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p $PID > /dev/null; then
    echo "Stopping backend server with PID $PID..."
    kill $PID
    # Optional: Wait a moment for the process to terminate
    # sleep 2
    echo "Backend server stopped."
  else
    echo "Backend PID file found, but process $PID not running."
  fi
  rm "$PID_FILE"
else
  echo "Backend PID file not found. Backend server may not be running."
fi