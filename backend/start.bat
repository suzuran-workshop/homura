@echo off
setlocal enabledelayedexpansion

REM Load environment variables from .env file
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        set "line=%%a"
        if not "!line:~0,1!"=="#" (
            if "%%b" neq "" (
                set "%%a=%%b"
            )
        )
    )
)

REM Start the backend server
suzuran-backend.exe
