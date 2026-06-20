@echo off
setlocal

start "Tank Arena Backend Debug" /D "%~dp0backend" cmd /k npm run start:debug
start "Tank Arena Frontend" /D "%~dp0frontend" cmd /k npm run start
