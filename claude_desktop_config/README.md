# Claude Desktop Configuration

This directory contains configuration files for testing the MCP server with Claude Desktop.

## Setup

1. **Build the project first**:
   ```bash
   npm run build
   ```

2. **Copy the configuration to Claude Desktop**:
   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

3. **Use the provided configuration**:
   ```bash
   cp claude_desktop_config/claude_desktop_config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

## Configuration Options

- **calorie-tracker**: Production build (requires `npm run build`)
- **calorie-tracker-dev**: Development build (runs TypeScript directly)

## Testing

After setting up the configuration:
1. Restart Claude Desktop
2. Start a new conversation
3. The calorie tracker tools should be available

## Alternative: Use MCP Inspector

For debugging and development, use the MCP Inspector instead:
```bash
npm run debug:dev  # Interactive debugging interface
```