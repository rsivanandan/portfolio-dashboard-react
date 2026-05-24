This folder is mounted as /data inside the container.

Place your investments.db here before starting the container.

To update your data:
1. Run setupdb.py locally to regenerate investments.db
2. Copy the new investments.db into this folder
3. The container picks it up immediately — no restart needed
