# shengshengweb

shengshengweb is a lightweight worksite for team collaboration. It includes media management, review workflow, todo tracking, team management, and device borrowing features. The backend is built with `Node.js + Express`, and data is stored locally in `SQLite`. Images and videos are saved directly on the server disk.

## Features

- Media library: browse, filter, and search images and videos
- Review center: approve, reject, and add notes
- Todo list: add, complete, and delete tasks
- Inbox sync: automatically scan `server/uploads/inbox`
- Admin login: protects write operations
- Runtime status: shows sync state, login state, and basic system info

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment variables

```bash
copy .env.example .env
```

3. Start the app

```bash
npm run dev
```

4. Open the site

```text
http://127.0.0.1:3002
```

For phones or other computers on the same LAN, use:

```text
http://<your-local-ip>:3002
```

The server listens on `0.0.0.0` by default. If external devices cannot connect, check whether your firewall allows port `3002`.

## Deployment

- Node.js 18+
- Install production dependencies: `npm install --omit=dev`
- Start the service: `npm run start`
- Use PM2: `npm run pm2:start`

## Data Directories

- Database: `server/data/studio.sqlite`
- Uploaded images: `server/uploads/media`
- Inbox directory: `server/uploads/inbox`

## Default Admin Account

The admin credentials are controlled by these `.env` variables:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Change the default password before going live.

## Troubleshooting

If the site does not open correctly, check the following first:

- The service is running
- `PORT` in `.env` is still `3002`
- `server/data/studio.sqlite` exists
- `server/uploads/` has write permission

If GitHub still shows stale content, refresh the page or confirm that the latest commit has been pushed successfully.
