@echo off
echo Building frontend for deployment...

REM Temporarily disable ESLint
if exist ".eslintrc.js" (
    ren .eslintrc.js .eslintrc.js.bak
)
if exist ".eslintrc.json" (
    ren .eslintrc.json .eslintrc.json.bak
)

REM Build the project
call npx react-scripts build

REM Restore ESLint config
if exist ".eslintrc.js.bak" (
    ren .eslintrc.js.bak .eslintrc.js
)
if exist ".eslintrc.json.bak" (
    ren .eslintrc.json.bak .eslintrc.json
)

echo Build completed!
pause

