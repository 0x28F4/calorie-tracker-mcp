# Development Guide

Quick guide for running and debugging the Calorie Tracker MCP server.

## 🚀 Quick Start

```bash
npm install
npm run build
```

## 📡 Transport Options

### Stdio Transport (Local Development)
```bash
# Required: USER_ID environment variable
USER_ID=alice npm run start          # Production
USER_ID=alice npm run debug          # With MCP Inspector
```

**Usage:**
- Local development and testing
- Claude Desktop integration  
- Single user per server instance
- MCP Inspector debugging

### HTTP Transport (Remote Access)
```bash
npm run start:http                   # Production (port 3000)
npm run debug:http                   # Build and run HTTP server
npm run debug:http:user              # With debug USER_ID injection
```

**Usage:**
- Remote access and deployment
- Multi-user support
- Requires `X-User-ID` header in requests
- Each user gets isolated session
- Optional: Set `USER_ID` to auto-inject header for testing

## 🔧 Configuration

**Environment Variables:**
- `TRANSPORT`: `stdio` (default) or `http`
- `USER_ID`: Required for stdio, optional for HTTP (debug middleware)
- `PORT`: HTTP port (default: 3000)
- `DATABASE_PATH`: SQLite path (default: data/calorie_tracker.db)

## 🧪 Testing

### Claude Desktop
```json
{
  "mcpServers": {
    "calorie-tracker": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": { "USER_ID": "your-user-id" }
    }
  }
}
```

### HTTP Testing
HTTP transport requires `X-User-ID` header. For MCP Inspector testing, use `npm run debug:http:user` which automatically injects the header via middleware.

## 🛠️ Available Tools

- **`add_meal`**: Log meals with calories and optional macros
- **`get_today_summary`**: Daily calorie/nutrition summary  
- **`check_weight`**: Log weight or view history

## 🐛 Debugging & Logs

### Logging
The server logs all important events including:
- Session creation/termination (HTTP)
- Tool calls and results
- Database operations
- Errors and warnings
- Debug middleware activity

**View live logs:**
```bash
tail -f data/calorie_tracker.log
```

### Common Issues

- **"USER_ID environment variable is required"**: Set USER_ID for stdio transport
- **"X-User-ID header is required"**: Include header for HTTP requests or use debug middleware
- **"Invalid session ID"**: Reinitialize HTTP session

## 📊 Database

SQLite database at `data/calorie_tracker.db` with user isolation via `user_id` column.

```bash
sqlite3 data/calorie_tracker.db
SELECT * FROM meals WHERE user_id = 'alice';
```