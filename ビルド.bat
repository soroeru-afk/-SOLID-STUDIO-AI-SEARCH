@echo off
title SOLID STUDIO AI SEARCH - BUILD & SINGLEFILE
echo Building production assets...
cmd /c "npm run build"
echo Copying to Run_AI_Search.html...
node -e "const fs = require('fs'); fs.copyFileSync('dist/index.html', 'Run_AI_Search.html');"
echo Done!
pause
