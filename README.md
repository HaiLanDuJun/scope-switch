# ScopeSwitch

ScopeSwitch is a portable Windows proxy scope switcher for AI tools.

It keeps three common proxy strategies in one local panel:

- Global proxy variables for the current Windows user.
- Claude Code local bypass for `localhost`, `127.0.0.1`, and `::1`.
- Per-app proxy launchers for tools such as Agy, Codex, Cursor, or any custom command.

ScopeSwitch is intentionally not a full AI API gateway. It focuses on the part that often breaks local AI workflows on Windows: deciding which process should use which proxy scope, then generating repeatable scripts for a new machine.

## Why

Many AI coding tools read proxy configuration from environment variables:

```text
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
NO_PROXY=localhost,127.0.0.1,::1
```

That is simple until different tools need different behavior:

- Agy should use `127.0.0.1:7890`.
- Claude Code may point to a local gateway such as `http://127.0.0.1:8787`.
- A global proxy can accidentally route Claude's local gateway request through the proxy and cause `502` errors.
- A new Windows machine may not have any of the helper scripts yet.

ScopeSwitch turns those cases into explicit modes instead of scattered `.cmd`, `.ps1`, and settings edits.

## Features

- Toggle user-level `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, and `https_proxy`.
- Set custom proxy scheme, host, and port.
- Write Claude Code `NO_PROXY/no_proxy` bypass rules into `~\.claude\settings.json`.
- Generate Claude/TokenRhythm local gateway scripts.
- Generate global proxy toggle scripts.
- Create per-app launch scripts that inject proxy variables only into that process.
- Add custom software or API profiles from the UI.
- Back up overwritten files into `generated\backups`.
- Keep local machine state out of Git with `data/config.json`.

## Quick Start

Requirements:

- Windows
- Node.js 18 or newer

Run:

```powershell
cd scope-switch
.\start.cmd
```

The app opens:

```text
http://127.0.0.1:17787
```

You can also run:

```powershell
npm start
```

## Portable Runtime

For a copy-and-run package, place a portable Node binary here:

```text
runtime\node.exe
```

`start.cmd` uses `runtime\node.exe` first when it exists, then falls back to the system `node`.

## Configuration

Runtime configuration lives at:

```text
data/config.json
```

This file is intentionally ignored by Git because it can contain local paths and machine-specific tool commands.

Use this as the shareable template:

```text
data/config.example.json
```

## Open Source

ScopeSwitch is released under the MIT License.

## Project Status

This is an early local-first Windows utility. The current implementation is dependency-free Node.js plus static HTML/CSS/JavaScript.
