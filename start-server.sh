#!/bin/bash

docker start local-mongo
# Name of the session
SESSION="my_project"

# Start a new tmux session, but don't attach to it yet
tmux new-session -d -s $SESSION

# Setup the first pane (Client)
tmux send-keys -t $SESSION "cd ~/work/test-preny/client && npm run dev" C-m

# Split the window vertically and setup the second pane (Server)
tmux split-window -h -t $SESSION
tmux send-keys -t $SESSION "cd ~/work/test-preny/server && source venv/bin/activate && python app.py" C-m

# Open the session
tmux attach-session -t $SESSION
