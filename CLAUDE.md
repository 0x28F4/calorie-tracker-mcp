# Development Guidelines

This is a TypeScript-based MCP (Model Context Protocol) server for calorie tracking via Claude. The project emphasizes functional programming patterns over object-oriented approaches.

## Pre-Commit Workflow

**ALWAYS run these commands before committing:**

```bash
npm run check-all
```

Or run individually:
```bash
npm run type-check    # TypeScript compilation check
npm run lint:check    # ESLint validation
npm run format:check  # Prettier formatting check
```

**Auto-fix issues before committing:**
```bash
npm run fix-all
```

Or run individually:
```bash
npm run lint     # Fix linting issues automatically
npm run format   # Format code with Prettier
```

## Build & Development Commands

```bash
npm run dev         # Start development server with hot reload
npm run build       # Compile TypeScript to JavaScript
npm run start       # Run compiled JavaScript
npm run clean       # Remove dist/ directory
npm run type-check  # TypeScript compilation without emit
```

## Debugging with MCP Inspector

Use the MCP Inspector to test and debug your MCP server:

```bash
npm run debug       # Debug compiled server (build + inspect)
```

The MCP Inspector provides:
- **Tools tab**: Test MCP tools interactively
- **Resources tab**: View available resources
- **Prompts tab**: Test prompt templates
- **Connection monitoring**: See real-time MCP messages

**Inspector workflow**:
1. Start server with inspector: `npm run debug`
2. Test tools in the Tools tab
3. Verify server responses
4. Debug any issues with real-time message monitoring

## Code Style Guidelines

### Programming Paradigm
- **Prefer functional programming** over object-oriented programming
- Use pure functions whenever possible
- Avoid classes unless absolutely necessary
- Favor composition over inheritance
- Use immutable data structures where practical

### TypeScript Best Practices
- Always provide explicit return types for functions
- Use strict TypeScript settings (already configured)
- Prefer `const` over `let`, avoid `var`
- Use type guards for runtime type checking
- Leverage discriminated unions for state management

### Naming Conventions
- Use descriptive function names: `addMealEntry` not `add`
- Prefer verbs for functions: `calculateDeficit`, `validateInput`
- Use camelCase for variables and functions
- Use PascalCase for types and interfaces
- Use SCREAMING_SNAKE_CASE for constants

## File Organization

```
src/
├── tools/          # MCP tool implementations
├── db/             # Database layer (SQLite)
├── config/         # Configuration management
├── types/          # TypeScript type definitions
└── utils/          # Pure utility functions
```

## Libraries Used

### Core Dependencies
- **@modelcontextprotocol/sdk** - Official MCP SDK for TypeScript
- **sqlite3** - SQLite database driver
- **@types/sqlite3** - TypeScript definitions for sqlite3

### Development Dependencies
- **TypeScript** - Type-safe JavaScript
- **ESLint** - Code linting with TypeScript support
- **Prettier** - Code formatting
- **nodemon** - Development hot reload
- **ts-node** - TypeScript execution for development

### Planned Dependencies
- **zod** - Runtime type validation and schema definition
- **date-fns** - Functional date utility library ✅ (Added for clean date formatting and manipulation)

## Naming Conventions

### File Naming
- **Use underscores in file names** - prefer `calorie_tracker.db` over `calorie-tracker.db`
- **Database files**: `calorie_tracker.db`, `calorie_tracker.log`
- **Source files**: Follow existing patterns with camelCase for variables/functions
