# Development Guide

This guide covers how to run, debug, and test the Calorie Tracker MCP server with both stdio and HTTP transports.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm
- Claude Desktop (for stdio testing)

### Installation
```bash
npm install
npm run build
```

## 📡 Transport Options

The MCP server supports two transport protocols:

1. **Stdio Transport** - For local development with Claude Desktop/MCP Inspector
2. **HTTP Transport** - For remote access and production deployment

Transport selection is controlled by the `TRANSPORT` environment variable.

## 🖥️ Stdio Transport

### When to Use
- Local development and testing
- Integration with Claude Desktop
- Single-user scenarios
- Debugging with MCP Inspector

### Running Stdio Transport

#### Production Mode
```bash
# Use default user (user-1)
npm run start

# Use custom user ID
USER_ID=alice npm run start
```

#### Debug Mode (with MCP Inspector)
```bash
# Debug with default user
npm run debug

# Debug with custom user ID  
USER_ID=alice npm run debug
```

### User ID Configuration
- **Environment Variable**: `USER_ID` (defaults to "user-1")
- **Single User**: One user per server instance
- **Session**: Entire stdio session uses the same user ID

### Claude Desktop Integration

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "calorie-tracker": {
      "command": "node",
      "args": ["/path/to/calorie-tracker-mcp/dist/index.js"],
      "env": {
        "USER_ID": "your-user-id"
      }
    }
  }
}
```

### Testing with MCP Inspector

The MCP Inspector provides a web interface for testing tools:

```bash
npm run debug
```

This will:
1. Build the project
2. Start the MCP server with stdio transport
3. Launch the MCP Inspector in your browser
4. Connect the inspector to your server

You can then:
- View available tools
- Test tool calls with sample data
- See request/response messages
- Debug tool implementations

## 🌐 HTTP Transport

### When to Use
- Remote access from anywhere
- Multi-user scenarios
- Production deployment
- Integration with external clients

### Running HTTP Transport

#### Production Mode
```bash
# Start HTTP server on default port 3000
npm run start:http

# Start on custom port
PORT=8080 npm run start:http
```

#### Debug Mode
```bash
# Debug HTTP server (no MCP Inspector - HTTP only)
npm run debug:http
```

### User ID Configuration
- **HTTP Header**: `X-User-ID` (required)
- **Multi-User**: Each HTTP session can have different user ID
- **Session Isolation**: Each user gets their own MCP server instance

### Testing HTTP Transport

#### Health Check
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "protocol": "MCP",
  "version": "2025-03-26",
  "transport": "Streamable HTTP"
}
```

#### Initialize MCP Session
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-User-ID: alice" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize", 
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {}
    },
    "id": 1
  }'
```

#### List Available Tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-User-ID: alice" \
  -H "mcp-session-id: <session-id-from-initialize>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

#### Call a Tool
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-User-ID: alice" \
  -H "mcp-session-id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "add_meal",
      "arguments": {
        "mealName": "Breakfast",
        "calories": 350
      }
    },
    "id": 3
  }'
```

### HTTP Session Management

#### Session Creation
1. Client sends initial request with `X-User-ID` header
2. Server creates new MCP server instance bound to that user ID
3. Server generates unique session ID
4. Both stored in server memory maps

#### Session Usage
1. Client includes `mcp-session-id` header in subsequent requests
2. Server looks up the user's MCP server instance
3. All tool calls use the bound user ID automatically

#### Session Cleanup
- Sessions are automatically cleaned up when transport closes
- Server logs session creation and termination

## 🔍 Available Tools

All tools work identically on both transports:

### `add_meal`
Add a meal entry with calories and optional macros.

**Parameters:**
- `mealName` (string, required): Name of the meal
- `calories` (number, required): Total calories
- `proteinGrams` (number, optional): Protein content in grams
- `carbsGrams` (number, optional): Carbohydrate content in grams  
- `fatGrams` (number, optional): Fat content in grams
- `loggedAt` (string, optional): ISO timestamp when consumed

### `get_today_summary`
Get summary of calories and nutrition for a specific date.

**Parameters:**
- `date` (string, optional): Date in YYYY-MM-DD format (defaults to today)

### `check_weight`
Add/update weight entry or view recent weight history.

**Parameters:**
- `weightKg` (number, optional): Weight in kilograms to log
- `loggedAt` (string, optional): Date in YYYY-MM-DD format (defaults to today)

If `weightKg` is not provided, shows recent weight history instead.

## 🐛 Debugging Tips

### Common Issues

#### "X-User-ID header is required"
- **HTTP Transport Only**: Must include `X-User-ID` header in all requests
- **Solution**: Add header with your user identifier

#### "Invalid session ID"
- **HTTP Transport Only**: Session ID not found or expired
- **Solution**: Initialize a new session or check session ID spelling

#### Tool not found
- **Both Transports**: MCP server not properly initialized
- **Solution**: Check server logs, ensure proper transport connection

### Logging

The server logs important events:
- Session creation/termination (HTTP)
- Tool calls and results
- Database operations
- Errors and warnings

Logs are written to console and `data/calorie_tracker.log`.

### Development Workflow

1. **Start with stdio**: Use MCP Inspector for initial development
2. **Test tools individually**: Verify each tool works correctly
3. **Switch to HTTP**: Test remote access and multi-user scenarios
4. **Concurrent testing**: Run multiple clients simultaneously

## 🧪 Testing Multi-User Scenarios

### HTTP Transport Multi-User Testing

Test user isolation by running multiple concurrent sessions:

```bash
# Terminal 1: Start server
npm run start:http

# Terminal 2: User Alice
curl -X POST http://localhost:3000/mcp \
  -H "X-User-ID: alice" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{}},"id":1}'

# Terminal 3: User Bob  
curl -X POST http://localhost:3000/mcp \
  -H "X-User-ID: bob" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{}},"id":1}'
```

Each user will get:
- Separate session IDs
- Separate MCP server instances  
- Isolated data (meals, weights, settings)
- No cross-contamination between users

## 📊 Database Files

Both transports share the same SQLite database:
- **Database**: `data/calorie_tracker.db`
- **Logs**: `data/calorie_tracker.log`
- **User Isolation**: Data separated by `user_id` column

You can inspect the database directly:
```bash
sqlite3 data/calorie_tracker.db
.tables
SELECT * FROM meals WHERE user_id = 'alice';
```

## 🔧 Configuration

### Environment Variables

- `TRANSPORT`: `stdio` (default) or `http`
- `PORT`: HTTP server port (default: 3000)
- `USER_ID`: User ID for stdio transport (default: user-1)
- `DATABASE_PATH`: SQLite database path (default: data/calorie_tracker.db)

### Example Configurations

**Local Development:**
```bash
TRANSPORT=stdio USER_ID=developer npm run debug
```

**Production HTTP:**
```bash
TRANSPORT=http PORT=8080 npm run start
```

**Docker:**
```bash
docker run -e TRANSPORT=http -e PORT=3000 -p 3000:3000 calorie-tracker-mcp
```

## 🚀 Next Steps

- **Production Deployment**: See deployment guides for Docker/Kubernetes
- **Authentication**: Consider adding proper auth for internet-facing deployments
- **Monitoring**: Add metrics and health checks for production use
- **Analytics**: Implement advanced reporting and analytics tools