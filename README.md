# EDUVERSE 3D — Multiplayer learning game starter

A mobile-friendly, browser-based multiplayer learning game starter. It is designed to run on Android, iPhone, tablets, and desktop browsers.

## Included in this starter
- Room creation and joining by room code
- Up to 40 players per room (server-enforced)
- Player nickname and avatar color
- Live player list and leaderboard via Socket.IO
- Teacher/host can start a quiz round
- Multiple-choice quiz questions and server-side answer scoring
- Responsive UI with a lightweight Three.js 3D lobby scene
- GitHub-ready project structure

> Honest status: this is a working starter/prototype, not the complete 20-game EDUVERSE product described in the specification. The other 19 game mechanics, production authentication, persistent database, teacher analytics/export, and full avatar customization are not implemented yet.

## Requirements
- Node.js 20 or newer
- npm
- A hosting service that supports a persistent Node.js process and WebSockets (for example Render, Railway, or a VPS)

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000 in a browser. Open the same address on other devices on the same Wi-Fi to test multiple players. For other devices, use your computer's LAN IP instead of `localhost`.

## Deploy
1. Create a GitHub repository and upload all files in this folder.
2. Create a Node.js web service on your preferred host and connect the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Set environment variable `NODE_VERSION` to `20` if your host requires it.
6. Open the public HTTPS URL on each phone. WebSockets are served from the same origin.

GitHub Pages alone cannot host the multiplayer server. Use GitHub for source control and a Node/WebSocket host for the live game.

## Room rules
- Rooms are created by the server.
- Room code is six characters.
- Maximum 40 players per room.
- The room creator is the host.
- The server validates answers and calculates scores.
- Room state is in memory in this starter; restarting the server clears active rooms. Add a database before production use.

## Security / production checklist
- Add authenticated teacher accounts and permissions.
- Add persistent storage (PostgreSQL or another database).
- Add rate limiting, moderation, and room abuse protections.
- Add automated tests and load-test 40 concurrent clients.
- Configure HTTPS at the hosting provider.
- Review privacy/data retention before use with students.

## Project structure
```text
eduverse3d-github/
├── server.js
├── package.json
├── .gitignore
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```
